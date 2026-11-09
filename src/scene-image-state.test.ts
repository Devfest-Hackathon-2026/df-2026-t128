import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedExpression, sceneImageProgress } from './scene-image-state';

const images = { neutral: '/neutral.webp', confused: '/confused.webp', cautious: '/cautious.webp', relieved: '/relieved.webp' };

test('delayed expression retains the decoded portrait until the requested image is ready', () => {
  const states = { '/neutral.webp': 'loaded' as const };
  assert.equal(displayedExpression('confused', 'neutral', images, states), 'neutral');
  assert.equal(displayedExpression('confused', 'neutral', images, { ...states, '/confused.webp': 'loaded' }), 'confused');
});

test('failed expression keeps the previous portrait and can recover on reload', () => {
  assert.equal(displayedExpression('cautious', 'neutral', images, { '/neutral.webp': 'loaded', '/cautious.webp': 'failed' }), 'neutral');
  assert.equal(displayedExpression('cautious', null, images, {}), null);
  assert.equal(displayedExpression('cautious', null, images, { '/cautious.webp': 'loaded' }), 'cautious');
});

test('a late decode of another expression cannot replace the currently requested portrait', () => {
  const states = { '/neutral.webp': 'loaded' as const, '/confused.webp': 'loaded' as const, '/relieved.webp': 'loaded' as const };
  assert.equal(displayedExpression('relieved', 'neutral', images, states), 'relieved');
  assert.equal(displayedExpression('neutral', 'relieved', images, states), 'neutral');
});

test('loading and errors concern the background and requested portrait, not unused expressions', () => {
  assert.deepEqual(sceneImageProgress('/bg.webp', images.neutral, {}), { failed: false, loading: true });
  const states = { '/bg.webp': 'loaded' as const, '/neutral.webp': 'loaded' as const, '/confused.webp': 'failed' as const };
  assert.deepEqual(sceneImageProgress('/bg.webp', images.neutral, states), { failed: false, loading: false });
  assert.deepEqual(sceneImageProgress('/bg.webp', images.confused, states), { failed: true, loading: false });
  assert.deepEqual(sceneImageProgress('/bg.webp', images.neutral, { '/bg.webp': 'failed' }), { failed: true, loading: true });
});
