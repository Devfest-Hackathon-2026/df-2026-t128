import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { demoProvider } from './provider.js';

test('failed reply bursts recover in the same session, retaining input and turn count', async () => {
  let time = 0, calls = 0, available = false;
  const app = createApp({ ...demoProvider, mode: 'gemini', reply: async () => {
    calls++;
    if (!available) throw new Error('temporarily unavailable');
    return 'わかりました。';
  } }, { now: () => time, secureCookie: false });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/sessions`;
    let cookie = '';
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
    const started = await post('', { scenarioId: 'shop', adultConfirmed: true });
    cookie = started.headers.get('set-cookie')!.split(';')[0];
    const path = '/' + (await started.json()).session.id;
    const input = { text: '何かお探しですか。', requestId: 'same-input' };
    for (let n = 0; n < 9; n++) assert.equal((await post(path + '/messages', input)).status, 502);
    const blocked = await post(path + '/messages', input);
    assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60'); assert.equal(calls, 9);
    time = 59999;
    const almost = await post(path + '/messages', input);
    assert.equal(almost.status, 429); assert.equal(almost.headers.get('retry-after'), '1');
    time = 60000; available = true;
    const recovered = await post(path + '/messages', input);
    assert.equal(recovered.status, 200);
    const session = (await recovered.json()).session;
    assert.equal(session.turnCount, 1); assert.equal(session.messages.filter((m: { role: string }) => m.role === 'user').length, 1);
    assert.equal((await post(path + '/messages', input)).status, 200); assert.equal(calls, 10);
    assert.equal((await post(path + '/end', { reason: 'finish' })).status, 200);
    assert.equal((await post(path + '/reflection', {})).status, 200);
  } finally { app.locals.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('failed speech bursts recover after waiting and cached audio consumes no new attempt', async () => {
  let time = 0, calls = 0, available = false;
  const app = createApp(demoProvider, { now: () => time, secureCookie: false, synthesizeSpeech: async () => {
    calls++; if (!available) throw new Error('unavailable'); return 'SUQz';
  } });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/sessions`;
    let cookie = '';
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
    const started = await post('', { scenarioId: 'shop', actionId: 'shop-approach', adultConfirmed: true });
    cookie = started.headers.get('set-cookie')!.split(';')[0];
    const path = '/' + (await started.json()).session.id;
    for (let n = 0; n < 8; n++) assert.equal((await post(path + '/speech', { messageIndex: 0 })).status, 502);
    const blocked = await post(path + '/speech', { messageIndex: 0 });
    assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60'); assert.equal(calls, 8);
    time = 60000; available = true;
    for (let n = 0; n < 2; n++) assert.equal((await post(path + '/speech', { messageIndex: 0 })).status, 200);
    assert.equal(calls, 9);
    assert.equal((await post(path + '/messages', { text: 'こんにちは。' })).status, 200);
  } finally { app.locals.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('failed reflections recover after a temporary limit without restarting the conversation', async () => {
  let time = 0, calls = 0, available = false;
  const app = createApp({ ...demoProvider, mode: 'gemini', reply: async () => 'こんにちは。', reflect: async (scenario, session) => {
    calls++; if (!available) throw new Error('unavailable'); return demoProvider.reflect(scenario, session);
  } }, { now: () => time, authenticate: async () => 'fixture' });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/sessions`;
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const started = await post('', { scenarioId: 'shop', adultConfirmed: true });
    const path = '/' + (await started.json()).session.id;
    assert.equal((await post(path + '/messages', { text: 'こんにちは。' })).status, 200);
    assert.equal((await post(path + '/end', { reason: 'finish' })).status, 200);
    for (let n = 0; n < 9; n++) assert.equal((await post(path + '/reflection', {})).status, 502);
    const blocked = await post(path + '/reflection', {});
    assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60');
    time = 60000; available = true;
    for (let n = 0; n < 2; n++) assert.equal((await post(path + '/reflection', {})).status, 200);
    assert.equal(calls, 10);
    assert.equal((await fetch(base + path, { method: 'DELETE' })).status, 204);
  } finally { app.locals.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('the explicit 20-turn learning boundary and fresh-session access remain intact', async () => {
  const app = createApp({ ...demoProvider, mode: 'gemini', reply: async () => 'わかりました。' }, { authenticate: async () => 'fixture' });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/sessions`;
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const started = await post('', { scenarioId: 'shop', adultConfirmed: true });
    const path = '/' + (await started.json()).session.id;
    for (let turn = 1; turn <= 20; turn++) {
      const response = await post(path + '/messages', { text: 'こんにちは。' });
      assert.equal(response.status, 200);
      const session = (await response.json()).session;
      assert.equal(session.turnCount, turn);
      assert.equal(session.status, turn === 20 ? 'completed' : 'active');
      if (turn === 20) assert.equal(session.endReason, 'turn-limit');
    }
    assert.equal((await post(path + '/messages', { text: 'こんにちは。' })).status, 409);
    assert.equal((await post(path + '/reflection', {})).status, 200);
    const next = await post('', { scenarioId: 'shop', adultConfirmed: true });
    const nextPath = '/' + (await next.json()).session.id;
    assert.equal((await post(nextPath + '/messages', { text: 'こんにちは。' })).status, 200);
  } finally { app.locals.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
