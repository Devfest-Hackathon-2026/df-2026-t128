import { DeviceVoice } from './DeviceVoice';
import { ControlIcon } from './ControlIcon';
import { useEffect, useState } from 'react';
import { request } from './api';
import { createBrowserSpeechAudio, createSpeechPlayback, type SpeechState } from './speech-playback';

export function SpeechPlayback({ sessionId, messageIndex, disabled, text }: {
  sessionId: string; messageIndex: number; disabled: boolean; text: string;
}) {
  const [useDevice, setUseDevice] = useState(false);
  const [state, setState] = useState<SpeechState>('idle');
  const [player] = useState(() => createSpeechPlayback({
    request: (id, index) => request(`/api/sessions/${id}/speech`, { messageIndex: index }),
    createAudio: createBrowserSpeechAudio,
    onState: setState,
  }));
  useEffect(() => {
    player.stop();
    const timer = !disabled && messageIndex >= 0 ? window.setTimeout(() => { void player.toggle(sessionId,messageIndex); },0) : undefined;
    return () => { clearTimeout(timer); player.dispose(); };
  }, [player, sessionId, messageIndex, disabled]);
  if (useDevice) return <DeviceVoice text={text} enabled disabled={disabled} />;
  const busy = state === 'loading' || state === 'playing';
  return <div className="speech-playback">
    <button className="reveal-button" type="button" disabled={disabled || messageIndex < 0}
      onClick={() => { if (!disabled) void player.toggle(sessionId, messageIndex); }}
      title={busy ? '読み上げを停止' : '相手の言葉を読み上げる'}
      aria-label={busy ? '読み上げを停止' : '相手の言葉を読み上げる'}>
      <ControlIcon name={busy ? 'stop' : 'play'} />

    </button>
    {state === 'unavailable' && <button type="button" title="端末の声で聞く" aria-label="端末の声で聞く" disabled={disabled} onClick={() => setUseDevice(true)}><ControlIcon name="device" /></button>}
    <span className="listening-state" role="status" aria-live="polite">
      {state === 'unavailable' ? '音声を利用できません。文章で会話を続けられます。' : state === 'playing' ? '音声を再生しています' : state === 'ready' ? '音声の準備ができました。再生ボタンを押してください。' : ''}
    </span>
  </div>;
}
