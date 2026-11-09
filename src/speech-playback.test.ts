import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechPlayback, type SpeechAudio, type SpeechState } from './speech-playback';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class FakeAudio implements SpeechAudio {
  plays = 0;
  pauses = 0;
  listeners = new Map<string, Set<() => void>>();
  playResult = Promise.resolve();
  play() { this.plays++; return this.playResult; }
  pause() { this.pauses++; this.emit('pause'); }
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string) { [...this.listeners.get(type) ?? []].forEach(listener => listener()); }
}
function fixture() {
  const requests: ReturnType<typeof deferred<{audioContent: string}>>[] = [];
  const states: SpeechState[] = [];
  const audios: FakeAudio[] = [];
  let releases = 0;
  const controller = createSpeechPlayback({
    request: () => { const pending = deferred<{audioContent: string}>(); requests.push(pending); return pending.promise; },
    createAudio: () => { const audio = new FakeAudio(); audios.push(audio); return { audio, release: () => releases++ }; },
    onState: state => states.push(state),
  });
  return { controller, requests, states, audios, get releases() { return releases; } };
}

test('explicit play only, state reflects actual audio events, and ended releases audio', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  const playing = f.controller.toggle('session', 0);
  assert.equal(f.states.at(-1), 'loading');
  f.requests[0].resolve({ audioContent: 'audio' });
  await playing;
  assert.equal(f.audios[0].plays, 1);
  assert.equal(f.states.at(-1), 'loading');
  f.audios[0].emit('playing');
  assert.equal(f.states.at(-1), 'playing');
  f.audios[0].emit('waiting');
  assert.equal(f.states.at(-1), 'loading');
  f.audios[0].emit('playing');
  f.audios[0].emit('ended');
  assert.equal(f.states.at(-1), 'idle');
  assert.equal(f.releases, 1);
});

test('repeated click cancels pending generation; late audio never plays', async () => {
  const f = fixture();
  const first = f.controller.toggle('session', 0);
  await f.controller.toggle('session', 0);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ audioContent: 'late' });
  await first;
  assert.equal(f.audios.length, 0);
  assert.equal(f.states.at(-1), 'idle');
});

test('stop and dispose invalidate requests on new messages, waiting, session end or unmount', async () => {
  for (const method of ['stop', 'dispose'] as const) {
    const f = fixture();
    const first = f.controller.toggle('old', 0);
    f.controller[method]();
    const second = f.controller.toggle('new', 2);
    f.requests[1].resolve({ audioContent: 'new' });
    await second;
    f.audios[0].emit('playing');
    f.requests[0].reject(new Error('stale failure'));
    await first;
    assert.equal(f.states.at(-1), 'playing');
    f.controller[method]();
    assert.equal(f.audios[0].pauses, 1);
    assert.equal(f.releases, 1);
    f.audios[0].emit('playing');
    assert.equal(f.states.at(-1), 'idle');
  }
});

test('unconfigured/error response falls back to text and allows retry', async () => {
  const f = fixture();
  const first = f.controller.toggle('session', 0);
  f.requests[0].reject(new Error('unconfigured'));
  await first;
  assert.equal(f.states.at(-1), 'unavailable');
  const second = f.controller.toggle('session', 0);
  f.requests[1].resolve({ audioContent: '' });
  await second;
  assert.equal(f.states.at(-1), 'unavailable');
  assert.equal(f.audios.length, 0);
});

test('play failure releases resources and stale play rejection cannot overwrite cancellation', async () => {
  for (const cancel of [false, true]) {
    const pending = deferred<void>();
    const audio = new FakeAudio();
    audio.playResult = pending.promise;
    const states: SpeechState[] = [];
    let released = 0;
    const player = createSpeechPlayback({ request: async () => ({ audioContent: 'audio' }),
      createAudio: () => ({ audio, release: () => released++ }), onState: state => states.push(state) });
    const playing = player.toggle('session', 0);
    await Promise.resolve();
    if (cancel) player.stop();
    pending.reject(new Error('autoplay denied'));
    await playing;
    assert.equal(states.at(-1), cancel ? 'idle' : 'unavailable');
    assert.equal(released, 1);
  }
});

test('gesture rejection keeps fetched audio; second click plays synchronously without synthesis', async () => {
  const audio = new FakeAudio();
  audio.playResult = Promise.reject(new DOMException('User gesture required', 'NotAllowedError'));
  const states: SpeechState[] = [];
  let requests = 0;
  let releases = 0;
  const player = createSpeechPlayback({ request: async () => { requests++; return { audioContent: 'audio' }; },
    createAudio: () => ({ audio, release: () => releases++ }), onState: state => states.push(state) });
  await player.toggle('session', 0);
  assert.equal(states.at(-1), 'ready');
  assert.equal(releases, 0);
  audio.playResult = Promise.resolve();
  const retry = player.toggle('session', 0);
  // Before yielding the click stack, play() has already run.
  assert.equal(audio.plays, 2);
  assert.equal(requests, 1);
  assert.equal(states.at(-1), 'loading');
  audio.emit('playing');
  await retry;
  assert.equal(states.at(-1), 'playing');
  player.stop();
  assert.equal(releases, 1);
});

test('ready audio is released on cancellation/disposal and its events cannot restart playback', async () => {
  for (const method of ['stop', 'dispose'] as const) {
    const audio = new FakeAudio();
    audio.playResult = Promise.reject(new DOMException('User gesture required', 'NotAllowedError'));
    const states: SpeechState[] = [];
    let releases = 0;
    const player = createSpeechPlayback({ request: async () => ({ audioContent: 'audio' }),
      createAudio: () => ({ audio, release: () => releases++ }), onState: state => states.push(state) });
    await player.toggle('session', 0);
    assert.equal(states.at(-1), 'ready');
    player[method]();
    assert.equal(releases, 1);
    assert.equal(audio.pauses, 1);
    audio.emit('playing');
    assert.equal(states.at(-1), 'idle');
    assert.equal(audio.plays, 1);
  }
});

test('a late gesture rejection cannot restore ready state after cancellation', async () => {
  const pending = deferred<void>();
  const audio = new FakeAudio();
  audio.playResult = pending.promise;
  const states: SpeechState[] = [];
  let releases = 0;
  const player = createSpeechPlayback({ request: async () => ({ audioContent: 'audio' }),
    createAudio: () => ({ audio, release: () => releases++ }), onState: state => states.push(state) });
  const playing = player.toggle('session', 0);
  await Promise.resolve();
  player.stop();
  pending.reject(new DOMException('User gesture required', 'NotAllowedError'));
  await playing;
  assert.equal(states.at(-1), 'idle');
  assert.equal(releases, 1);
});
