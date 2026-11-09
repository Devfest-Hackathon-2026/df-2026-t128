import type {InputKind} from '../shared/player-input';
/** One unresolved logical send per mounted experience. Never persisted to storage. */
export function createMessageAttempt(newId: () => string = () => crypto.randomUUID()) {
  let attempt: { sessionId: string; kind: InputKind; text: string; requestId: string } | undefined;
  let inFlight = false;
  let epoch = 0;
  return {
    get sending() { return inFlight; },
    clear() { epoch++; attempt = undefined; inFlight = false; },
    async send<T>(sessionId: string, draft: string, send: (body: { text: string; requestId: string; kind?: InputKind }) => Promise<T>, kind: InputKind = 'speech'): Promise<T> {
      if (inFlight) throw new Error('返答を待っています。しばらくお待ちください。');
      const text = draft.trim();
      if (!text) throw new Error('声かけを入力してください。');
      if (!attempt || attempt.sessionId !== sessionId || attempt.text !== text || attempt.kind !== kind) {
        attempt = { sessionId, kind, text, requestId: newId() };
      }
      const current = attempt;
      const started = epoch;
      inFlight = true;
      try {
        const result = await send({ text: current.text, requestId: current.requestId, ...(kind !== 'speech' ? {kind} : {}) });
        if (epoch === started && attempt === current) attempt = undefined;
        return result;
      } finally {
        // A failure intentionally keeps the ID, including timeout/invalid JSON/409.
        // A late response must not unlock or erase a newer experience's attempt.
        if (epoch === started) inFlight = false;
      }
    },
  };
}
