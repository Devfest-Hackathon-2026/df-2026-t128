import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechSynthesizer, MAX_AUDIO_BASE64 } from './speech.js';
const env = { TTS_PROVIDER: 'google', TTS_MAX_TOTAL_CHARACTERS: '100' };
const headers = async () => ({ authorization: 'Bearer synthetic', 'x-goog-user-project': 'synthetic-project' });

test('speech defaults off and rejects missing budget, nonstandard voice and bad mode', () => {
  assert.equal(createSpeechSynthesizer({}), undefined);
  for (const change of [{ TTS_MAX_TOTAL_CHARACTERS: '' }, { TTS_MAX_TOTAL_CHARACTERS: '100001' }, { TTS_VOICE: 'en-US-Standard-A' }, { TTS_PROVIDER: 'other' }]) {
    assert.throws(() => createSpeechSynthesizer({ ...env, ...change }));
  }
});
test('speech uses fixed HTTPS endpoint, ADC quota header, plain text and Japanese Standard MP3', async () => {
  const speak = createSpeechSynthesizer(env, { headers, fetch: async (url, init) => {
    assert.equal(url, 'https://texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('x-goog-user-project'), 'synthetic-project');
    const data = JSON.parse(init?.body as string);
    assert.deepEqual(data.input, { text: '<speak>合成テスト</speak>' });
    assert.deepEqual(data.voice, { languageCode: 'ja-JP', name: 'ja-JP-Standard-A' });
    assert.equal(data.audioConfig.audioEncoding, 'MP3');
    return Response.json({ audioContent: 'SUQz' });
  } })!;
  assert.equal(await speak('<speak>合成テスト</speak>'), 'SUQz');
});
test('failed attempt consumes character budget, without retries', async () => {
  let calls = 0;
  const speak = createSpeechSynthesizer({ ...env, TTS_MAX_TOTAL_CHARACTERS: '2' }, { headers, fetch: async () => { calls++; return new Response('private', { status: 500 }); } })!;
  await assert.rejects(speak('二字')); await assert.rejects(speak('三'));
  assert.equal(calls, 1);
});
test('two concurrent reservations are permitted; third denied before credentials', async () => {
  let release!: () => void, calls = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const speak = createSpeechSynthesizer(env, { headers: async () => { calls++; await pending; return headers(); }, fetch: async () => Response.json({ audioContent: 'SUQz' }) })!;
  const first = speak('あ'), second = speak('い');
  await assert.rejects(speak('う')); assert.equal(calls, 2);
  release(); await Promise.all([first, second]);
});
test('deadline covers delayed credentials and prevents late upstream call', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const speak = createSpeechSynthesizer({ ...env, TTS_TIMEOUT_MS: '10' }, { headers: async () => { await pending; return headers(); }, fetch: async () => assert.fail('late call') })!;
  await assert.rejects(speak('あ'), /deadline/); release();
  await new Promise(resolve => setTimeout(resolve, 20));
});
test('rejects oversized or invalid audio and input, and missing authorization', async () => {
  for (const audioContent of ['', 'not base64!', 'A'.repeat(MAX_AUDIO_BASE64 + 4)]) {
    const speak = createSpeechSynthesizer(env, { headers, fetch: async () => Response.json({ audioContent }) })!;
    await assert.rejects(speak('あ'));
  }
  const speak = createSpeechSynthesizer(env, { headers: async () => ({}), fetch: async () => assert.fail('no auth') })!;
  await assert.rejects(speak('あ')); await assert.rejects(speak('あ'.repeat(1001)));
});
test('per-minute attempt cap resets but total characters do not', async () => {
  let now = 0, calls = 0;
  const speak = createSpeechSynthesizer(env, { now: () => now, headers, fetch: async () => { calls++; return Response.json({ audioContent: 'SUQz' }); } })!;
  for (let i = 0; i < 30; i++) await speak('あ');
  await assert.rejects(speak('あ')); assert.equal(calls, 30);
  now = 60000; await speak('あ'); assert.equal(calls, 31);
});


test('non-success upstream responses abort the transport on cleanup', async () => {
  let signal: AbortSignal | null | undefined;
  const speak = createSpeechSynthesizer(env, { headers, fetch: async (_url, init) => {
    signal = init?.signal;
    return new Response('upstream error', { status: 503 });
  } })!;
  await assert.rejects(speak('あ'));
  assert.equal(signal?.aborted, true);
});

test('Gemini uses the stored character and returns browser-ready WAV from PCM', async () => {
  const voices: string[] = [];
  const speak = createSpeechSynthesizer({ ...env, TTS_PROVIDER: 'gemini', GOOGLE_CLOUD_PROJECT: 'example-project' }, {headers, fetch: async (url, init) => {
    assert.match(String(url), /projects\/example-project\/locations\/global\/publishers\/google\/models\/gemini-3.8-flash-tts:generateContent$/);
    const req = JSON.parse(String(init?.body));
    voices.push(req.generationConfig.speechConfig.voiceConfig.voice);
    assert.equal(req.contents[0].parts[0].text, 'こんにちは');
    assert.ok(req.contents[0].parts[0].speechMetadata.style);
    return Response.json({ candidates: [{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=24000', data:'AQI='}}]}}] });
  }})!;
  await assert.rejects(speak('こんにちは','unknown'));
  for (const scene of ['shop','bookstore','station']) {
    const wave = Buffer.from(await speak('こんにちは',scene),'base64');
    assert.equal(wave.toString('ascii',8,12),'WAVE');
    assert.equal(wave.readUInt32LE(24),24000);
    assert.deepEqual([...wave.subarray(44)], [1,2]);
  }
  assert.deepEqual(voices, ['Fola','Charon','Sulafat']);
});

test('a stalled quota reservation consumes the speech deadline and cannot later start synthesis', async () => {
  let release!: () => void, authCalls = 0;
  const speak = createSpeechSynthesizer({...env,TTS_TIMEOUT_MS:'10'}, {
    reserve: () => new Promise<void>(r => { release = r; }),
    headers: async () => { authCalls++; return headers(); }, fetch: async () => assert.fail('late synthesis'),
  })!;
  await assert.rejects(speak('こんにちは'), /deadline/);
  release(); await new Promise(r => setImmediate(r)); assert.equal(authCalls,0);
});
