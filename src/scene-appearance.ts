import { characters, defaultCharacterId, type CharacterId } from '../shared/scene-characters';
import { conversationScenarios, type ConversationScenario } from './conversation-scenarios';

/** Use the place's backdrop and the selected person's expressions independently. */
export function sceneAppearance(sceneId: string, characterId?: CharacterId): ConversationScenario {
  const place = conversationScenarios.find(scene => scene.id === (sceneId === 'shop' ? 'supermarket' : sceneId));
  const id = characterId ?? defaultCharacterId(sceneId);
  const person = conversationScenarios.find(scene => scene.id === (characters[id].voiceSceneId === 'shop' ? 'supermarket' : characters[id].voiceSceneId));
  if (!place || !person) throw new Error('Unknown scene appearance');
  return { ...place, character: person.character, age: person.age, profile: person.profile,
    assets: { background: place.assets.background, expressions: person.assets.expressions } };
}
