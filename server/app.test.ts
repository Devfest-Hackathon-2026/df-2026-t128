import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from './app.js';
import { createProvider, demoProvider, validateConversation, type Provider } from './provider.js';
import { scenarios } from '../shared/scenarios.js';
import type { Message, Session, SessionResponse } from '../shared/types.js';

type Request = <T = SessionResponse>(route: string, body?: unknown) => Promise<{ status: number; body: T }>;

async function withApp(
  provider: Provider,
  run: (request: Request) => Promise<void>,
  options: Parameters<typeof createApp>[1] = {},
) {
  const app = createApp(provider, { authenticate: async () => "fixture", ...options });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const request: Request = async (route, body) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    await run(request);
  } finally {
    app.locals.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function start(request: Request, scenario = scenarios[0]) {
  const response = await request('/api/sessions', {
    scenarioId: scenario.id, actionId: scenario.actions.find(action => !action.endOnSelection)!.id, adultConfirmed: true,
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.session.status, 'active');
  assert.equal(response.body.session.turnCount, 0);
  assert.equal(response.body.session.messages.length, 1);
  assert.equal(response.body.reflection, null);
  return response.body.session.id;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

for (const scenario of scenarios) {
  test(`demo: ${scenario.id} completes after five exchanges and rejects further messages`, async () => {
    await withApp(demoProvider, async request => {
      const id = await start(request, scenario);
      for (let turn = 1; turn <= 5; turn++) {
        const response = await request(`/api/sessions/${id}/messages`, { text: `声かけの練習 ${turn}` });
        assert.equal(response.status, 200);
        assert.equal(response.body.session.turnCount, turn);
        assert.equal(response.body.session.messages.length, 1 + turn * 2);
        assert.equal(response.body.session.messages.at(-2)?.role, 'user');
        assert.equal(response.body.session.messages.at(-1)?.role, 'assistant');
        assert.ok(response.body.session.messages.at(-1)?.text);
        assert.equal(response.body.session.status, turn === 5 ? 'completed' : 'active');
        if (turn === 5) {
          assert.equal(response.body.session.endReason, 'turn-limit');
          assert.equal(response.body.reflection?.action.label, scenario.actions.find(action => !action.endOnSelection)!.label);
          assert.equal(response.body.reflection?.conversation.source, 'demo');
          assert.equal(response.body.reflection?.conversation.quote, null);
        } else {
          assert.equal(response.body.reflection, null);
        }
      }
      assert.equal((await request(`/api/sessions/${id}/messages`, { text: 'もう一度' })).status, 409);
      const completed = await request(`/api/sessions/${id}/end`, { reason: 'finish' });
      assert.equal(completed.body.session.turnCount, 5);
      assert.equal(completed.body.session.messages.length, 11);
      assert.equal(completed.body.session.endReason, 'turn-limit');
    });
  });
}

test('session creation requires adult confirmation and a matching scenario/action', async () => {
  await withApp(demoProvider, async request => {
    const scenario = scenarios[0];
    const valid = { scenarioId: scenario.id, actionId: scenario.actions[0].id, adultConfirmed: true };
    const invalid = [
      { ...valid, adultConfirmed: false },
      { scenarioId: scenario.id, actionId: scenario.actions[0].id },
      { ...valid, actionId: 'unknown-action' },
      { ...valid, actionId: scenarios[1].actions[0].id },
      { ...valid, scenarioId: 'unknown-scenario' },
    ];
    for (const body of invalid) assert.equal((await request('/api/sessions', body)).status, 400);
    await start(request);
  });
});

test('blank and overlong messages do not consume a turn; a 500-character message is accepted', async () => {
  await withApp(demoProvider, async request => {
    const id = await start(request);
    for (const text of ['', ' \n\t ', 'あ'.repeat(501)]) {
      assert.equal((await request(`/api/sessions/${id}/messages`, { text })).status, 400);
    }
    const response = await request(`/api/sessions/${id}/messages`, { text: 'あ'.repeat(500) });
    assert.equal(response.status, 200);
    assert.equal(response.body.session.turnCount, 1);
    assert.equal(response.body.session.messages.length, 3);
    assert.equal(response.body.session.messages[1].text.length, 500);
  });
});

test('respect completes an exercise without requiring a conversation turn', async () => {
  await withApp(demoProvider, async request => {
    const station = scenarios.find(scenario => scenario.id === 'bookstore');
    assert.ok(station);
    const id = await start(request, station);
    const response = await request(`/api/sessions/${id}/end`, { reason: 'respect' });
    assert.equal(response.status, 200);
    assert.equal(response.body.session.status, 'completed');
    assert.equal(response.body.session.endReason, 'respect');
    assert.equal(response.body.session.turnCount, 0);
    assert.equal(response.body.session.messages.length, 1);
    assert.ok(response.body.reflection);
    assert.equal((await request(`/api/sessions/${id}/messages`, { text: '続けます' })).status, 409);
    const repeat = await request(`/api/sessions/${id}/end`, { reason: 'finish' });
    assert.equal(repeat.body.session.endReason, 'respect');
  });
});

test('emergency interrupts an in-flight reply and never appends the late result', { timeout: 10_000 }, async () => {
  const entered = deferred<void>();
  const reply = deferred<string>();
  const provider: Provider = {
    ...demoProvider,
    async reply() {
      entered.resolve();
      return reply.promise;
    },
    async reflect() { throw new Error('Interrupted sessions must not request reflection'); },
  };
  await withApp(provider, async request => {
    const id = await start(request);
    const pending = request(`/api/sessions/${id}/messages`, { text: 'お手伝いは必要ですか' });
    try {
      await entered.promise;
      const interrupted = await request(`/api/sessions/${id}/end`, { reason: 'emergency' });
      assert.equal(interrupted.status, 200);
      assert.equal(interrupted.body.session.status, 'interrupted');
      assert.equal(interrupted.body.session.endReason, 'emergency');
      assert.equal(interrupted.body.session.turnCount, 0);
      assert.equal(interrupted.body.session.messages.length, 1);
      assert.equal(interrupted.body.reflection, null);
      reply.resolve('この遅延応答は履歴に追加されない');
      const late = await pending;
      assert.equal(late.status, 200);
      assert.deepEqual(late.body, interrupted.body);
      assert.equal((await request(`/api/sessions/${id}/reflection`, {})).status, 409);
      assert.equal((await request(`/api/sessions/${id}/messages`, { text: '続けます' })).status, 409);
    } finally {
      reply.resolve('テスト終了時の解放');
      await pending;
    }
  });
});

test('provider failure preserves the conversation and releases the session for retry', async () => {
  const attempts: Session[] = [];
  const provider: Provider = {
    ...demoProvider,
    async reply(scenario, session, text) {
      attempts.push(structuredClone(session));
      if (attempts.length === 1) throw new Error('Simulated provider failure');
      return demoProvider.reply(scenario, session, text);
    },
  };
  await withApp(provider, async request => {
    const id = await start(request);
    const failed = await request(`/api/sessions/${id}/messages`, { text: '最初の送信' });
    assert.equal(failed.status, 502);
    const retry = await request(`/api/sessions/${id}/messages`, { text: 'もう一度の送信' });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.session.status, 'active');
    assert.equal(retry.body.session.turnCount, 1);
    assert.equal(retry.body.session.messages.length, 3);
    assert.equal(retry.body.session.messages[1].text, 'もう一度の送信');
    assert.deepEqual(attempts[1], attempts[0]);
    assert.ok(!retry.body.session.messages.some(message => message.text === '最初の送信'));
  });
});

test('sessions expire at their TTL boundary and no longer accept messages or endings', async () => {
  let clock = 1_000;
  await withApp(demoProvider, async request => {
    const id = await start(request);
    clock = 1_099;
    assert.equal((await request(`/api/sessions/${id}/messages`, { text: 'こんにちは' })).status, 200);
    clock = 1_100;
    assert.equal((await request(`/api/sessions/${id}/messages`, { text: 'お手伝いしますか' })).status, 404);
    assert.equal((await request(`/api/sessions/${id}/end`, { reason: 'respect' })).status, 404);
  }, { ttlMs: 100, now: () => clock });
});

test('another message cannot overtake an in-flight provider reply', { timeout: 10_000 }, async () => {
  const entered = deferred<void>();
  const reply = deferred<string>();
  await withApp({ ...demoProvider, async reply() { entered.resolve(); return reply.promise; } }, async request => {
    const id = await start(request);
    const pending = request(`/api/sessions/${id}/messages`, { text: '最初の発言' });
    try {
      await entered.promise;
      assert.equal((await request(`/api/sessions/${id}/messages`, { text: '重複した送信' })).status, 409);
      reply.resolve('応答です');
      const response = await pending;
      assert.equal(response.body.session.turnCount, 1);
      assert.equal(response.body.session.messages.length, 3);
    } finally {
      reply.resolve('テスト終了時の解放');
      await pending;
    }
  });
});

test('reflection validation rejects unsupported feedback and preserves an actual user excerpt', () => {
  const messages: Message[] = [
    { role: 'assistant', text: '自分で確認したいです。' },
    { role: 'user', text: '分かりました。必要になったら声をかけてください。' },
  ];
  const base = { observation: '会話の表現についての参考コメント。', suggestion: '返事を待つ間を取ってみましょう。' };
  for (const quote of ['家族に電話しましょう', '自分で確認したいです。', '', ' ', null, '分かりました。必要なら声をかけてください。']) {
    assert.throws(() => validateConversation({ ...base, quote }, messages), /no verifiable user quotation/);
  }
  const actual = validateConversation({ ...base, quote: '必要になったら声をかけてください。' }, messages);
  assert.equal(actual.quote, '必要になったら声をかけてください。');
});

test('reflection validation rejects missing, empty or oversized provider fields', () => {
  const valid = { observation: '観察', suggestion: '次に試す言葉', quote: null };
  for (const value of [
    null,
    { suggestion: valid.suggestion, quote: null },
    { ...valid, observation: ' \n ' },
    { ...valid, suggestion: 'あ'.repeat(701) },
    { ...valid, quote: 'あ'.repeat(501) },
  ]) assert.throws(() => validateConversation(value, []));
});


test('expired reflection never returns conversation data after generation', async () => {
  let time = 0;
  const reflection = deferred<ReflectionResult>();
  const entered = deferred<void>();
  const provider: Provider = { ...demoProvider, mode: 'gemini', reflect: async () => { entered.resolve(); return reflection.promise; } };
  await withApp(provider, async request => {
    const id = await start(request);
    await request(`/api/sessions/${id}/messages`, { text: 'こんにちは' });
    await request(`/api/sessions/${id}/end`, { reason: 'finish' });
    const pending = request(`/api/sessions/${id}/reflection`, {});
    await entered.promise;
    time = 100;
    reflection.resolve({ source: 'gemini', observation: 'private', suggestion: 'private', quote: null });
    const response = await pending;
    assert.equal(response.status, 404);
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  }, { now: () => time, ttlMs: 100 });
});

type ReflectionResult = Awaited<ReturnType<Provider['reflect']>>;

test('global generation capacity rejects another session and releases on failure', async () => {
  const entered = deferred<void>();
  let fail!: (error: Error) => void;
  const reply = new Promise<string>((_, reject) => { fail = reject; });
  let calls = 0;
  const provider: Provider = { ...demoProvider, mode: 'gemini', reply: async () => { calls++; if (calls === 1) { entered.resolve(); return reply; } return '再開'; } };
  await withApp(provider, async request => {
    const first = await start(request);
    const second = await start(request);
    const pending = request(`/api/sessions/${first}/messages`, { text: 'こんにちは' });
    await entered.promise;
    assert.equal((await request(`/api/sessions/${second}/messages`, { text: 'こんにちは' })).status, 503);
    assert.equal((await request(`/api/sessions/${first}/end`, { reason: 'emergency' })).status, 200);
    fail(new Error('upstream failed'));
    assert.equal((await pending).body.session.status, 'interrupted');
    assert.equal((await request(`/api/sessions/${second}/messages`, { text: 'こんにちは' })).status, 200);
    assert.equal(calls, 2);
  }, { maxConcurrentGenerations: 1 });
});

test('health probes bypass throttling but conversation routes remain limited', async () => {
  await withApp(demoProvider, async request => {
    for (let i = 0; i < 95; i++) assert.equal((await request('/api/health')).status, 200);
    for (let i = 0; i < 90; i++) assert.equal((await request('/api/config')).status, 200);
    assert.equal((await request('/api/config')).status, 429);
    assert.equal((await request('/api/health')).status, 200);
  });
});

test('expired interrupted reply does not return stale session data', async () => {
  let time = 0;
  const entered = deferred<void>();
  const reply = deferred<string>();
  await withApp({ ...demoProvider, mode: 'gemini', reply: async () => { entered.resolve(); return reply.promise; } }, async request => {
    const id = await start(request);
    const pending = request(`/api/sessions/${id}/messages`, { text: 'private' });
    await entered.promise;
    await request(`/api/sessions/${id}/end`, { reason: 'emergency' });
    time = 100;
    reply.resolve('late');
    assert.equal((await pending).status, 404);
  }, { now: () => time, ttlMs: 100 });
});


test('slow request bodies cannot bypass session expiration', async () => {
  let time = 0;
  const app = createApp(demoProvider, { authenticate: async () => "fixture", now: () => time, ttlMs: 100 });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const created = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: scenarios[0].id, actionId: scenarios[0].actions[0].id, adultConfirmed: true }) });
    const { session } = await created.json() as SessionResponse;
    const seen = once(server, 'request');
    const result = new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(`${base}/api/sessions/${session.id}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.write('{"reason":');
      void seen.then(() => { time = 100; req.end('"finish"}'); });
    });
    assert.equal(await result, 404);
  } finally {
    app.locals.dispose();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test('unsupported reflection is not returned or cached and a verified retry succeeds', async () => {
  let attempts = 0;
  const provider: Provider = {
    ...demoProvider, mode: 'gemini',
    async reflect(_scenario, session) {
      attempts++;
      return validateConversation({
        observation: attempts === 1 ? 'unsupported-private-observation' : '実際の発言の参考コメント。',
        suggestion: '本人の希望を尊重しましょう。',
        quote: attempts === 1 ? 'invented-private-quote' : 'こんにちは',
      }, session.messages);
    },
  };
  await withApp(provider, async request => {
    const id = await start(request);
    await request(`/api/sessions/${id}/messages`, { text: 'こんにちは' });
    await request(`/api/sessions/${id}/end`, { reason: 'finish' });
    const rejected = await request(`/api/sessions/${id}/reflection`, {});
    assert.equal(rejected.status, 502);
    assert.doesNotMatch(JSON.stringify(rejected.body), /unsupported-private|invented-private|verifiable/);
    const retried = await request(`/api/sessions/${id}/reflection`, {});
    assert.equal(retried.status, 200);
    assert.equal(retried.body.reflection?.conversation.quote, 'こんにちは');
    await request(`/api/sessions/${id}/reflection`, {});
    assert.equal(attempts, 2);
  });
});

test('demo respect endings do not prompt more persuasion, before or after a user turn', async () => {
  for (const scenario of scenarios) {
    for (const withTurn of [false, true]) {
      await withApp(demoProvider, async request => {
        const id = await start(request, scenario);
        if (withTurn) await request(`/api/sessions/${id}/messages`, { text: '分かりました。' });
        const ended = await request(`/api/sessions/${id}/end`, { reason: 'respect' });
        assert.equal(ended.status, 200);
        assert.equal(ended.body.session.endReason, 'respect');
        const conversation = ended.body.reflection!.conversation;
        assert.equal(conversation.source, 'demo');
        assert.equal(conversation.quote, null);
        assert.match(conversation.observation, /定型/);
        assert.match(conversation.suggestion, /追加の声かけや説得をせず/);
        assert.doesNotMatch(conversation.suggestion, /別の声かけ|声をかけてみましょう/);
      });
    }
  }
});

test('Gemini without user turns uses fixed guidance respecting the selected end reason, with no API call', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected generation'); });
  const provider = createProvider({ AI_PROVIDER: 'gemini', GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'fake-test-key' });
  for (const scenario of scenarios) {
    const session: Session = {
      id: 'test', scenarioId: scenario.id, actionId: scenario.actions[0].id,
      status: 'completed', turnCount: 0, maxTurns: 5, mode: 'gemini',
      messages: [{ role: 'assistant', text: scenario.opening }], endReason: 'respect',
    };
    const reflection = await provider.reflect(scenario, session);
    assert.match(reflection.observation, /AIコメントは作成していません/);
    assert.match(reflection.suggestion, /追加の声かけや説得をせず/);
    assert.equal(reflection.quote, null);
    const ordinary = await provider.reflect(scenario, { ...session, endReason: 'finish' });
    assert.match(ordinary.suggestion, scenario.id === 'bookstore' ? /追加の声かけや説得をせず/ : /自分の言葉で/);
  }
  assert.equal(calls, 0);
});

test('reflection evidence must come from one user turn, without normalization or stitching', () => {
  const value = { observation: '観察', suggestion: '参考', quote: 'こんにちは。分かりました。' };
  assert.throws(() => validateConversation(value, [
    { role: 'user', text: 'こんにちは。' }, { role: 'user', text: '分かりました。' },
  ]));
  assert.throws(() => validateConversation({ ...value, quote: 'ＡＢＣ' }, [{ role: 'user', text: 'ABC' }]));
  assert.throws(() => validateConversation(value, []));
});

for (const mode of ['demo', 'gemini'] as const) {
  test(`${mode}: choosing to leave completes without generating or requiring speech`, async () => {
    let calls = 0;
    const provider: Provider = mode === 'demo' ? demoProvider : createProvider({
      AI_PROVIDER: 'gemini', GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'fake-test-key',
    });
    const guarded: Provider = { ...provider, reply: async () => { calls++; throw new Error('No reply expected'); } };
    await withApp(guarded, async request => {
      const created = await request('/api/sessions', { scenarioId: 'bookstore', actionId: 'bookstore-step-back', adultConfirmed: true });
      assert.equal(created.status, 201);
      const session = created.body.session;
      assert.equal(session.status, 'completed');
      assert.equal(session.endReason, 'respect');
      assert.equal(session.turnCount, 0);
      assert.equal(session.messages.length, 1);
      assert.equal((await request(`/api/sessions/${session.id}/messages`, { text: '待ってください' })).status, 409);
      const reflected = await request(`/api/sessions/${session.id}/reflection`, {});
      assert.equal(reflected.status, 200);
      assert.match(reflected.body.reflection!.conversation.suggestion, /追加の声かけや説得をせず/);
      assert.equal((await request(`/api/sessions/${session.id}/end`, { reason: 'finish' })).body.session.endReason, 'respect');
      assert.equal(calls, 0);
    });
  });
}

for (const ending of ['finish', 'turn-limit'] as const) {
  test(`station ${ending} fixed guidance does not encourage renewed persuasion`, async () => {
    await withApp(demoProvider, async request => {
      const station = scenarios.find(scenario => scenario.id === 'bookstore')!;
      const id = await start(request, station);
      for (let n = 0; n < (ending === 'turn-limit' ? 5 : 1); n++) {
        await request(`/api/sessions/${id}/messages`, { text: '分かりました。失礼します。' });
      }
      const ended = await request(`/api/sessions/${id}/end`, { reason: 'finish' });
      assert.equal(ended.body.session.endReason, ending);
      const reflection = ended.body.reflection!;
      assert.match(reflection.conversation.suggestion, /追加の声かけや説得をせず/);
      assert.match(reflection.nextStep, /距離を保つ/);
      assert.doesNotMatch(reflection.conversation.suggestion + reflection.nextStep, /別の声かけ/);
    });
  });
}

test('respect after a user turn in shop/sato never generates further advice', async () => {
  const provider: Provider = {...demoProvider, mode:'gemini', reflect: async () => assert.fail('must not generate advice')};
  await withApp(provider, async request => {
    const {session}=(await request('/api/sessions',{scenarioId:'shop',characterId:'sato',actionId:'shop-wait',adultConfirmed:true})).body;
    const path='/api/sessions/'+session.id;
    await request(path+'/messages',{text:'わかりました。ここで失礼します。'});
    await request(path+'/end',{reason:'respect'});
    const r=await request(path+'/reflection',{});
    assert.equal(r.status,200);assert.equal(r.body.reflection?.conversation.source,'fixed');
    assert.equal(r.body.reflection?.conversation.quote,'わかりました。ここで失礼します。');
    assert.match(r.body.reflection!.conversation.suggestion,/会話を終えて/);
  });
});
