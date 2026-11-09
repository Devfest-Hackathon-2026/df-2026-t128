import type { ReactNode } from 'react';
import './start-screen.css';

export function StartScreen({ onStart, mark }: { onStart: () => void; mark: ReactNode }) {
  return <section className="start-screen" aria-labelledby="start-title">
    <div className="start-screen-content">
      <div className="start-screen-mark" aria-hidden="true">{mark}</div>
      <h1 id="start-title">KindSignal<span aria-hidden="true">.</span></h1>
      <p className="start-screen-message">うまく話すより、<br className="start-message-break" />相手の声を聴く。</p>
      <button className="start-screen-button" onClick={onStart}>タッチしてスタート <span aria-hidden="true">→</span></button>
    </div>
  </section>;
}
