import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGenerationLimits, withGenerationLimits } from './generation-limits.js';
import { demoProvider, type Provider } from './provider.js';
import { scenarios } from '../shared/scenarios.js';
import type { Session } from '../shared/types.js';

const scenario = scenarios[0];
const session: Session = { id: 'test', scenarioId: scenario.id, actionId: scenario.actions[0].id, status: 'active', turnCount: 0, maxTurns: 5, messages: [], mode: 'gemini' };
const limits = { maxAttempts: 3, maxAttemptsPerMinute: 2, maxConcurrent: 1 };
const fake = (reply: Provider['reply'] = async () => 'ok'): Provider => ({ ...demoProvider, mode: 'gemini', reply });
const call = (p: Provider) => p.reply(scenario, session, 'test');

test('defaults are bounded and malformed configuration fails closed', () => {
  assert.deepEqual(loadGenerationLimits({}), { maxAttempts: 100, maxAttemptsPerMinute: 20, maxConcurrent: 4 });
  for (const key of ['AI_MAX_PROCESS_ATTEMPTS', 'AI_MAX_ATTEMPTS_PER_MINUTE', 'MAX_CONCURRENT_GENERATIONS']) {
    for (const value of ['0', '-1', '1.5', 'Infinity', 'NaN', '10001', '', ' 2', '2x']) {
      assert.throws(() => loadGenerationLimits({ [key]: value }));
    }
  }
  for (const value of [0, -1, 1.5, Infinity, NaN, 10001]) assert.throws(() => withGenerationLimits(fake(), { ...limits, maxAttempts: value }));
});

test('rolling window boundary permits new attempts but lifetime count never resets', async () => {
  let time = 0, calls = 0;
  const p = withGenerationLimits(fake(async () => { calls++; return 'ok'; }), limits, () => time);
  await call(p); time = 100; await call(p);
  time = 59999; await assert.rejects(call(p), /limit/);
  time = 60000; await call(p);
  time = 999999; await assert.rejects(call(p), /limit/);
  assert.equal(calls, 3);
});

test('failed and synchronously throwing operations consume attempts; rejected admissions do not', async () => {
  let calls = 0;
  const p = withGenerationLimits(fake(() => { calls++; throw new Error('provider failed'); }), { ...limits, maxAttempts: 2 });
  await assert.rejects(call(p), /provider failed/);
  await assert.rejects(call(p), /provider failed/);
  await assert.rejects(call(p), /limit/);
  assert.equal(calls, 2);
});

test('reply and reflection share synchronous reservations; completion releases only concurrency', async () => {
  let release!: (value: string) => void;
  const p = withGenerationLimits(fake(() => new Promise(resolve => { release = resolve; })), limits);
  const first = call(p);
  await assert.rejects(p.reflect(scenario, session), /limit/);
  release('ok'); await first;
  await p.reflect(scenario, session);
  await assert.rejects(call(p), /limit/);
});

test('no reset at fixed wall-clock minute boundaries; clocks fail closed', async () => {
  let time = 59999;
  const p = withGenerationLimits(fake(), { ...limits, maxAttemptsPerMinute: 1 }, () => time);
  await call(p); time = 60000; await assert.rejects(call(p), /limit/);
  time = 0; await assert.rejects(call(p), /clock/);
  time = NaN; await assert.rejects(call(p), /clock/);
  time = Infinity; await assert.rejects(call(p), /clock/);
  time = 119999; await call(p);
});

test('caller configuration mutations cannot increase limits, demo remains provider-free', async () => {
  const config = { ...limits, maxAttempts: 1 };
  const p = withGenerationLimits(fake(), config);
  config.maxAttempts = 100;
  await call(p); await assert.rejects(call(p), /limit/);
  assert.equal(withGenerationLimits(demoProvider, config), demoProvider);
});

test('exhaustion prevents provider calls while all stop reasons and release remain available', async () => {
  const { createApp } = await import('./app.js');
  const { once } = await import('node:events');
  let calls = 0;
  const app = createApp(withGenerationLimits(fake(async () => { calls++; return 'ok'; }), { ...limits, maxAttempts: 1 }), { authenticate: async () => "fixture" });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const reason of ['finish', 'respect', 'emergency']) {
      const created = await post('/api/sessions', { scenarioId: scenario.id, actionId: scenario.actions[0].id, adultConfirmed: true });
      const id = (await created.json()).session.id;
      if (reason === 'finish') assert.equal((await post(`/api/sessions/${id}/messages`, { text: 'hello' })).status, 200);
      const blocked = await post(`/api/sessions/${id}/messages`, { text: 'blocked' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get('retry-after'), null);
      assert.match((await blocked.json()).error, /利用枠/);
      const ended = await post(`/api/sessions/${id}/end`, { reason });
      assert.equal(ended.status, 200);
      assert.equal((await ended.json()).session.turnCount, reason === 'finish' ? 1 : 0);
      if (reason !== 'emergency') {
        const response = await post(`/api/sessions/${id}/reflection`, {});
        assert.equal(response.status, reason === 'respect' ? 200 : 429);
        if (reason === 'respect') assert.match((await response.json()).reflection.conversation.observation, /AIコメントは作成していません/);
      }
      assert.equal((await fetch(`${base}/api/sessions/${id}`, { method: 'DELETE' })).status, 204);
    }
    assert.equal(calls, 1);
  } finally {
    app.locals.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('rolling limit reports the actual wait without spending another provider attempt', async () => {
  let time = 0, calls = 0;
  const p = withGenerationLimits(fake(async () => { calls++; return 'ok'; }), { ...limits, maxAttemptsPerMinute: 1 }, () => time);
  await call(p);
  time = 20100;
  await assert.rejects(call(p), { kind: 'minute', retrySeconds: 40 });
  time = 60000;
  await call(p);
  assert.equal(calls, 2);
});
