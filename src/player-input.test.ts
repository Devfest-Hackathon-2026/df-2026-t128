import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePlayerInput, playerInputLimit } from '../shared/player-input';
import { createMessageAttempt } from './message-attempt';

test('speech and actions preserve the supplied text within the 500-character API limit', () => {
  assert.equal(encodePlayerInput('speech', ' 少し待つ '), '少し待つ');
  assert.equal(encodePlayerInput('action', ' 少し待つ '), '少し待つ');
  assert.equal(encodePlayerInput('action', 'あ'.repeat(playerInputLimit('action'))).length, 500);
  assert.throws(() => encodePlayerInput('action', 'あ'.repeat(501)));
  assert.throws(() => encodePlayerInput('action', '  '));
});

test('retry of an action reuses its ID, while sending the same words as speech is a different operation', async () => {
  let serial = 0;
  const attempts = createMessageAttempt(() => String(++serial));
  const sent: { text: string; requestId: string }[] = [];
  const fail = async (body: { text: string; requestId: string }) => { sent.push(body); throw new Error('synthetic offline'); };
  for (let i = 0; i < 2; i++) await assert.rejects(attempts.send('session', encodePlayerInput('action', '少し待つ'), fail, 'action'));
  await assert.rejects(attempts.send('session', encodePlayerInput('speech', '少し待つ'), fail));
  assert.equal(sent[0].requestId, sent[1].requestId);
  assert.notEqual(sent[1].requestId, sent[2].requestId);
});
