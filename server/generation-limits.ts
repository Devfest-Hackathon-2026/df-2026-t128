import { performance } from 'node:perf_hooks';
import { positiveInteger } from './config.js';
import type { Provider } from './provider.js';

export class GenerationLimitError extends Error {
  constructor(readonly kind: 'total' | 'minute' | 'concurrent', readonly retrySeconds?: number) {
    super('Local generation attempt limit reached');
  }
}

export type GenerationLimits = {
  maxAttempts: number;
  maxAttemptsPerMinute: number;
  maxConcurrent: number;
};

export function loadGenerationLimits(env: NodeJS.ProcessEnv = process.env): GenerationLimits {
  return {
    maxAttempts: positiveInteger(env.AI_MAX_PROCESS_ATTEMPTS, 100, 'AI_MAX_PROCESS_ATTEMPTS', 10000),
    maxAttemptsPerMinute: positiveInteger(env.AI_MAX_ATTEMPTS_PER_MINUTE, 20, 'AI_MAX_ATTEMPTS_PER_MINUTE', 1000),
    maxConcurrent: positiveInteger(env.MAX_CONCURRENT_GENERATIONS, 4, 'MAX_CONCURRENT_GENERATIONS', 32),
  };
}

// One shared wrapper per application process. This is neither a global quota nor
// a currency/token budget. Restarting or creating another wrapper resets counts.
export function withGenerationLimits(
  provider: Provider,
  limits: GenerationLimits = loadGenerationLimits(),
  now: () => number = () => performance.now(),
  reserve?: () => void | Promise<void>,
): Provider {
  for (const [key, maximum] of [['maxAttempts', 10000], ['maxAttemptsPerMinute', 1000], ['maxConcurrent', 32]] as const) {
    const value = limits[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${key}`);
  }
  // Snapshot configuration so subsequent caller mutations cannot expand limits.
  const { maxAttempts, maxAttemptsPerMinute, maxConcurrent } = limits;
  if (provider.mode === 'demo') return provider;
  let total = 0;
  let inFlight = 0;
  let lastTime = -Infinity;
  let recent: number[] = [];
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    const time = now();
    // Fail closed on invalid/regressing injected clocks. Production is monotonic.
    if (!Number.isFinite(time) || time < lastTime) throw new Error('Invalid generation clock');
    lastTime = time;
    recent = recent.filter(start => time - start < 60000);
    if (total >= maxAttempts) throw new GenerationLimitError('total');
    if (recent.length >= maxAttemptsPerMinute) throw new GenerationLimitError('minute', Math.max(1, Math.ceil((60000 - (time - recent[0])) / 1000)));
    if (inFlight >= maxConcurrent) throw new GenerationLimitError('concurrent', 5);
    // Reserve synchronously before invoking the provider. Failures/timeouts do
    // not refund an attempt: a lost response may still have incurred a charge.
    total++;
    recent.push(time);
    inFlight++;
    try { if (reserve) await reserve(); return await operation(); } finally { inFlight--; }
  };
  return {
    mode: provider.mode,
    reply: (scenario, session, text, kind) => run(() => provider.reply(scenario, session, text, kind)),
    reflect: (scenario, session) => run(() => provider.reflect(scenario, session)),
  };
}
