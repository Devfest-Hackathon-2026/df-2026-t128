import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationScenarios, nextDemoResponse } from './conversation-scenarios';
import { bookstoreAssets, bookstoreExpressions } from './bookstore.config';
import { bookstoreDemo } from './bookstore.demo';
import { existsSync } from 'node:fs';

test('bookstore keeps its original script and real image assets', () => {
  const scenario = conversationScenarios.find(scene => scene.id === 'bookstore')!;
  assert.equal(scenario.demo, bookstoreDemo);
  assert.equal(scenario.assets, bookstoreAssets);
  for (const path of [scenario.assets.background, ...Object.values(scenario.assets.expressions)]) {
    assert.ok(existsSync(`public${path}`), path);
  }
});

test('each character has isolated assets, four expressions, and a persistent intention', () => {
  const paths = new Set<string>();
  for (const scenario of conversationScenarios) {
    assert.ok(scenario.intention.length > 0);
    assert.deepEqual(Object.keys(scenario.assets.expressions).sort(), [...bookstoreExpressions].sort());
    for (const path of [scenario.assets.background, ...Object.values(scenario.assets.expressions)]) {
      assert.ok(!paths.has(path), `Shared character asset: ${path}`);
      paths.add(path);
    }
  }
  assert.equal(paths.size, 15);
});

test('each demo progresses to an ending and stays ended on further advances', () => {
  for (const scenario of conversationScenarios) {
    assert.equal(scenario.demo[0].conversationEnded, false);
    for (let turn = 0; turn < scenario.demo.length - 1; turn++) {
      const response = nextDemoResponse(scenario, turn);
      assert.equal(response, scenario.demo[turn + 1]);
      assert.ok(bookstoreExpressions.includes(response.expression));
      assert.ok(response.reply.trim());
    }
    assert.equal(nextDemoResponse(scenario, 100).conversationEnded, true);
    assert.equal(nextDemoResponse(scenario, 0), scenario.demo[1]);
  }
});

import { scenarios } from '../shared/scenarios';

test('the API and the illustrated demo introduce the same three people in the same order', () => {
  assert.equal(scenarios.length, 3);
  for (const [i, scene] of scenarios.entries()) {
    const person = conversationScenarios[i];
    assert.equal(scene.id === 'shop' ? 'supermarket' : scene.id, person.id);
    assert.ok(scene.character.includes(person.character));
    assert.equal(scene.opening, person.demo[0].reply);
  }
  assert.deepEqual(scenarios.filter(s => s.actions.some(a => a.endOnSelection === 'respect')).map(s => s.id), ['bookstore']);
});
