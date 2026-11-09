import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { demoProvider, type Provider } from './provider.js';
import { loadServerConfig } from './config.js';
import { scenarios } from '../shared/scenarios.js';

async function withApp(provider: Provider, run: (base: string) => Promise<void>, options: Parameters<typeof createApp>[1] = {}) {
  const app = createApp(provider, { authenticate: async () => "fixture", ...options });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    app.locals.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
const post = (base: string, route: string, body: unknown) => fetch(base + route, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const start = (base: string) => post(base, '/api/sessions', {
  scenarioId: scenarios[0].id, actionId: scenarios[0].actions[0].id, adultConfirmed: true,
});
const release = (base: string, id: string) => fetch(`${base}/api/sessions/${id}`, { method: 'DELETE' });

for (const reason of ['finish', 'respect', 'emergency'] as const) {
  test(`explicit release frees ${reason} session without prematurely removing reflection`, async () => {
    await withApp(demoProvider, async base => {
      const id = (await (await start(base)).json()).session.id;
      await post(base, `/api/sessions/${id}/end`, { reason });
      if (reason !== 'emergency') {
        assert.equal((await post(base, `/api/sessions/${id}/reflection`, {})).status, 200);
      }
      assert.equal((await start(base)).status, 503);
      const deleted = await release(base, id);
      assert.equal(deleted.status, 204); assert.equal(await deleted.text(), '');
      assert.equal((await release(base, id)).status, 204);
      assert.equal((await post(base, `/api/sessions/${id}/reflection`, {})).status, 404);
      assert.equal((await start(base)).status, 201);
    }, { maxSessions: 1 });
  });
}

test('release is idempotent for unknown and expired sessions', async () => {
  let now = 0;
  await withApp(demoProvider, async base => {
    const id = (await (await start(base)).json()).session.id;
    now = 101;
    assert.equal((await release(base, id)).status, 204);
    assert.equal((await release(base, 'unknown')).status, 204);
  }, { now: () => now, ttlMs: 100 });
});

for (const stage of ['reply', 'reflection'] as const) {
  test(`release during ${stage} suppresses late response and preserves generation capacity`, { timeout: 5000 }, async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(r => { resolve = r; });
    let entered!: () => void;
    const began = new Promise<void>(r => { entered = r; });
    const provider: Provider = { ...demoProvider, mode: 'gemini',
      async reply() { if (stage === 'reply') { entered(); await pending; } return 'late-private-reply'; },
      async reflect() { entered(); await pending; return { source: 'gemini', observation: 'late-private-reflection', suggestion: '参考', quote: null }; },
    };
    await withApp(provider, async base => {
      const id = (await (await start(base)).json()).session.id;
      if (stage === 'reflection') {
        await post(base, `/api/sessions/${id}/messages`, { text: 'こんにちは' });
        await post(base, `/api/sessions/${id}/end`, { reason: 'finish' });
      }
      const result = post(base, `/api/sessions/${id}/${stage === 'reply' ? 'messages' : 'reflection'}`, { text: '架空の発言' });
      await began;
      assert.equal((await release(base, id)).status, 204);
      const next = (await (await start(base)).json()).session.id;
      assert.equal((await post(base, `/api/sessions/${next}/messages`, { text: '新しい声かけ' })).status, 503);
      resolve();
      const response = await result;
      assert.equal(response.status, 404); assert.doesNotMatch(await response.text(), /late-private/);
      assert.equal((await post(base, `/api/sessions/${id}/end`, { reason: 'finish' })).status, 404);
    }, { maxSessions: 1, maxConcurrentGenerations: 1 });
  });
}

test('release remains available after request rate limit', async () => {
  await withApp(demoProvider, async base => {
    const id = (await (await start(base)).json()).session.id;
    for (let n = 0; n < 90; n++) await fetch(base + '/api/config');
    assert.equal((await fetch(base + '/api/config')).status, 429);
    assert.equal((await release(base, id)).status, 204);
    assert.equal((await release(base, id)).status, 204);
  });
});

test('configured session TTL never exceeds the advertised maximum of thirty minutes', () => {
  assert.equal(loadServerConfig({}).app.ttlMs, 1800000);
  assert.equal(loadServerConfig({ SESSION_TTL_SECONDS: '1' }).app.ttlMs, 1000);
  assert.equal(loadServerConfig({ SESSION_TTL_SECONDS: '1800' }).app.ttlMs, 1800000);
  for (const value of ['0', '1801', '3600', '-1', '1.5']) {
    assert.throws(() => loadServerConfig({ SESSION_TTL_SECONDS: value }), /SESSION_TTL_SECONDS/);
  }
});


// Demo reflections are normally immediate, but the Provider contract is async.
// Exercise both automatic paths with a delayed provider rather than relying on timing.
for (const stage of ['end', 'turn-limit'] as const) {
  for (const invalidation of ['release', 'expiry', 'dispose'] as const) {
    test(`automatic demo ${stage} reflection suppresses results after ${invalidation}`, { timeout: 5000 }, async () => {
      let now = 0;
      let resolve!: () => void;
      const pending = new Promise<void>(r => { resolve = r; });
      let entered!: () => void;
      const began = new Promise<void>(r => { entered = r; });
      const provider: Provider = { ...demoProvider,
        async reflect() {
          entered(); await pending;
          return { source: 'demo', observation: 'late-private-reflection', suggestion: '参考', quote: null };
        },
      };
      const app = createApp(provider, { authenticate: async () => "fixture", now: () => now, ttlMs: 100 });
      const server = app.listen(0, '127.0.0.1');
      try {
        await once(server, 'listening');
        const address = server.address(); assert.ok(address && typeof address !== 'string');
        const base = `http://127.0.0.1:${address.port}`;
        const id = (await (await start(base)).json()).session.id;
        if (stage === 'turn-limit') {
          for (let n = 0; n < 19; n++) {
            assert.equal((await post(base, `/api/sessions/${id}/messages`, { text: '架空の発言' })).status, 200);
          }
        }
        const result = stage === 'end'
          ? post(base, `/api/sessions/${id}/end`, { reason: 'finish' })
          : post(base, `/api/sessions/${id}/messages`, { text: '最後の発言' });
        await began;
        if (invalidation === 'release') assert.equal((await release(base, id)).status, 204);
        else if (invalidation === 'expiry') now = 100;
        else app.locals.dispose();
        resolve();
        const response = await result;
        assert.equal(response.status, 404);
        const body = await response.json();
        assert.equal(typeof body.error, 'string');
        assert.equal(body.session, undefined);
        assert.equal(body.reflection, undefined);
        assert.doesNotMatch(JSON.stringify(body), /late-private|架空の発言|最後の発言/);
      } finally {
        resolve();
        app.locals.dispose(); server.closeAllConnections();
        await new Promise<void>(r => server.close(() => r()));
      }
    });
  }
}
