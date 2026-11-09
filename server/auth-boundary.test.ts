import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, type Authenticate } from './app.js';
import { demoProvider, type Provider } from './provider.js';
import { scenarios } from '../shared/scenarios.js';

// Fake verifier only: these headers are NOT accepted by the production entrypoint.
const fakeVerifier: Authenticate = async req => {
  if (req.get('x-test-subject') === 'throw') throw new Error('secret verifier failure');
  return req.get('x-test-subject') ?? null;
};
async function withApp(run: (request: (route: string, subject?: string, body?: unknown, method?: string) => Promise<Response>) => Promise<void>, provider: Provider = demoProvider) {
  const app = createApp(provider, { authenticate: fakeVerifier });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await run((route, subject, body, method) => fetch(`http://127.0.0.1:${address.port}/api${route}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', ...(subject === undefined ? {} : { 'x-test-subject': subject }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  } finally {
    app.locals.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
const startBody = { scenarioId: scenarios[0].id, actionId: scenarios[0].actions[0].id, adultConfirmed: true };

test('verifier rejects missing, invalid and thrown authentication before all API operations', async () => {
  await withApp(async request => {
    assert.equal((await request('/health')).status, 200);
    for (const subject of [undefined, '', 'throw', 'a'.repeat(513)]) {
      for (const [route, body, method] of [
        ['/config', undefined, 'GET'], ['/scenarios', undefined, 'GET'],
        ['/sessions', startBody, 'POST'], ['/sessions/unknown/messages', { text: 'hello' }, 'POST'],
        ['/sessions/unknown/end', { reason: 'finish' }, 'POST'],
        ['/sessions/unknown/reflection', {}, 'POST'], ['/sessions/unknown', undefined, 'DELETE'],
      ] as const) {
        const response = await request(route, subject, body, method);
        assert.equal(response.status, 401);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.ok(!(await response.text()).includes('secret'));
      }
    }
    assert.equal((await request('/config', 'alice')).status, 200);
  });
});

test('a second authenticated subject cannot mutate, reflect or delete another subject session', async () => {
  await withApp(async request => {
    const created = await request('/sessions', 'alice', startBody);
    assert.equal(created.status, 201);
    const data = await created.json();
    assert.equal(data.session.owner, undefined);
    const route = `/sessions/${data.session.id}`;
    for (const suffix of ['/messages', '/end', '/reflection']) {
      assert.equal((await request(route + suffix, 'bob', suffix === '/messages' ? { text: 'hello' } : { reason: 'finish' })).status, 404);
    }
    assert.equal((await request(route, 'bob', undefined, 'DELETE')).status, 204);
    assert.equal((await request(route + '/messages', 'alice', { text: 'こんにちは' })).status, 200);
    assert.equal((await request(route + '/end', 'alice', { reason: 'finish' })).status, 200);
    assert.equal((await request(route + '/reflection', 'bob', {})).status, 404);
    assert.equal((await request(route + '/reflection', 'alice', {})).status, 200);
    assert.equal((await request(route, 'alice', undefined, 'DELETE')).status, 204);
    assert.equal((await request(route + '/reflection', 'alice', {})).status, 404);
  });
});

test('authenticated rate accounting separates subjects behind the same proxy', async () => {
  await withApp(async request => {
    for (let n = 0; n < 90; n++) assert.equal((await request('/config', 'alice')).status, 200);
    assert.equal((await request('/config', 'alice')).status, 429);
    assert.equal((await request('/config', 'bob')).status, 200);
  });
});


test('owner deletion during generation suppresses a late response in authenticated mode', async () => {
  let release!: (value: string) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const result = new Promise<string>(resolve => { release = resolve; });
  const provider: Provider = { ...demoProvider, reply: async () => { entered(); return result; } };
  await withApp(async request => {
    const data = await (await request('/sessions', 'issuer-a:tenant-a:alice', startBody)).json();
    const route = `/sessions/${data.session.id}`;
    const pending = request(route + '/messages', 'issuer-a:tenant-a:alice', { text: 'hello' });
    await started;
    assert.equal((await request(route, 'issuer-b:tenant-a:alice', undefined, 'DELETE')).status, 204);
    assert.equal((await request(route + '/reflection', 'issuer-a:tenant-a:alice', {})).status, 409);
    assert.equal((await request(route, 'issuer-a:tenant-a:alice', undefined, 'DELETE')).status, 204);
    release('late response must not be returned');
    const response = await pending;
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('late response'));
  }, provider);
});
