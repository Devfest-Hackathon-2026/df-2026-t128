import { DeviceVoice } from './DeviceVoice';
import type { Scenario, Session } from '../shared/types';
import { ConversationStage } from './ConversationStage';
import { sceneAppearance } from './scene-appearance';
import { SpeechPlayback } from './SpeechPlayback';

export function ConversationExperience({ scenario, session, waiting, reducedMotion, voiceOn, cloudVoice }: {
  voiceOn: boolean; cloudVoice: boolean; scenario: Scenario; session: Session | null; waiting: boolean; reducedMotion: boolean;
}) {
  const latest = [...(session?.messages ?? [])].reverse().find(message => message.role === 'assistant');
  const latestIndex = session?.messages.reduce((found, message, index) => message.role === 'assistant' ? index : found, -1) ?? -1;
  return <>

    <ConversationStage scenario={sceneAppearance(scenario.id, session?.characterId ?? scenario.characterId)} reducedMotion={reducedMotion} reply={{
      reply: latest?.text ?? scenario.opening, expression: latest?.expression ?? (scenario.id === 'station' ? 'confused' : 'neutral'), conversationEnded: !!session && session.status !== 'active',
    }}>
      {session && <><p role="status">{waiting ? '返答を待っています…' : `${session.turnCount} / ${session.maxTurns} 往復`}</p>
      {cloudVoice && voiceOn ? <SpeechPlayback text={latest?.text ?? scenario.opening} key={`${session.id}:${latestIndex}:${waiting}`} sessionId={session.id} messageIndex={latestIndex} disabled={waiting || session.status !== 'active'} /> : <DeviceVoice key={latestIndex} text={latest?.text ?? scenario.opening} enabled={voiceOn} disabled={waiting || session.status !== 'active'} />}
    </>}
    </ConversationStage>
  </>;
}

export function ConversationHistory({ session, scenario }: {session: Session; scenario: Scenario}) {
  return <div className="conversation-record">
    <details className="story-history"><summary>ここまでの会話を見る <span>{session.messages.length}件</span></summary><div>{session.messages.map((message, i) => <p key={i}><strong>{message.role === 'user' ? 'あなた' : scenario.character}</strong>{message.text}</p>)}</div></details>
  </div>;
}
