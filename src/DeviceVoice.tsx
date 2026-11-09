import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlIcon } from './ControlIcon';

// Only the fictional character's line is spoken, using an installed Japanese voice.
export function DeviceVoice({ text, enabled, disabled }: { text: string; enabled: boolean; disabled: boolean }) {
  const [hint, setHint] = useState('');
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    if (utterance.current) {
      utterance.current.onend = utterance.current.onerror = utterance.current.onstart = null;
      utterance.current = null;
      window.speechSynthesis.cancel();
    }
  }, []);
  const play = useCallback(() => {
    stop(); setHint('');
    const synth = window.speechSynthesis;
    const voice = synth?.getVoices().find(v => v.localService && /^ja\b/i.test(v.lang.replace('_','-')));
    if (!voice) { setHint('端末の日本語音声を利用できません。'); return; }
    const line = new SpeechSynthesisUtterance(text);
    line.voice = voice; line.lang = voice.lang;
    utterance.current = line;
    line.onstart = () => setHint('');
    line.onend = () => { utterance.current = null; };
    line.onerror = () => { utterance.current = null; setHint('読み上げボタンで、もう一度再生できます。'); };
    synth.speak(line);
  }, [text, stop]);
  useEffect(() => {
    if (!enabled || disabled) { stop(); setHint(''); return; }
    const synth = window.speechSynthesis;
    let started = false;
    const start = () => {
      if (started) return;
      if (synth?.getVoices().some(v => v.localService && /^ja[-_]?/i.test(v.lang))) started = true;
      play();
    };
    const timer = window.setTimeout(start, 0);
    synth?.addEventListener('voiceschanged', start);
    return () => { clearTimeout(timer); synth?.removeEventListener('voiceschanged',start); stop(); };
  }, [enabled, disabled, play, stop]);
  return <div className="speech-playback">
    <button className="reveal-button" type="button" aria-label="セリフをもう一度聞く" title="セリフをもう一度聞く" disabled={!enabled || disabled} onClick={play}><ControlIcon name="play" /></button>
    {hint && <small role="status">{hint}</small>}
  </div>;
}
