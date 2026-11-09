import { useEffect, useState, type ReactNode } from 'react';
import './bookstore.css';

import { expressionLabels, type BookstoreResponse } from './bookstore.config';
import { conversationScenarios, type ConversationScenario } from './conversation-scenarios';
import { displayedExpression, sceneImageProgress, type ImageStates } from './scene-image-state';
import type { Expression } from '../shared/types';

const bookstoreScenario = conversationScenarios.find(scenario => scenario.id === 'bookstore')!;

function SceneLayers({ scenario, expression, onRetry }: { scenario: ConversationScenario; expression: Expression; onRetry: () => void }) {
  const { assets } = scenario;
  const [states, setStates] = useState<ImageStates>({});
  const [previous, setPrevious] = useState<Expression | null>(null);
  const visible = displayedExpression(expression, previous, assets.expressions, states);
  const progress = sceneImageProgress(assets.background, assets.expressions[expression], states);
  useEffect(() => { if (visible) setPrevious(visible); }, [visible]);
  const failed = (path: string) => setStates(items => ({ ...items, [path]: 'failed' }));
  async function loaded(path: string, image: HTMLImageElement) {
    try {
      await image.decode();
      setStates(items => ({ ...items, [path]: 'loaded' }));
    } catch { failed(path); }
  }
  return <>
    <img className="bookstore-background" src={assets.background} alt="" width={1672} height={941} decoding="async" fetchPriority="high"
      onLoad={event => void loaded(assets.background, event.currentTarget)} onError={() => failed(assets.background)} hidden={states[assets.background] === 'failed'} />
    {Object.entries(assets.expressions).map(([frame, src]) => <img key={src} className="bookstore-person" data-visible={visible === frame}
      src={src} width={1086} height={1448} decoding="async" fetchPriority={expression === frame ? 'high' : 'low'}
      onLoad={event => void loaded(src, event.currentTarget)} onError={() => failed(src)} hidden={states[src] === 'failed'}
      alt={visible === frame ? `${scenario.character}（架空の人物）：${expressionLabels[visible]}の表情` : ''} aria-hidden={visible !== frame} />)}
    <div className="scene-image-status" role="status" aria-live="polite">
      {progress.failed ? <><p>画像を読み込めませんでした。文章で会話を続けられます。</p><button type="button" onClick={onRetry}>画像を再読み込み</button></>
        : progress.loading ? <p>画像を読み込んでいます。会話はそのまま続けられます。</p> : null}
    </div>
  </>;
}

/** Supply an AI reply and expression together; assets can be replaced with PNG/WebP URLs. */
export function ConversationStage({ reply, reducedMotion, children, scenario = bookstoreScenario }: { reply: BookstoreResponse; reducedMotion: boolean; children?: ReactNode; scenario?: ConversationScenario }) {
  const assets = scenario.assets;
  const [attempt, setAttempt] = useState(0);
  return <div className="bookstore-stage" data-reduced={reducedMotion}>
    <SceneLayers key={JSON.stringify([assets, attempt])} scenario={scenario} expression={reply.expression} onRetry={() => setAttempt(value => value + 1)} />
    <div className="bookstore-interface"><div className="bookstore-dialogue"><strong>{scenario.character}</strong><p role="status" aria-live="polite">{reply.reply}</p></div>{children}</div>
  </div>;
}
