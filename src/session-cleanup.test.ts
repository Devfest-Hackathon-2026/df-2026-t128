import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSessionCleanup } from './session-cleanup';
import { createSessionReleaser } from './api';

test('ownership is synchronous, leave is idempotent, and replacement releases only the old session', () => {
  const calls: string[] = [];
  const release = async (id: string) => { calls.push(id); return true; };
  const cleanup = createSessionCleanup();
  cleanup.adopt('first', release); cleanup.adopt('first', release);
  assert.deepEqual(calls, []); // Message/end/reflection updates do not release it.
  cleanup.adopt('second', release);
  assert.deepEqual(calls, ['first']);
  cleanup.leave(); cleanup.leave();
  assert.deepEqual(calls, ['first', 'second']);
});

test('failed cleanup cannot block navigation or create an unhandled rejection', async () => {
  const cleanup = createSessionCleanup();
  cleanup.adopt('first', async () => { throw new Error('offline'); });
  cleanup.leave(); cleanup.leave();
  await new Promise(resolve => setImmediate(resolve));
});

test('App wires home/retry, timeout, unmount and stale creation without deleting on normal response updates', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  for (const name of ['selectScenario', 'goHome']) assert.match(app, new RegExp(`function ${name}[^]*?cleanup.current.leave\\(\\)`));
  assert.match(app, /useEffect\(\(\) => \(\) => \{\s*operation.current\+\+;\s*cleanup.current.leave\(\)/);
  assert.match(app, /const timer = window.setTimeout\(\(\) => \{\s*operation.current\+\+;\s*cleanup.current.leave\(\)/);
  assert.match(app, /cleanup.current.adopt\(result.session.id, release\);\s*accept\(result\);\s*\} else \{[^]*?void release\(result.session.id\)/);
  const accept = app.slice(app.indexOf('  function accept'), app.indexOf('  async function start'));
  assert.doesNotMatch(accept, /leave|release/);
});
