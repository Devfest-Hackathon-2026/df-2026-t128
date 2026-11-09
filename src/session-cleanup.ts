export type ReleaseSession = (sessionId: string) => Promise<boolean>;

// Keep ownership outside React state so leaving immediately after a response
// still releases it, even before React has committed the next render.
export function createSessionCleanup() {
  let owned: { id: string; release: ReleaseSession } | null = null;
  function leave() {
    const previous = owned;
    owned = null;
    if (previous) void previous.release(previous.id).catch(() => false);
  }
  return {
    adopt(id: string, release: ReleaseSession) {
      if (owned?.id === id) return;
      leave();
      owned = { id, release };
    },
    leave,
  };
}
