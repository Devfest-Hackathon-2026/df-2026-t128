import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createVoicePlayer } from './voice-output';

function audio(finish = true) {
  const sources: { stops: number; disconnected: number }[] = [];
  const samples: Float32Array[] = [];
  const context = {
    state: 'running', currentTime: 0, destination: {}, resume: async () => {},
    decodeAudioData: async () => ({ duration: 0.01 }),
    createBuffer: (_channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      // Retain the arrays so the decoded sample ordering is observable.
      samples.push(data);
      return { duration: length / rate, getChannelData: () => data };
    },
    createBufferSource: () => {
      const source = { stops: 0, disconnected: 0, buffer: null, onended: null as (() => void) | null,
        connect() {}, disconnect() { this.disconnected++; }, stop() { this.stops++; },
        start() { if (finish) setTimeout(() => this.onended?.(), 0); },
      };
      sources.push(source); return source;
    },
  };
  return { context: context as unknown as AudioContext, sources, samples };
}
function pcm(body: ReadableStream<Uint8Array>) {
  return new Response(body, { headers: { 'Content-Type': 'audio/x-kindsignal-pcm' } });
}
const timeout = (error: unknown) => error instanceof DOMException && error.name === 'TimeoutError';

test('stalled fetch times out without retries, and a late response cannot play', async () => {
  const fixture = audio(); let release!: (value: Response) => void, calls = 0;
  const play = createVoicePlayer({ context: () => fixture.context, requestTimeoutMs: 10,
    fetch: async () => { calls++; return new Promise(resolve => { release = resolve; }); },
  });
  await assert.rejects(play(undefined, 'synthetic', 0, new AbortController().signal, () => assert.fail('Late playback')), timeout);
  release(Response.json({ audioContent: 'AQI=' })); await delay(10);
  assert.equal(calls, 1); assert.equal(fixture.sources.length, 0);
});

test('a stream that stops delivering cancels its reader and queued audio', async () => {
  const fixture = audio(false); let cancelled = 0;
  const play = createVoicePlayer({ context: () => fixture.context, requestTimeoutMs: 10,
    fetch: async () => pcm(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 0])); },
      cancel() { cancelled++; },
    })),
  });
  await assert.rejects(play(undefined, 'synthetic', 0, new AbortController().signal, () => {}), timeout);
  await delay(10);
  assert.equal(cancelled, 1); assert.equal(fixture.sources.length, 1);
  assert.equal(fixture.sources[0].stops, 1);
  assert.ok(fixture.sources[0].disconnected > 0);
});

test('split PCM sample bytes preserve ordering and finish normally', async () => {
  const fixture = audio(); let started = 0;
  const play = createVoicePlayer({ context: () => fixture.context, totalTimeoutMs: 2000,
    fetch: async (_url, options) => {
      assert.equal(options?.credentials, 'same-origin');
      assert.equal(options?.redirect, 'error');
      return pcm(new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array([1])); controller.enqueue(new Uint8Array([0, 2, 0])); controller.close();
      } }));
    },
  });
  await play(undefined, 'synthetic', 0, new AbortController().signal, () => { started++; });
  assert.equal(started, 1);
  assert.deepEqual(Array.from(fixture.samples[0]), [1 / 32768, 2 / 32768]);
  assert.equal(fixture.sources[0].stops, 0);
  assert.ok(fixture.sources[0].disconnected > 0);
});

test('explicit cancellation stays an AbortError and a later requested playback can succeed', async () => {
  const fixture = audio(false); let calls = 0, cancelled = 0, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const play = createVoicePlayer({ context: () => fixture.context, totalTimeoutMs: 2000,
    fetch: async () => {
      calls++;
      if (calls > 1) { fixture.context.createBufferSource = audio().context.createBufferSource; return Response.json({ audioContent: 'AQI=' }); }
      return pcm(new ReadableStream({ start() { entered(); }, cancel() { cancelled++; } }));
    },
  });
  const controller = new AbortController();
  const pending = play(undefined, 'synthetic', 0, controller.signal, () => {});
  await ready; controller.abort();
  await assert.rejects(pending, error => error instanceof DOMException && error.name === 'AbortError');
  await delay(10); assert.equal(cancelled, 1);
  await play(undefined, 'synthetic', 0, new AbortController().signal, () => {});
  assert.equal(calls, 2);
});

test('suspended browser audio resume is bounded before fetching', async () => {
  const fixture = audio(); let resume!: () => void, calls = 0;
  fixture.context.resume = () => new Promise(resolve => { resume = resolve; });
  const play = createVoicePlayer({ context: () => fixture.context, totalTimeoutMs: 10,
    fetch: async () => { calls++; return Response.json({ audioContent: 'AQI=' }); },
  });
  await assert.rejects(play('/voices/synthetic.mp3', 'synthetic', 0, new AbortController().signal, () => {}, true), timeout);
  resume(); await delay(10);
  assert.equal(calls, 0); assert.equal(fixture.sources.length, 0);
});

test('missing audio ended events cannot keep playback pending forever', async () => {
  const fixture = audio(false);
  const play = createVoicePlayer({ context: () => fixture.context, totalTimeoutMs: 10,
    fetch: async () => Response.json({ audioContent: 'AQI=' }),
  });
  await assert.rejects(play(undefined, 'synthetic', 0, new AbortController().signal, () => {}), timeout);
  await delay(60);
  assert.equal(fixture.sources[0].stops, 1);
});
