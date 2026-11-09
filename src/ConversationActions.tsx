import type { ProviderMode } from '../shared/types';

export function ConversationModeNote({ mode }: { mode: ProviderMode }) {
  return <p className="conversation-mode-note">
    {mode === 'demo'
      ? 'この練習では、あらかじめ用意した返事が流れます。'
      : '入力した言葉はGeminiに送られます。'}
  </p>;
}
