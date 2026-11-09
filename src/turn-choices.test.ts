import test from 'node:test';
import assert from 'node:assert/strict';
import { turnChoices } from '../shared/player-input.js';

test('a generated pair survives even if neither suggestion is a quoted utterance', () => {
  const generated = ['本人が示した図を一緒に見る', '青い矢印を先に指す'];
  for (const seed of [0,1]) {
    assert.deepEqual(new Set(turnChoices('station', '青い……これ。', generated, '', 2, seed)), new Set(generated));
  }
});

test('missing or repeated choices are replaced without losing the valid choice', () => {
  const choices = turnChoices('bookstore','放課後に図書室で読んだんだ。',['少し待つ','放課後のお話をもう少し聞く'],'少し待つ');
  assert.equal(choices.length, 2);
  assert.ok(choices.includes('放課後のお話をもう少し聞く'));
  assert.ok(!choices.includes('少し待つ'));
});
