import assert from 'node:assert/strict';
import test from 'node:test';
import { spokenLine } from '../shared/spoken-line.js';
test('gesture captions stay silent without erasing a hesitation or short answer', () => {
  assert.equal(spokenLine('（首を振る）'), '');
  assert.equal(spokenLine('青い……。（案内板を指す）あれ。'), '青い……。あれ。');
});
