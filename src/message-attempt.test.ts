import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageAttempt } from './message-attempt.js';

const fixture = () => { let id = 0; return createMessageAttempt(() => `id-${++id}`); };

test('network/timeout/response decoding/409 failures reuse ID until acknowledgement', async () => {
  const attempt = fixture();
  const bodies: unknown[] = [];
  for (const error of [new TypeError('network'), new DOMException('timeout', 'TimeoutError'), new SyntaxError('JSON'), new Error('processing')]) {
    await assert.rejects(attempt.send('session', '  hello ', async body => { bodies.push(body); throw error; }));
  }
  await attempt.send('session', 'hello', async body => { bodies.push(body); return 'ok'; });
  assert.deepEqual(bodies, Array(5).fill({ text: 'hello', requestId: 'id-1' }));
  await attempt.send('session', 'hello', async body => assert.equal(body.requestId, 'id-2'));
});

test('edited text and new sessions create new logical sends', async () => {
  const attempt = fixture();
  await assert.rejects(attempt.send('session', 'old', async () => { throw Error('lost'); }));
  await assert.rejects(attempt.send('session', 'new', async body => { assert.equal(body.requestId, 'id-2'); throw Error('lost'); }));
  await attempt.send('other', 'new', async body => assert.equal(body.requestId, 'id-3'));
});

test('synchronous double submit cannot start another request', async () => {
  const attempt = fixture(); let finish!: () => void; let calls = 0;
  const first = attempt.send('session', 'hello', async () => { calls++; await new Promise<void>(r => { finish = r; }); });
  await assert.rejects(attempt.send('session', 'hello', async () => { calls++; }));
  finish(); await first;
  assert.equal(calls, 1);
});

test('navigation/reset drops retry data and late success cannot erase or unlock newer attempt', async () => {
  const attempt = fixture(); let oldFinish!: () => void, newFail!: (error: Error) => void;
  const old = attempt.send('old', 'hello', async () => new Promise<void>(r => { oldFinish = r; }));
  attempt.clear();
  const current = attempt.send('new', 'hello', async body => {
    assert.equal(body.requestId, 'id-2');
    return new Promise<void>((_, reject) => { newFail = reject; });
  });
  oldFinish(); await old;
  await assert.rejects(attempt.send('new', 'hello', async () => assert.fail('must stay locked')));
  const rejected = assert.rejects(current); newFail(Error('lost')); await rejected;
  await attempt.send('new', 'hello', async body => assert.equal(body.requestId, 'id-2'));
  attempt.clear();
  await attempt.send('new', 'hello', async body => assert.equal(body.requestId, 'id-3'));
});
