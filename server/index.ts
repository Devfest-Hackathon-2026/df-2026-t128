import { createSpeechSynthesizer } from './speech.js';
import { createApp } from './app.js';
import { createProvider } from './provider.js';
import { loadServerConfig } from './config.js';
import { withGenerationLimits } from './generation-limits.js';
const config = loadServerConfig();
const raw = createProvider();
const speech = createSpeechSynthesizer();
const provider = withGenerationLimits(raw);
const app = createApp(provider, { ...config.app,
  secureCookie: Boolean(process.env.K_SERVICE || process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','::1'].includes(config.host)),
  synthesizeSpeech: speech,
});
const port = config.port;
const host = config.host;
const server = app.listen(port, host, () => console.log(`KindSignal API (${provider.mode}): http://${host}:${port}`));
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  app.locals.dispose();
  server.close();
  // Cloud Run sends SIGTERM before shutdown. Do not leave sockets alive indefinitely.
  const timer = setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 8000);
  timer.unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

