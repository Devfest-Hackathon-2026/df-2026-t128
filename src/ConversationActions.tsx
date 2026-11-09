import type { ProviderMode } from '../shared/types';

export function ConversationModeNote({ mode }: { mode: ProviderMode }) {
  return <p className="conversation-mode-note">
    {mode === 'demo'
      ? 'この練習では、あらかじめ用意した返事が流れます。'
      : '入力した言葉はGeminiに送られます。'}
  </p>;
}

export function ConversationActions({ disabled, onFinish, onRespect }: {
  disabled: boolean; onFinish: () => void; onRespect: () => void;
}) {
  return <section className="conversation-end-actions" aria-label="会話の終え方">
    <div>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onFinish}>ここまでで振り返る</button>
    </div>
    <div>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onRespect}>意思を尊重して終える</button>
    </div>
  </section>;
}
