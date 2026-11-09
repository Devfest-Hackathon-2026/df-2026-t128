// Credential-free browser helper. The parent signal represents an explicit stop.
export async function withVoiceDeadline<T>(parent: AbortSignal, milliseconds: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.reason);
  if (parent.aborted) cancel();
  else parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('音声の応答に時間がかかっています。', 'TimeoutError')), milliseconds);
  const rejectAbort = () => rejectCancelled(controller.signal.reason);
  let rejectCancelled!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
  controller.signal.addEventListener('abort', rejectAbort, { once: true });
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([cancelled, run(controller.signal)]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
    controller.abort();
  }
}
