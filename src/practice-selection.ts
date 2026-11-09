import { defaultCharacterId, pickCharacterId, withCharacter, type CharacterId } from '../shared/scene-characters';
import type { Scenario, Session } from '../shared/types';

/** Always rebuild from the place definition, not the previous person's action overrides. */
export function selectPracticeScenario(
  places: readonly Scenario[], scene: Scenario, characterId?: CharacterId, random = Math.random,
): Scenario {
  const place = places.find(item => item.id === scene.id);
  if (!place) throw new Error('Unknown practice place');
  return withCharacter(place, characterId ?? pickCharacterId(random));
}

/** A completed session is authoritative; old sessions retain their original default person. */
export function practiceCharacterId(session: Pick<Session, 'scenarioId' | 'characterId'>): CharacterId {
  return session.characterId ?? defaultCharacterId(session.scenarioId);
}
