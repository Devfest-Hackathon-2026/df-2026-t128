// Run after npm run build. No network unless --live is explicitly supplied.
import { open } from 'node:fs/promises';
import { createProvider } from '../dist-server/server/provider.js';
import { serviceQuota } from '../dist-server/server/durable-quota.js';
import { withGenerationLimits } from '../dist-server/server/generation-limits.js';
import { collectSafetyEvaluation, plannedCalls, safetyCases } from '../dist-server/server/safety-evaluation.js';

const args = process.argv.slice(2);
try {
  const live = args[0] === '--live';
  if ((!live && (args.length !== 1 || args[0] !== '--dry-run')) ||
      (live && (args.length !== 3 || !/^[1-3]$/.test(args[2])))) {
    throw new Error('Usage: node scripts/safety-eval.mjs --dry-run | --live OUTPUT_FILE REPETITIONS(1-3)');
  }
  const repetitions = live ? Number(args[2]) : 1;
  const plan = { repetitions, maximumCalls: plannedCalls(repetitions), cases: safetyCases };
  if (!live) {
    console.log(JSON.stringify({ status: 'not-run', ...plan }, null, 2));
  } else {
    if (process.env.AI_PROVIDER !== 'gemini') throw new Error('Set AI_PROVIDER=gemini explicitly');
    const model = process.env.GEMINI_MODEL?.trim();
    const backend = process.env.GEMINI_BACKEND ?? 'developer';
    const provider = withGenerationLimits(createProvider(process.env), undefined, undefined, serviceQuota(process.env));
    // Reserve a private new output file before spending any provider calls.
    const file = await open(args[1], 'wx', 0o600);
    const startedAt = new Date().toISOString();
    const metadata = { startedAt, model, backend, ...plan };
    try {
      await file.writeFile(JSON.stringify({ ...metadata, status: 'incomplete' }) + '\n');
      const result = await collectSafetyEvaluation(provider, repetitions);
      const report = JSON.stringify({ ...metadata, finishedAt: new Date().toISOString(), ...result }, null, 2) + '\n';
      await file.truncate(0);
      await file.write(report, 0, 'utf8');
      console.log(`Collected ${result.attemptedCalls} calls. Human review is required; this is not a safety pass.`);
      if (result.records.some(record => record.error)) process.exitCode = 2;
    } finally { await file.close(); }
  }
} catch {
  // Provider/auth/filesystem errors can contain sensitive diagnostics. Do not print them.
  console.error('Evaluation did not complete. Check build, arguments, Gemini configuration, and a new writable output path.');
  process.exitCode = 1;
}
