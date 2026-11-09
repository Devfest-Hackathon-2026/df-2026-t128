import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { demoProvider, type Provider } from './provider.js';
import { scenarios } from '../shared/scenarios.js';
import { characterIds, characters, pickCharacterId, withCharacter } from '../shared/scene-characters.js';
import { buildCharacterInstruction } from './character-instruction.js';
import { sceneAppearance } from '../src/scene-appearance.js';
import type { SessionResponse } from '../shared/types.js';
import { practiceCharacterId, selectPracticeScenario } from '../src/practice-selection.js';

test('character lottery covers all three equal intervals and appearance keeps the place', () => {
  assert.deepEqual([0, 1 / 3, 2 / 3, .9999].map(value => pickCharacterId(() => value)), ['tanaka', 'sato', 'yamamoto', 'yamamoto']);
  for (const place of scenarios) for (const id of characterIds) {
    const visual = sceneAppearance(place.id, id);
    assert.equal(visual.assets.background, sceneAppearance(place.id).assets.background);
    assert.equal(visual.character, characters[id].name);
    const source = sceneAppearance(characters[id].voiceSceneId);
    assert.deepEqual(visual.assets.expressions, source.assets.expressions);
  }
});

for (const place of scenarios) for (const id of characterIds) {
  test(`${place.id}/${id}: identity survives replies, retries, voice and reflection`, async () => {
    const selected = withCharacter(place, id);
    const voiceKeys: string[] = [];
    const provider: Provider = {
      mode: 'demo',
      async reply(scene, session, text) {
        assert.equal(scene.characterId, id);
        assert.equal(session.characterId, id);
        assert.ok(scene.character.includes(characters[id].name));
        const instruction = buildCharacterInstruction(scene, session);
        assert.ok(instruction.includes(characters[id].name));
        assert.ok(instruction.includes(place.location));
        return demoProvider.reply(scene, session, text);
      },
      async reflect(scene, session) {
        assert.equal(scene.characterId, id);
        assert.equal(session.characterId, id);
        return demoProvider.reflect(scene, session);
      },
    };
    const app = createApp(provider, { authenticate: async () => 'fixture', synthesizeSpeech: async (_text, key) => { voiceKeys.push(key!); return 'aGVsbG8='; } });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const send = async (path: string, body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() as SessionResponse };
    };
    try {
      const created = await send('/api/sessions', { scenarioId: place.id, characterId: id, actionId: selected.actions[1].id, adultConfirmed: true });
      assert.equal(created.status, 201);
      let session = created.data.session;
      assert.equal(session.characterId, id);
      assert.equal(session.messages[0].text, selected.opening);
      assert.equal(session.status, 'active');
      const path = `/api/sessions/${session.id}`;
      assert.equal((await send(path + '/speech', { messageIndex: 0 })).status, 200);
      assert.deepEqual(voiceKeys, [characters[id].voiceSceneId]);
      assert.equal((await send(path + '/messages', { text: 'こんにちは', characterId: 'other' })).status, 400);
      for (let i = 0; i < 5; i++) {
        const body = { text: '本人の希望を確かめたいです。', requestId: `turn-${i}` };
        const reply = await send(path + '/messages', body);
        assert.equal(reply.status, 200);
        session = reply.data.session;
        assert.equal(session.characterId, id);
        assert.equal(session.turnCount, i + 1);
        assert.ok(session.messages.at(-1)?.expression);
        const retry = await send(path + '/messages', body);
        assert.equal(retry.status, 200);
        assert.deepEqual(retry.data.session, session);
      }
      assert.equal(session.status, 'completed');
      const reflection = await send(path + '/reflection', {});
      assert.equal(reflection.status, 200);
      assert.equal(reflection.data.session.characterId, id);
      assert.ok(reflection.data.reflection);
      // Same-person retry releases the old conversation and starts with a newly chosen action.
      const retryScene = selectPracticeScenario(scenarios, selected, practiceCharacterId(reflection.data.session));
      const released = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'DELETE' });
      assert.equal(released.status, 204);
      const restarted = await send('/api/sessions', {
        scenarioId: retryScene.id, characterId: retryScene.characterId,
        actionId: retryScene.actions[2].id, adultConfirmed: true,
      });
      assert.equal(restarted.status, 201);
      assert.notEqual(restarted.data.session.id, session.id);
      assert.equal(restarted.data.session.characterId, id);
      assert.equal(restarted.data.session.scenarioId, place.id);
      assert.equal(restarted.data.session.actionId, retryScene.actions[2].id);
      assert.equal(restarted.data.session.turnCount, 0);
      assert.equal(restarted.data.session.status, 'active');
      assert.equal(restarted.data.reflection, null);
      assert.equal(restarted.data.session.messages.length, 1);
      assert.equal(restarted.data.session.messages[0].text, selected.opening);
    } finally { app.locals.dispose(); server.close(); }
  });
}

test('bookstore refusal action is not imposed on the other two people', () => {
  const scene = scenarios.find(s => s.id === 'bookstore')!;
  assert.equal(withCharacter(scene, 'sato').actions[0].endOnSelection, 'respect');
  for (const id of ['tanaka', 'yamamoto'] as const) {
    assert.equal(withCharacter(scene, id).actions[0].endOnSelection, undefined);
    assert.ok(!withCharacter(scene, id).actions[0].reflection.includes('断る意思'));
  }
});

test('role instruction rejects a different person in the same place', () => {
  const scene = withCharacter(scenarios[0], 'tanaka');
  assert.throws(() => buildCharacterInstruction(scene, { scenarioId: scene.id, actionId: scene.actions[0].id, characterId: 'sato' }));
});
