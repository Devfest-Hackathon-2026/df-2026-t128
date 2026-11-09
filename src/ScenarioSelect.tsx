import { ControlIcon } from './ControlIcon';
import type { Scenario } from '../shared/types';
import { SceneStage } from './SceneStage';
import './scenario-select.css';

export function Welcome({ example, onBegin }: {example?: Scenario; onBegin: () => void}) {
  return <section className="practice-welcome" aria-labelledby="welcome-title">
    <div><h1 id="welcome-title">困っている人に、<br />何と声をかけますか？</h1>
      <p>認知症のある人を含め、街で困っている人への声のかけ方を練習します。架空の人物と話し、最後に自分の言葉を振り返ります。</p>
      <p id="entry-terms" className="entry-terms">対象は18歳以上です。「場所を選ぶ」を押すと、18歳以上であることを確認したものとします。</p>
      <div className="practice-begin"><button className="primary-button" aria-describedby="entry-terms" onClick={onBegin}>場所を選ぶ</button><span>約3分</span></div>
    </div>
    <figure className="practice-example"><SceneStage scene="shop" thumbnail />
      {example && <figcaption><strong>田中さん</strong><blockquote>「{example.opening}」</blockquote></figcaption>}
    </figure>
  </section>;
}

export function ScenarioSelect({ scenarios, loading, ready, onSelect }: {
  scenarios: Scenario[]; loading: boolean; ready: boolean; onSelect: (scenario: Scenario) => void;
}) {
  return <section id="scenarios" className="practice-list" aria-labelledby="scene-select-title">
    <h1 id="scene-select-title">どの場所で話しかけますか？</h1>
    {loading ? <p role="status">読み込み中…</p> : <div className="practice-grid">
      {scenarios.map(s => <button key={s.id} id={'start-'+s.id} className="practice-choice" disabled={!ready} onClick={() => onSelect(s)}>
        <span className="practice-art" aria-hidden="true"><SceneStage scene={s.id} thumbnail /></span>
        <span className="practice-caption"><strong>{s.location}</strong></span>
        <span className="practice-arrow" aria-hidden="true"><ControlIcon name="next" /></span>
      </button>)}
    </div>}
  </section>;
}
