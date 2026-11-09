import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from '../shared/scenarios';
import { characterIds, characters, withCharacter } from '../shared/scene-characters';
import { practiceCharacterId, selectPracticeScenario } from './practice-selection';

test('same-person retry preserves all nine combinations without drawing again or changing the base data', () => {
  const original = structuredClone(scenarios);
  for (const place of scenarios) for (const id of characterIds) {
    const previous = withCharacter(place, id);
    const retry = selectPracticeScenario(scenarios, previous, practiceCharacterId({ scenarioId: place.id, characterId: id }), () => {
      throw new Error('Same-person retry must not draw');
    });
    assert.deepEqual(retry, previous);
    assert.notEqual(retry, previous);
  }
  assert.deepEqual(scenarios, original);
});

test('reroll rebuilds original actions and allows all three people, including the same one', () => {
  const place = scenarios.find(scene => scene.id === 'bookstore')!;
  const previous = withCharacter(place, 'tanaka');
  const draws = [0, .4, .8].map(draw => selectPracticeScenario(scenarios, previous, undefined, () => draw));
  assert.deepEqual(draws.map(scene => scene.characterId), ['tanaka', 'sato', 'yamamoto']);
  assert.deepEqual(draws[1].actions, place.actions);
  assert.equal(draws[1].actions[0].endOnSelection, 'respect');
  assert.equal(draws[0].actions[0].endOnSelection, undefined);
  assert.equal(draws[2].actions[0].endOnSelection, undefined);
});

test('legacy sessions retry with their original person; explicit identity takes priority', () => {
  assert.deepEqual(scenarios.map(scene => practiceCharacterId({ scenarioId: scene.id })), ['tanaka', 'sato', 'yamamoto']);
  assert.equal(practiceCharacterId({ scenarioId: 'bookstore', characterId: 'yamamoto' }), 'yamamoto');
});

test('combination guidance retains place and person without imposing refusal on other people', () => {
  for (const place of scenarios) for (const id of characterIds) {
    const scene = selectPracticeScenario(scenarios, place, id);
    for (const other of characterIds.filter(value => value !== id)) {
      assert.ok(!scene.description.includes(characters[other].name));
    }
    const subject = { shop: 'お茶', bookstore: '本', station: '帰り' }[place.id]!;
    assert.ok(scene.completionHint.includes(subject));
    if (id === 'sato') assert.match(scene.completionHint, /意思を尊重/);
    else assert.doesNotMatch(scene.completionHint, /断る|断られ|意思を尊重して.*終える/);
    assert.deepEqual(scene.actions.map(action => action.id), place.actions.map(action => action.id));
  }
});

test('missing base place is rejected instead of reusing another person’s adapted actions', () => {
  assert.throws(() => selectPracticeScenario([], withCharacter(scenarios[1], 'tanaka'), 'sato'));
});
