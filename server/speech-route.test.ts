import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { demoProvider } from './provider.js';

async function fixture(synthesizeSpeech: Parameters<typeof createApp>[1]['synthesizeSpeech'], run: (request: (path: string, body?: unknown, owner?: string, method?: string) => Promise<Response>) => Promise<void>) {
  const app = createApp(demoProvider, { synthesizeSpeech, authenticate: async req => req.get('X-Test-Owner') ?? null });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    await run((path, body, owner = 'a', method) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', ...(owner ? { 'X-Test-Owner': owner } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } finally { app.locals.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const start = { scenarioId: 'shop', actionId: 'ask', adultConfirmed: true };
async function newSession(request: Parameters<Parameters<typeof fixture>[1]>[0]) {
  const scenarios = await (await request('/scenarios')).json();
  const scenario = scenarios.scenarios[0];
  const r = await request('/sessions', { ...start, scenarioId: scenario.id, actionId: scenario.actions.find((a: { endOnSelection?: string }) => !a.endOnSelection).id });
  assert.equal(r.status, 201); return (await r.json()).session;
}

test('speech reads owned stored reply, caches replay and rejects arbitrary text/user/old index', async () => {
  let calls = 0;
  await fixture(async text => { calls++; assert.ok(text); return 'SUQz'; }, async request => {
    const session = await newSession(request), path = `/sessions/${session.id}/speech`;
    assert.equal((await request(path, { messageIndex: 0 }, '')).status, 401);
    assert.equal((await request(path, { messageIndex: 0 }, 'b')).status, 404);
    assert.equal((await request(path, { messageIndex: 0, text: 'arbitrary' })).status, 400);
    assert.equal((await request(path, { messageIndex: -1 })).status, 400);
    for (let i = 0; i < 2; i++) { const r = await request(path, { messageIndex: 0 }); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { audioContent: 'SUQz' }); }
    assert.equal(calls, 1);
    await request(`/sessions/${session.id}/messages`, { text: 'こんにちは' });
    assert.equal((await request(path, { messageIndex: 0 })).status, 409);
    assert.equal((await request(path, { messageIndex: 1 })).status, 409);
    assert.equal((await request(path, { messageIndex: 2 })).status, 200);
    assert.equal(calls, 2);
  });
});
test('disabled speech preserves text conversation and reports unavailable', async () => {
  await fixture(undefined, async request => { const session = await newSession(request); assert.equal((await request(`/sessions/${session.id}/speech`, { messageIndex: 0 })).status, 503); assert.equal((await request(`/sessions/${session.id}/messages`, { text: 'こんにちは' })).status, 200); });
});
for (const action of ['end', 'delete', 'advance']) {
  test(`late audio is discarded after ${action}`, async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    await fixture(async () => { entered(); await pending; return 'SUQz'; }, async request => {
      const session = await newSession(request), path = `/sessions/${session.id}`;
      const audio = request(`${path}/speech`, { messageIndex: 0 }); await started;
      assert.equal((await request(`${path}/speech`, { messageIndex: 0 })).status, 429);
      if (action === 'end') await request(`${path}/end`, { reason: 'emergency' });
      if (action === 'delete') await request(path, undefined, 'a', 'DELETE');
      if (action === 'advance') await request(`${path}/messages`, { text: 'こんにちは' });
      release(); const result = await audio;
      assert.equal(result.status, action === 'delete' ? 404 : 409);
      assert.ok(!(await result.text()).includes('SUQz'));
    });
  });
}
test('upstream errors are generic and per-session retry bursts are temporarily capped', async () => {
  let calls = 0;
  await fixture(async () => { calls++; throw new Error('secret'); }, async request => {
    const session = await newSession(request);
    for (let i = 0; i < 8; i++) { const r = await request(`/sessions/${session.id}/speech`, { messageIndex: 0 }); assert.equal(r.status, 502); assert.ok(!(await r.text()).includes('secret')); }
    assert.equal((await request(`/sessions/${session.id}/speech`, { messageIndex: 0 })).status, 429); assert.equal(calls, 8);
  });
});
