import { spokenLine } from '../shared/spoken-line';
import type { ReactNode } from 'react';
import { DeviceVoice } from './DeviceVoice';
import type { Scenario, Session } from '../shared/types';
import { ConversationStage } from './ConversationStage';
import { sceneAppearance } from './scene-appearance';
import { SpeechPlayback } from './SpeechPlayback';

type SceneProps = {scenario: Scenario; session: Session | null};
export function LinePlayback({scenario, session, waiting, cloudVoice, voiceOn}: SceneProps & {
  waiting:boolean; cloudVoice:boolean; voiceOn:boolean;
}) {
  if (!session || !voiceOn) return null;
  const index = session.messages.reduce((n,m,i)=>m.role === 'assistant' ? i : n,-1);
  const text = spokenLine(session.messages[index]?.text ?? scenario.opening);
  if (!text) return null;
  return cloudVoice ? <SpeechPlayback key={session.id+':'+index+':'+waiting} text={text} sessionId={session.id} messageIndex={index} disabled={waiting || session.status !== 'active'} />
    : <DeviceVoice key={index} text={text} enabled disabled={waiting || session.status !== 'active'} />;
}

export function ConversationExperience({scenario, session, reducedMotion, children}: SceneProps & {reducedMotion:boolean; children:ReactNode}) {
  const latest = [...(session?.messages ?? [])].reverse().find(message => message.role === 'assistant');
  return <ConversationStage scenario={sceneAppearance(scenario.id, session?.characterId ?? scenario.characterId)} reducedMotion={reducedMotion} reply={{
    reply:latest?.text ?? scenario.opening, expression:latest?.expression ?? (scenario.id === 'station' ? 'confused' : 'neutral'), conversationEnded:!!session && session.status !== 'active'
  }}>{children}</ConversationStage>;
}

export function ConversationHistory({ session, scenario }: {session: Session; scenario: Scenario}) {
  return <div className="conversation-record">
    <div className="story-history">{session.messages.map((message, i) => <p key={i}><strong>{message.role === 'user' ? (message.kind==='action'?'あなたの行動':'あなた') : scenario.character}</strong>{message.text}</p>)}</div>
  </div>;
}
