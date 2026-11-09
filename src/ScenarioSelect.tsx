import { useEffect, useRef } from 'react';
import { ControlIcon } from './ControlIcon';
import type { Scenario } from '../shared/types';
import { SceneStage } from './SceneStage';
import './scenario-select.css';

export function ScenarioSelect({ scenarios, loading, ready, onSelect, started, onBegin }: {
  started: boolean; onBegin: () => void; scenarios: Scenario[]; loading: boolean; ready: boolean; onSelect: (scenario: Scenario) => void;
}) {
  const focusOnBegin = useRef(false);
  useEffect(() => {
    if (started && focusOnBegin.current) document.getElementById('scene-select-title')?.focus();
  }, [started]);
  const example = scenarios.find(s => s.id === 'shop');
  return <>
    <section className="practice-welcome" aria-labelledby="welcome-title">
      <div>
        <h1 id="welcome-title">困っている人に、<br />何と声をかけますか？</h1>
        <p>認知症のある人を含め、日常で困っている人への接し方を練習できます。架空の人物に自分の言葉で話しかけ、相手の返事を聞いて、次にどうするかを考えます。</p>
        <p>最後に、自分が選んだ行動や声のかけ方を振り返ります。</p>
        {!started && <p id="entry-terms" className="entry-terms">18歳以上の方が対象です。開始すると、18歳以上であることを確認したものとします。</p>}
        <div className="practice-begin">{!started && <button className="primary-button" aria-describedby="entry-terms" onClick={() => { focusOnBegin.current = true; onBegin(); }}>ゲームを始める <ControlIcon name="next" /></button>}<span>1場面 約3分</span></div>
      </div>
      <figure className="practice-example">
        <SceneStage scene="shop" thumbnail />
        {example && <figcaption><span>{example.location}での会話の一例です。</span><blockquote>「{example.opening}」</blockquote></figcaption>}
      </figure>
    </section>
    <section hidden={!started} id="scenarios" className="practice-list" aria-labelledby="scene-select-title">
    <h2 id="scene-select-title" tabIndex={-1}>どの場所で話してみますか？</h2>
    <p className="random-cast-note">場所を選ぶと、田中さん・佐藤さん・山本さんのうち1人がランダムに登場します。会話中は同じ人物です。</p>
    {loading ? <p role="status">場面を読み込んでいます…</p> : <div className="practice-grid">
      {scenarios.map(s => <button key={s.id} id={'start-'+s.id} className="practice-choice" disabled={!ready}
        onClick={() => onSelect(s)} aria-label={s.location+'で話す（人物はランダム）'}>
        <span className="practice-art" aria-hidden="true"><SceneStage scene={s.id} thumbnail /></span>
        <span className="practice-caption"><strong>{s.location}で話す</strong><span>登場人物はランダム</span></span>
        <span className="practice-arrow" aria-hidden="true"><ControlIcon name="next" /></span>
      </button>)}
    </div>}
    <details className="practice-about"><summary>この練習について</summary><p>認知症のある人を含め、困っている人への接し方を考える成人向けの練習です。人物や場面は架空で、診断や当事者の再現は行いません。個人情報は入力しないでください。</p></details>
  </section></>;
}
