import { ControlIcon } from './ControlIcon';
import type { ProviderMode } from '../shared/types';

export function ConversationModeNote({ mode }: { mode: ProviderMode }) {
  return <p className="conversation-mode-note">
    {mode === 'demo'
      ? '定型応答デモ：返事は決まった順序で表示されます。入力の意味をAIが理解して返しているものではありません。'
      : 'AIとの練習：入力した言葉をGeminiに送り、架空の人物の返事を生成します。'}
  </p>;
}

export function ConversationActions({ disabled, onFinish, onRespect }: {
  disabled: boolean; onFinish: () => void; onRespect: () => void;
}) {
  return <section className="conversation-end-actions" aria-label="会話の終え方">
    <div>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onFinish} aria-describedby="finish-help"><ControlIcon name="book" />ここまでで振り返る</button>
      <p id="finish-help">途中でも会話を終えて、自分の声かけを振り返れます。</p>
    </div>
    <div>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onRespect} aria-describedby="respect-help"><ControlIcon name="leave" />意思を尊重して終える</button>
      <p id="respect-help">手助けを望まないと伝えられたときに。説得を続けずに終える選択です。</p>
    </div>
  </section>;
}
