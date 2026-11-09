// Run after npm run build. No network unless --live is supplied.
import { createProvider } from '../dist-server/server/provider.js';
import { withGenerationLimits } from '../dist-server/server/generation-limits.js';
import { scenarios } from '../dist-server/shared/scenarios.js';

const project = 'kindsignal-devfest-2026';
const scenario = scenarios.find(s => s.id === 'shop');
const actionId = 'shop-approach';
if (!scenario?.actions.some(a => a.id === actionId && !a.endOnSelection)) throw Error('Invalid fixture');
const text = '何かお探しですか。よければ、探しているものを教えてください。';
const session = {
  id: 'synthetic-shop', scenarioId: scenario.id, actionId, mode: 'gemini',
  status: 'active', turnCount: 0, maxTurns: 3, messages: [{ role: 'assistant', text: scenario.opening }],
};
const [flag, ...extra] = process.argv.slice(2);
if (extra.length || !['--dry-run', '--live'].includes(flag)) throw Error('Use --dry-run or --live');
if (flag === '--dry-run') {
  console.log({ project, actionId, text, modelCalls: 0, maximumLiveCalls: 1 });
} else {
  const { GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GEMINI_MODEL } = process.env;
  if (GOOGLE_CLOUD_PROJECT !== project || !GOOGLE_CLOUD_LOCATION || !GEMINI_MODEL) {
    throw Error('Confirm project, location and Google publisher model before running');
  }
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = project;
  const provider = withGenerationLimits(createProvider({ ...process.env, AI_PROVIDER: 'gemini', GEMINI_BACKEND: 'vertex', AI_TIMEOUT_MS: '20000' }));
  const start = performance.now();
  try {
    const reply = await provider.reply(scenario, session, text);
    console.log(JSON.stringify({ project, model: GEMINI_MODEL, location: GOOGLE_CLOUD_LOCATION,
      elapsedMs: Math.round(performance.now() - start), reply }));
  } catch {
    console.error('Vertex reply unavailable. No retry. Verify ADC, IAM, model and location before any further call.');
    process.exitCode = 1;
  }
}
