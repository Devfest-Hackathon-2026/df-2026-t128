export function positiveInteger(value: string | undefined, fallback: number, name: string, max: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}.`);
  }
  return Number(value);
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env) {
  // Memory sessions cannot survive revisions, restarts, or routing to another instance.
  // Require a deliberate operator acknowledgement in Cloud Run, never imply durability.
  if (env.K_SERVICE && env.ALLOW_EPHEMERAL_SESSIONS !== 'true') {
    throw new Error('Cloud Run requires ALLOW_EPHEMERAL_SESSIONS=true for the restricted single-instance pilot.');
  }
  return {

    host: env.HOST ?? (env.K_SERVICE ? '0.0.0.0' : '127.0.0.1'),
    port: positiveInteger(env.PORT, 8080, 'PORT', 65535),
    app: {
      ttlMs: positiveInteger(env.SESSION_TTL_SECONDS, 1800, 'SESSION_TTL_SECONDS', 1800) * 1000,
      maxSessions: positiveInteger(env.MAX_SESSIONS, 100, 'MAX_SESSIONS', 1000),
      maxConcurrentGenerations: positiveInteger(env.MAX_CONCURRENT_GENERATIONS, 4, 'MAX_CONCURRENT_GENERATIONS', 32),
    },
  };
}

