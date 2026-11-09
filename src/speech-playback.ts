export type SpeechState = 'idle' | 'ready' | 'loading' | 'playing' | 'unavailable';
export interface SpeechAudio {
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
export interface SpeechResource { audio: SpeechAudio; release(): void }
export interface SpeechDependencies {
  request(sessionId: string, messageIndex: number): Promise<{ audioContent: string }>;
  createAudio(content: string): SpeechResource;
  onState(state: SpeechState): void;
}

/** A cancelled generation can never start audio, even if its HTTP request finishes later. */
export function createSpeechPlayback(deps: SpeechDependencies) {
  let generation = 0;
  let state: SpeechState = 'idle';
  let resource: SpeechResource | undefined;
  let detach = () => {};
  const setState = (next: SpeechState) => { state = next; deps.onState(next); };
  const cleanup = () => {
    detach();
    detach = () => {};
    const previous = resource;
    resource = undefined;
    if (previous) { previous.audio.pause(); previous.release(); }
  };
  const stop = () => { generation++; cleanup(); setState('idle'); };
  const play = async (epoch: number) => {
    try {
      // Invoked synchronously from toggle's ready branch, retaining the click gesture.
      await resource!.audio.play();
    } catch (error) {
      if (epoch !== generation) return;
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // Safari may require another gesture after synthesis. Keep the fetched audio.
        setState('ready');
        return;
      }
      generation++;
      cleanup();
      setState('unavailable');
    }
  };
  const toggle = async (sessionId: string, messageIndex: number) => {
    if (state === 'loading' || state === 'playing') { stop(); return; }
    if (state === 'ready' && resource) {
      setState('loading');
      return play(generation);
    }
    const epoch = ++generation;
    setState('loading');
    try {
      const response = await deps.request(sessionId, messageIndex);
      if (epoch !== generation) return;
      if (typeof response.audioContent !== 'string' || !response.audioContent) throw new Error('No audio');
      resource = deps.createAudio(response.audioContent);
      const audio = resource.audio;
      const current = (callback: () => void) => () => { if (epoch === generation) callback(); };
      const fail = current(() => { generation++; cleanup(); setState('unavailable'); });
      const listeners: [string, () => void][] = [
        ['playing', current(() => setState('playing'))],
        ['waiting', current(() => setState('loading'))],
        ['pause', current(stop)],
        ['ended', current(stop)],
        ['error', fail],
      ];
      listeners.forEach(([type, listener]) => audio.addEventListener(type, listener));
      detach = () => listeners.forEach(([type, listener]) => audio.removeEventListener(type, listener));
      // The playing event, not a request completing or play() being called, drives the UI.
      await play(epoch);
    } catch {
      if (epoch !== generation) return;
      generation++;
      cleanup();
      setState('unavailable');
    }
  };
  return { toggle, stop, dispose: stop };
}

export function createBrowserSpeechAudio(content: string): SpeechResource {
  const binary = atob(content);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: binary.startsWith('RIFF') ? 'audio/wav' : 'audio/mpeg' }));
  const audio = new Audio(url);
  return { audio, release: () => { audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); } };
}
