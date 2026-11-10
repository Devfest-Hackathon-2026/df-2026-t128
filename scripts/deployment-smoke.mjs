// Run only against a locally built demo. Never loads .env, ADC or cloud credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const hosting = JSON.parse(await readFile('firebase.json', 'utf8')).hosting;
assert.equal(hosting.public, 'dist');
assert.equal(hosting.rewrites[0].source, '/api/**', 'API rewrite must precede SPA fallback');
assert.equal(hosting.rewrites[0].run.serviceId, 'kindsignal-api');
assert.equal(hosting.rewrites[0].run.region, 'asia-northeast1');
assert.deepEqual(hosting.rewrites.at(-1), { source: '**', destination: '/index.html' });

const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const env = {
  PATH: process.env.PATH,
  NODE_ENV: 'production', AI_PROVIDER: 'demo',
  K_SERVICE: 'kindsignal-smoke', HOST: '127.0.0.1', PORT: String(port),
};
const launch = extra => {
  const child = spawn(process.execPath, ['dist-server/server/index.js'], {
    env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  return { child, exited: once(child, 'exit'), output: () => output };
};
const stop = async process => {
  if (process.child.exitCode !== null || process.child.signalCode !== null) return;
  process.child.kill('SIGTERM');
  const timer = setTimeout(() => process.child.kill('SIGKILL'), 10_000);
  try { await process.exited; } finally { clearTimeout(timer); }
};

// Cloud Run must refuse volatile sessions unless the operator acknowledges them.
const refused = launch({});
try {
  const outcome = await Promise.race([refused.exited, delay(5000, undefined, { ref: false }).then(() => { throw new Error('Unsafe startup did not exit'); })]);
  assert.notEqual(outcome[0], 0);
  assert.match(refused.output(), /ALLOW_EPHEMERAL_SESSIONS/);
} finally { await stop(refused); }

const base = `http://127.0.0.1:${port}`;
const request = (path, options = {}) => fetch(base + path, {
  ...options, signal: AbortSignal.timeout(1500), headers: { 'Content-Type': 'application/json', ...options.headers },
});
const waitUntilReady = async server => {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.child.exitCode !== null) throw new Error(`Server failed: ${server.output()}`);
    try { if ((await request('/api/health')).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'Built server must become healthy');
};

const server = launch({ ALLOW_EPHEMERAL_SESSIONS: 'true' });
try {
  await waitUntilReady(server);
  const health = await request('/api/health');
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const page = await request('/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<html/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')), 'Built page must reference JavaScript');
  assert.ok(assets.some(asset => asset.endsWith('.css')), 'Built page must reference CSS');
  for (const asset of assets) {
    const response = await request(asset);
    assert.equal(response.status, 200, `Missing built asset: ${asset}`);
    assert.match(response.headers.get('content-type') ?? '', asset.endsWith('.css') ? /text\/css/ : /javascript/);
    assert.ok((await response.text()).length > 0);
  }
  const notices = await request('/THIRD_PARTY_NOTICES.txt');
  assert.equal(notices.status, 200, 'Third-party notices must be publicly served');
  assert.match(notices.headers.get('content-type') ?? '', /text\/plain/);
  assert.equal(await notices.text(), await readFile('public/THIRD_PARTY_NOTICES.txt', 'utf8'), 'Distributed notices must exactly preserve the source file');
  assert.equal((await (await request('/api/config')).json()).mode, 'demo');
  const { scenarios } = await (await request('/api/scenarios')).json();
  assert.equal(scenarios.length, 3);
  for (const scenario of scenarios) {
    const started = await request('/api/sessions', { method: 'POST', body: JSON.stringify({ scenarioId: scenario.id, actionId: scenario.actions.find(action => !action.endOnSelection).id, adultConfirmed: true }) });
    assert.equal(started.status, 201);
    const { session } = await started.json();
    const cookie = started.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i); assert.match(cookie, /Secure/i);
    const path = '/api/sessions/' + session.id;
    const other = await request('/api/sessions', { method: 'POST', body: JSON.stringify({scenarioId:scenario.id,actionId:session.actionId,adultConfirmed:true}) });
    const otherHeaders = {Cookie:other.headers.get('set-cookie').split(';')[0]};
    for (const [op, body] of [['messages',{text:'test'}],['end',{reason:'finish'}],['reflection',{}],['speech',{messageIndex:0}]]) {
      assert.equal((await request(path+'/'+op,{method:'POST',headers:otherHeaders,body:JSON.stringify(body)})).status,404);
    }
    assert.equal((await request(path,{method:'DELETE',headers:otherHeaders})).status,204);
    const own = (url, options) => request(url, {...options, headers:{Cookie:cookie.split(';')[0]}});
    const replied = await own(`/api/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({ text: '何かお手伝いできることはありますか。' }) });
    assert.equal(replied.status, 200);
    assert.equal((await replied.json()).session.turnCount, 1);
    const ended = await own(`/api/sessions/${session.id}/end`, { method: 'POST', body: JSON.stringify({ reason: 'respect' }) });
    assert.equal(ended.status, 200);
    assert.equal((await ended.json()).session.status, 'completed');
    const reflection = await own(`/api/sessions/${session.id}/reflection`, { method: 'POST', body: '{}' });
    assert.equal(reflection.status, 200, 'Completed session retains its reflection before deletion');
    const reflected = await reflection.json();
    assert.ok(reflected.reflection, 'Reflection must contain a result, not null');
    assert.equal(reflected.reflection.conversation.source, 'demo');
    for (let attempt = 0; attempt < 2; attempt++) {
      const deleted = await own(`/api/sessions/${session.id}`, { method: 'DELETE' });
      assert.equal(deleted.status, 204, 'Deletion and retry are idempotent');
      assert.equal(await deleted.text(), '');
      assert.equal(deleted.headers.get('cache-control'), 'no-store');
    }
    for (const [operation, body] of Object.entries({ messages: { text: '再送' }, end: { reason: 'respect' }, reflection: {} })) {
      const unavailable = await own(`/api/sessions/${session.id}/${operation}`, {
        method: 'POST', body: JSON.stringify(body),
      });
      assert.equal(unavailable.status, 404, `Deleted session rejects ${operation}`);
    }
  }
  assert.equal((await request('/api/not-a-route')).status, 404);
  server.child.kill('SIGTERM');
  const outcome = await Promise.race([server.exited, delay(9500, undefined, { ref: false }).then(() => { throw new Error('SIGTERM shutdown exceeded 9.5 seconds'); })]);
  if (process.platform === 'win32') {
    // Windows terminates the process instead of delivering a catchable POSIX signal.
    // Do not describe this as proof of Cloud Run's graceful shutdown behavior.
    assert.deepEqual(outcome, [null, 'SIGTERM']);
    console.log('Windows process cleanup passed; graceful SIGTERM shutdown must be verified on Linux.');
  } else {
    assert.deepEqual(outcome, [0, null]);
    console.log('Graceful SIGTERM shutdown passed.');
  }
  console.log('Deployment smoke passed: Hosting config, ephemeral startup guard, anonymous cookie ownership, local built JS/CSS and exact third-party notices, 3 demo scenarios, reflection, idempotent deletion, post-deletion rejection. No cloud calls.');
} finally { await stop(server); }

// Startup/config checks only: no generation, credentials lookup or cloud calls.
// Paid providers must not require a durable counter, and stale cumulative settings
// must not reintroduce the removed gate when the next revision starts.
for (const legacy of [false, true]) {
  const configured = launch({
    ALLOW_EPHEMERAL_SESSIONS: 'true', AI_PROVIDER: 'gemini', GEMINI_BACKEND: 'vertex',
    GOOGLE_CLOUD_PROJECT: 'synthetic-project', GOOGLE_CLOUD_LOCATION: 'global',
    GEMINI_MODEL: 'synthetic-model', TTS_PROVIDER: 'gemini',
    ...(legacy ? { AI_MAX_SERVICE_ATTEMPTS: '1', AI_MAX_PROCESS_ATTEMPTS: '1',
      TTS_MAX_TOTAL_CHARACTERS: '1', AI_QUOTA_STORE: 'sqlite',
      AI_QUOTA_FILE: '/not-used/kindsignal.sqlite' } : {}),
  });
  try {
    await waitUntilReady(configured);
    const config = await (await request('/api/config')).json();
    assert.equal(config.mode, 'gemini');
    assert.equal(config.cloudSpeech, true);
  } finally { await stop(configured); }
}
console.log('Paid-provider startup passed with absent and obsolete cumulative settings; no model or speech requests sent.');

// Both operator dry-runs must work from a clean build after removed modules are gone.
// Each script exits before constructing a provider or looking up cloud credentials.
for (const script of ['safety-eval.mjs', 'vertex-one-reply.mjs']) {
  const child = spawn(process.execPath, ['scripts/' + script, '--dry-run'], {
    env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  let outcome;
  try { outcome = await exited; } finally { clearTimeout(timer); }
  assert.deepEqual(outcome, [0, null], script + ' dry-run failed: ' + output);
  assert.match(output, script === 'safety-eval.mjs' ? /"status": "not-run"/ : /modelCalls: 0/);
}
console.log('Operator dry-runs passed from the clean build; no cloud calls.');
