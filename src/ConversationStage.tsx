import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
        : progress.loading ? <p>画像を読み込み中…</p> : null}
    </div>
  </>;
}

// Keep the unrevealed suffix in the layout so the choices below never move.
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja') : null;
function RevealedLine({ text, reduced }: { text:string; reduced:boolean }) {
  const ends = useMemo(() => {
    if (segmenter) return Array.from(segmenter.segment(text), part => part.index + part.segment.length);
    let end = 0;
    return Array.from(text, char => end += char.length);
  }, [text]);
  const [count, setCount] = useState(reduced ? ends.length : 1);
  const done = reduced || count >= ends.length;
  useEffect(() => {
    if (reduced) { setCount(ends.length); return; }
    if (done) return;
    const start = performance.now();
    const step = Math.min(32, 2200 / ends.length);
    let frame = requestAnimationFrame(function tick(now) {
      const n = Math.min(ends.length, 1 + Math.floor((now - start) / step));
      setCount(previous => Math.max(previous, n));
      if (n < ends.length) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [reduced, done, ends]);
  const cut = done ? text.length : ends[count - 1];
  return <><span aria-hidden="true">{text.slice(0, cut)}<span style={{visibility:'hidden'}}>{text.slice(cut)}</span></span>
    {!done && <button type="button" className="line-skip" aria-label="台詞を全文表示" onClick={() => setCount(ends.length)} />}
  </>;
}

/** Supply an AI reply and expression together; assets can be replaced with PNG/WebP URLs. */
export function ConversationStage({ reply, reducedMotion, children, scenario = bookstoreScenario }: { reply: BookstoreResponse; reducedMotion: boolean; children?: ReactNode; scenario?: ConversationScenario }) {
  const assets = scenario.assets;
  const line = useRef<HTMLParagraphElement>(null);
  const previousLine = useRef(reply.reply);
  useEffect(() => {
    if (previousLine.current === reply.reply) return;
    previousLine.current = reply.reply;
    const el = line.current;
    if (!el) return;
    el.scrollTop = 0;
    const rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) el.scrollIntoView({block:'nearest',behavior:'instant'});
  }, [reply.reply]);
  const [attempt, setAttempt] = useState(0);
  return <div className="bookstore-stage" data-reduced={reducedMotion}>
    <SceneLayers key={JSON.stringify([assets, attempt])} scenario={scenario} expression={reply.expression} onRetry={() => setAttempt(value => value + 1)} />
    <div className="bookstore-interface"><div className="bookstore-dialogue"><strong>{scenario.character}</strong><span className="sr-only" role="status" aria-atomic="true">{reply.reply}</span><p ref={line} className="character-line"><RevealedLine key={reply.reply} text={reply.reply} reduced={reducedMotion} /></p></div>{children}</div>
  </div>;
}
