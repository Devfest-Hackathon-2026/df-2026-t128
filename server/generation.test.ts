import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerator } from './generation.js';
import { loadServerConfig } from './config.js';

const vertex = { GEMINI_BACKEND: 'vertex', GEMINI_MODEL: 'test-model', GOOGLE_CLOUD_PROJECT: 'test-project', GOOGLE_CLOUD_LOCATION: 'asia-northeast1' };
const valid = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hidden', thought: true }, { text: 'こんにちは' }] } }] });

test('Vertex uses project/location endpoint and refreshed ADC, never an API key', async () => {
  let calls = 0;
  const generate = createGenerator({ ...vertex, GEMINI_API_KEY: 'must-not-leak' }, {
    accessToken: async () => `fake-${++calls}`,
    fetch: async (url, init) => {
      assert.equal(url, 'https://asia-northeast1-aiplatform.googleapis.com/v1/projects/test-project/locations/asia-northeast1/publishers/google/models/test-model:generateContent');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), `Bearer fake-${calls}`);
      assert.equal(headers.get('x-goog-api-key'), null);
      assert.ok(init?.signal);
      assert.equal(init?.redirect, 'error');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.generationConfig.maxOutputTokens, 2048);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      return valid();
    },
  });
  assert.equal(await generate('system', [], { type: 'object' }), 'こんにちは');
  await generate('system', [], {});
  assert.equal(calls, 2);
});

test('global Vertex endpoint has no global- hostname prefix', async () => {
  await createGenerator({ ...vertex, GOOGLE_CLOUD_LOCATION: 'global' }, {
    accessToken: async () => 'fake', fetch: async url => { assert.ok(String(url).startsWith('https://aiplatform.googleapis.com/')); return valid(); },
  })('system', []);
});

test('Developer API remains compatible', async () => {
  await createGenerator({ GEMINI_MODEL: 'test', GEMINI_API_KEY: 'fake' }, {
    fetch: async (url, init) => { assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/')); assert.equal(init?.redirect, 'error'); assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'fake'); return valid(); },
  })('system', []);
});

test('rejects invalid configuration without a request', () => {
  for (const override of [{ GOOGLE_CLOUD_PROJECT: '../project' }, { GOOGLE_CLOUD_LOCATION: 'evil.example' }, { GEMINI_MODEL: '../model' }, { GEMINI_BACKEND: 'other' }, { AI_TIMEOUT_MS: '0' }, { AI_TIMEOUT_MS: 'Infinity' }]) {
    assert.throws(() => createGenerator({ ...vertex, ...override }));
  }
  assert.throws(() => createGenerator({ GEMINI_MODEL: 'test' }));
  assert.throws(() => loadServerConfig({ PORT: '0' }));
  assert.throws(() => loadServerConfig({ K_SERVICE: 'test' }));
  assert.equal(loadServerConfig({ K_SERVICE: 'test', ALLOW_EPHEMERAL_SESSIONS: 'true', AUTH_MODE: 'firebase', FIREBASE_PROJECT_ID: 'test-project', AUTH_ALLOWED_UIDS: '["alice"]' }).host, '0.0.0.0');
});

test('provider failures do not leak response bodies or automatically retry', async () => {
  let calls = 0;
  const generate = createGenerator(vertex, { accessToken: async () => 'fake', fetch: async () => { calls++; return new Response('secret diagnostic', { status: 429 }); } });
  await assert.rejects(generate('system', []), /^Error: AI request failed$/);
  assert.equal(calls, 1);
});

test('blocked, empty, malformed and excessive responses are rejected', async () => {
  for (const payload of [{}, { candidates: [{ finishReason: 'SAFETY' }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'x'.repeat(6001) }] } }] }]) {
    await assert.rejects(createGenerator(vertex, { accessToken: async () => 'fake', fetch: async () => Response.json(payload) })('system', []));
  }
});

test('deadline includes stalled ADC and cannot send after the deadline', async () => {
  let resolve!: (token: string) => void;
  let calls = 0;
  const token = new Promise<string>(r => { resolve = r; });
  const generate = createGenerator({ ...vertex, AI_TIMEOUT_MS: '10' }, { accessToken: () => token, fetch: async () => { calls++; return valid(); } });
  await assert.rejects(generate('system', []), /deadline exceeded/);
  resolve('late');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls, 0);
});

test('production ADC path preserves authorization and quota project headers', async t => {
  const { GoogleAuth } = await import('google-auth-library');
  t.mock.method(GoogleAuth.prototype, 'getRequestHeaders', async () => new Headers({ authorization: 'Bearer fake', 'x-goog-user-project': 'quota-project' }));
  await createGenerator(vertex, {
    fetch: async (_url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer fake');
      assert.equal(headers.get('x-goog-user-project'), 'quota-project');
      return valid();
    },
  })('system', []);
});

test('request deadline aborts transport and missing ADC never sends', async () => {
  let signal: AbortSignal | null | undefined;
  await assert.rejects(createGenerator({ ...vertex, AI_TIMEOUT_MS: '10' }, {
    accessToken: async () => 'fake',
    fetch: async (_url, init) => { signal = init?.signal; return new Promise(() => {}); },
  })('system', []), /deadline exceeded/);
  assert.equal(signal?.aborted, true);
  await assert.rejects(createGenerator(vertex, {
    accessToken: async () => null, fetch: async () => { assert.fail('must not send'); },
  })('system', []), /ADC token unavailable/);
});

