import { sceneAppearance } from './scene-appearance';
import type { CharacterId } from '../shared/scene-characters';

/** The real conversation and the fixed demo portray the same fictional person.
 * A generated reply alone is not evidence of a facial expression. */
export function SceneStage({ scene, caption, state = 'idle', thumbnail = false, characterId }: { characterId?: CharacterId; thumbnail?: boolean; scene: string; caption?: string; state?: 'idle' | 'speaking' | 'listening' }) {
  const person = sceneAppearance(scene, characterId);
  if (!person) return null;
  const art = <svg viewBox="0 0 720 470" preserveAspectRatio="xMidYMid slice" role="img" aria-label={person.location + 'にいる' + person.character + '（架空の人物）'}>
      <image href={person.assets.background} width="720" height="470" preserveAspectRatio="xMidYMid slice" />
      <image href={person.assets.expressions.neutral} x="140" y="30" width="440" height="550" preserveAspectRatio="xMidYMin meet" />
    </svg>;
  if (thumbnail) return art;
  return <div className={`scene-stage stage-${scene} character-${state}`}>
    {art}
    <div className="scene-location"><span className="location-dot" />{person.location}</div>
    {caption && <div className="scene-subtitle"><span>この場面のひと言</span><p>「{caption}」</p></div>}
    <span className="scene-fiction">架空の場面・人物</span>
  </div>;
}
