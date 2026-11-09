import { entryNarration } from '../shared/scene-characters';
import { ControlIcon } from './ControlIcon';
import type { Scenario } from '../shared/types';
import { SceneStage } from './SceneStage';
import './scenario-select.css';

export function Welcome({ example, onBegin }: {example?: Scenario; onBegin: () => void}) {
  return <section className="practice-welcome" aria-labelledby="welcome-title">
    <div className="welcome-intro"><h1 id="welcome-title">認知症のある人との<br />会話を練習する</h1>
      <p>街で出会う架空の人物と話し、最後に自分の声のかけ方を振り返ります。</p>
    </div>
    <figure className="practice-example"><SceneStage scene="shop" thumbnail />
      {example && <figcaption>{entryNarration(example)}</figcaption>}
    </figure>
    <div className="welcome-entry">
      <p>氏名や住所などの個人情報は入力しないでください。</p>
      <p id="entry-terms" className="entry-terms">「場所を選ぶ」を押すと、18歳以上であることを確認したものとします。</p>
      <div className="practice-begin"><button className="primary-button" aria-describedby="entry-terms" onClick={onBegin}>場所を選ぶ<ControlIcon name="next" /></button><span>1回 約3分</span></div>
    </div>
  </section>;
}

export function ScenarioSelect({ scenarios, loading, ready, onSelect }: {
  scenarios: Scenario[]; loading: boolean; ready: boolean; onSelect: (scenario: Scenario) => void;
}) {
  return <section id="scenarios" className="practice-list" aria-labelledby="scene-select-title">
    <h1 id="scene-select-title">場所を選ぶ</h1>
    {loading ? <p role="status">読み込み中…</p> : <div className="practice-grid">
      {scenarios.map(s => <button key={s.id} id={'start-'+s.id} className="practice-choice" disabled={!ready} onClick={() => onSelect(s)}>
        <span className="practice-art" aria-hidden="true"><SceneStage scene={s.id} thumbnail /></span>
        <span className="practice-caption"><strong>{s.location}</strong></span>
        <span className="practice-arrow" aria-hidden="true"><ControlIcon name="next" /></span>
      </button>)}
    </div>}
  </section>;
}
