import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { demoProvider, type Provider } from './provider.js';
import { scenarios } from '../shared/scenarios.js';

async function withApp(provider: Provider, run: (base: string, dispose: () => void) => Promise<void>, options: Parameters<typeof createApp>[1] = {}) {
  const app = createApp(provider, { authenticate: async () => "fixture", ...options });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`, app.locals.dispose);
  } finally {
    app.locals.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
const post = (base: string, route: string, body: unknown, owner = 'alice') => fetch(base + route, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Owner': owner }, body: JSON.stringify(body),
});
const start = async (base: string) => (await (await post(base, '/api/sessions', {
  scenarioId: scenarios[0].id, actionId: scenarios[0].actions[0].id, adultConfirmed: true,
})).json()).session.id as string;
const message = (base: string, id: string, requestId: unknown = 'turn-1', text = 'こんにちは', owner = 'alice') => post(base, `/api/sessions/${id}/messages`, { text, requestId }, owner);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

test('lost response retry does not generate or append twice, and returns current state', async () => {
  let calls = 0;
  await withApp({ ...demoProvider, async reply() { calls++; return '返答'; } }, async base => {
    const id = await start(base);
    await message(base, id); // Simulate the client losing/discarding a successful response.
    assert.equal((await (await message(base, id, 'turn-1', ' こんにちは ')).json()).session.turnCount, 1);
    assert.equal(calls, 1);
    assert.equal((await message(base, id, 'turn-1', '違う内容')).status, 409);
    await message(base, id, 'turn-2');
    const replay = await (await message(base, id)).json();
    assert.equal(replay.session.turnCount, 2); assert.equal(replay.session.messages.length, 5);
    await post(base, `/api/sessions/${id}/end`, { reason: 'emergency' });
    assert.equal((await (await message(base, id)).json()).session.status, 'interrupted');
    assert.equal(calls, 2);
  });
});

test('in-flight duplicate and conflicting payload do not consume generation capacity', { timeout: 5000 }, async () => {
  const entered = deferred(), release = deferred(); let calls = 0;
  await withApp({ ...demoProvider, async reply() { calls++; entered.resolve(); await release.promise; return '返答'; } }, async base => {
    const id = await start(base), pending = message(base, id);
    await entered.promise;
    try {
      const duplicate = await message(base, id);
      assert.equal(duplicate.status, 409); assert.equal(duplicate.headers.get('retry-after'), '1');
      assert.equal((await message(base, id, 'turn-1', '別の発言')).status, 409);
      assert.equal((await message(base, id, 'turn-2')).status, 409);
    } finally { release.resolve(); }
    assert.equal((await pending).status, 200);
    assert.equal((await (await message(base, id)).json()).session.turnCount, 1);
    assert.equal(calls, 1);
  }, { maxConcurrentGenerations: 1 });
});

test('provider failure releases key and legacy requests remain independent', async () => {
  let calls = 0;
  await withApp({ ...demoProvider, async reply() { if (++calls === 1) throw Error('failed'); return '返答'; } }, async base => {
    const id = await start(base);
    assert.equal((await message(base, id)).status, 502);
    assert.equal((await (await message(base, id)).json()).session.turnCount, 1);
    for (let i = 0; i < 2; i++) assert.equal((await post(base, `/api/sessions/${id}/messages`, { text: 'こんにちは' })).status, 200);
    assert.equal((await (await message(base, id)).json()).session.turnCount, 3);
    assert.equal(calls, 4);
  });
});

test('final turn remains deduplicated when automatic reflection fails', async () => {
  let calls = 0;
  await withApp({ ...demoProvider, async reply() { calls++; return '返答'; }, async reflect() { throw Error('reflection failed'); } }, async base => {
    const id = await start(base);
    for (let i = 1; i <= 20; i++) assert.equal((await message(base, id, `turn-${i}`)).status, 200);
    const replay = await message(base, id, 'turn-20');
    assert.equal(replay.status, 200);
    const body = await replay.json();
    assert.equal(body.session.turnCount, 20); assert.equal(body.session.status, 'completed'); assert.equal(body.reflection, null);
    assert.equal(calls, 20);
  });
});

test('request IDs are validated, scoped to session, and protected by ownership', async () => {
  await withApp(demoProvider, async base => {
    const id = await start(base), other = await start(base);
    for (const invalid of ['', ' ', 'a'.repeat(129), 1, null, 'bad/key']) assert.equal((await message(base, id, invalid)).status, 400);
    assert.equal((await message(base, id, '__proto__')).status, 200);
    assert.equal((await message(base, id, '__proto__', 'こんにちは', 'bob')).status, 404);
    assert.equal((await (await message(base, other, '__proto__')).json()).session.turnCount, 1);
  }, { authenticate: async req => req.header('X-Test-Owner') ?? null });
});

for (const boundary of ['expire', 'delete', 'dispose'] as const) {
  test(`committed retries respect ${boundary}`, async () => {
    let now = 0;
    await withApp(demoProvider, async (base, dispose) => {
      const id = await start(base); await message(base, id);
      if (boundary === 'expire') now = 101;
      if (boundary === 'delete') await fetch(`${base}/api/sessions/${id}`, { method: 'DELETE' });
      if (boundary === 'dispose') dispose();
      assert.equal((await message(base, id)).status, boundary === 'dispose' ? 503 : 404);
    }, { now: () => now, ttlMs: 100 });
  });
}
