import {freeOpening, actionSuggestions} from '../shared/player-input';
import type { CharacterId } from '../shared/scene-characters';
import { practiceCharacterId, selectPracticeScenario } from './practice-selection';
import { FullscreenControl } from './FullscreenControl';
import { ControlIcon } from './ControlIcon';
import { createMessageAttempt } from './message-attempt';
import { request, createSessionReleaser } from './api';
import { createSessionCleanup } from './session-cleanup';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProviderMode, Reflection, Scenario, Session, SessionResponse } from '../shared/types';
import { ConversationExperience, ConversationHistory, LinePlayback } from './ConversationExperience';
import { ConversationModeNote } from './ConversationActions';
import { Welcome, ScenarioSelect } from './ScenarioSelect';

type Screen = 'home' | 'places' | 'chat' | 'reflection';
type Pending = 'start' | 'message' | 'end' | 'reflection' | null;



function BrandMark() {
  return <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 20C3 22 3 7 10 6c7-1 11 5 10 14Z" fill="#91ab8b" /><path d="M20 20C18 3 33 3 34 10c1 7-5 11-14 10Z" fill="#d9b976" /><path d="M20 20c17-2 17 13 10 14-7 1-11-5-10-14Z" fill="#4b7056" /><path d="M20 20C22 37 7 37 6 30c-1-7 5-11 14-10Z" fill="#b7c7a6" /><circle cx="20" cy="20" r="4" fill="#f7f7f0" /></svg>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [mode, setMode] = useState<ProviderMode>('demo');
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [cloudVoice,setCloudVoice] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState('');
  const [failedAction, setFailedAction] = useState<'message' | 'end' | null>(null);
  const chatErrorRef = useRef<HTMLDivElement>(null);
  const operation = useRef(0);
  const messageAttempt = useRef(createMessageAttempt());
  const cleanup = useRef(createSessionCleanup());
  const autoReflectionFor = useRef<string | null>(null);
  const endRef = useRef<HTMLDialogElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    const reset = () => setToolsOpen(false);
    document.addEventListener('fullscreenchange', reset);
    return () => document.removeEventListener('fullscreenchange', reset);
  }, []);
  const logRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  async function initialize() {
    setBooting(true); setError(''); setReady(false);
    try {
      const [config, data] = await Promise.all([
        request<{ mode: ProviderMode; maxTurns: number; cloudSpeech?: boolean }>('/api/config'),
        request<{ scenarios: Scenario[] }>('/api/scenarios'),
      ]);
      setCloudVoice(config.cloudSpeech === true); setMode(config.mode); setScenarios(data.scenarios); setReady(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。'); }
    finally { setBooting(false); }
  }
  useEffect(() => { void initialize(); }, []);
  useEffect(() => () => {
    operation.current++;
    cleanup.current.leave();
    messageAttempt.current.clear();
  }, []);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const heading = mainRef.current?.querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [screen]);
  useEffect(() => {
    if (screen === 'chat' && error) chatErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [screen, error]);
  useEffect(() => {
    if (session?.status === 'completed' && !reflection && !pending && autoReflectionFor.current !== session.id) {
      autoReflectionFor.current = session.id;
      void retryReflection();
    }
  }, [session?.id, session?.status, reflection, pending]);
  useEffect(() => {
    if (!session?.id) return;
    const timer = window.setTimeout(() => {
      operation.current++;
      cleanup.current.leave();
      messageAttempt.current.clear();
      setSession(null); setReflection(null); setDraft(''); setPending(null); setScreen('home');
      setError('会話を始めてから30分がたったため、履歴を消去しました。もう一度、場面を選んでください。');
    }, 30 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [session?.id]);

  function selectScenario(scenario: Scenario, characterId?: CharacterId) {
    cleanup.current.leave();
    messageAttempt.current.clear();
    operation.current++; setPending(null); setSelected(selectPracticeScenario(scenarios, scenario, characterId));
     setSession(null); setReflection(null); setDraft(''); setError(''); setFailedAction(null); setScreen('chat');
  }
  function goHome(destination: 'home' | 'places' = 'home') {
    cleanup.current.leave();
    messageAttempt.current.clear();
    operation.current++; setPending(null); setError(''); setFailedAction(null); setScreen(destination); setSession(null); setReflection(null); setDraft('');
  }
  function accept(result: SessionResponse) {
    if (result.session.status !== 'active') messageAttempt.current.clear();
    setSession(result.session); setReflection(result.reflection);
    setScreen(result.session.status === 'active' ? 'chat' : 'reflection');
  }
  async function start(actionId: string) {
    if (!selected || !actionId || !adultConfirmed || !ready || pending) return;
    if (actionId !== freeOpening.id) setDraft('');
    const current = ++operation.current; setPending('start'); setError('');
    const release = createSessionReleaser();
    try {
      const result = await request<SessionResponse>('/api/sessions', { scenarioId: selected.id, characterId: selected.characterId, actionId, adultConfirmed });
      if (current === operation.current) {
        cleanup.current.adopt(result.session.id, release);
        accept(result);
      } else {
        // A start can succeed after Home/retry/unmount. Do not orphan that session.
        void release(result.session.id);
        return;
      }
      return result.session;
    } catch (reason) { if (current === operation.current) setError(reason instanceof Error ? reason.message : '開始できませんでした。'); }
    finally { if (current === operation.current) setPending(null); }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    // A second synchronous submit must not invalidate the first response.
    if (!draft.trim() || pending || messageAttempt.current.sending || !ready) return;
    const active = session ?? await start(freeOpening.id);
    if (!active || active.status !== 'active') return;
    const current = ++operation.current; setPending('message'); setError('');
    try {
      const result = await messageAttempt.current.send(active.id, draft, body =>
        request<SessionResponse>(`/api/sessions/${active.id}/messages`, body), 'auto');
      if (current === operation.current) { accept(result); setDraft(''); }
    } catch (reason) { if (current === operation.current) { setFailedAction('message'); setError(reason instanceof Error ? reason.message : '送信できませんでした。'); } }
    finally { if (current === operation.current) setPending(null); }
  }
  async function end(reason: 'finish' | 'emergency') {
    if (!session || pending === 'end') return;
    const current = ++operation.current; setPending('end'); setError('');
    try {
      const result = await request<SessionResponse>(`/api/sessions/${session.id}/end`, { reason });
      if (current === operation.current) accept(result);
    } catch (reason) { if (current === operation.current) { setFailedAction('end'); setError(reason instanceof Error ? reason.message : '終了できませんでした。'); } }
    finally { if (current === operation.current) setPending(null); }
  }
  async function retryReflection() {
    if (!session || pending) return;
    const current = ++operation.current; setPending('reflection'); setError('');
    try {
      const result = await request<SessionResponse>(`/api/sessions/${session.id}/reflection`, {});
      if (current === operation.current) accept(result);
    } catch (reason) { if (current === operation.current) setError(reason instanceof Error ? reason.message : '振り返りを取得できませんでした。'); }
    finally { if (current === operation.current) setPending(null); }
  }

  const actualMode = session?.mode || mode;
  return <div className="app-shell" data-screen={screen} data-motion={reducedMotion ? "reduced" : "full"}>
    <header className="site-header">
      <button className="brand" onClick={() => goHome()} aria-label="KindSignal ホームへ"><BrandMark /><span>KindSignal<span className="brand-dot">.</span></span></button>
      {ready && actualMode === 'demo' && <div className="header-right"><span className="mode-note">定型応答</span></div>}
    </header>

    <main ref={mainRef} key={screen} className="screen-enter" data-tools-open={toolsOpen}>
      {screen === 'chat' && <button className="immersive-tools" aria-label={toolsOpen ? '操作バーを隠す' : '操作バーを表示'} aria-expanded={toolsOpen} aria-controls="scene-toolbar" data-tip={toolsOpen ? undefined : '操作バーを表示'} onClick={() => setToolsOpen(v => !v)}><ControlIcon name={toolsOpen ? 'close' : 'menu'} /></button>}
      {screen === 'reflection' && <div className="journey-header"><button className="text-button" onClick={() => goHome('places')}><ControlIcon name="back" /> 場所を選ぶ</button></div>}
      {screen === 'chat' && selected && <nav id="scene-toolbar" className="play-toolbar" aria-label="会話画面の操作">
        {!session && <button onClick={() => goHome('places')} aria-label="場所を選ぶ" data-tip="場所を選ぶ"><ControlIcon name="back" /></button>}
        <h1>{selected.location}</h1>
        <div className="play-tools">
          {session && <>
            <button data-tip="これまでのやり取り" aria-label="これまでのやり取り" aria-haspopup="dialog" onClick={() => logRef.current?.showModal()}><ControlIcon name="history" /></button>
            <button data-tip="会話を終える" aria-label="会話を終える" aria-haspopup="dialog" onClick={() => endRef.current?.showModal()}><ControlIcon name="leave" /></button>
          </>}
          <LinePlayback scenario={selected} session={session} cloudVoice={cloudVoice} waiting={pending === 'message'} voiceOn={voiceOn} />
          <button aria-label="セリフを自動で読み上げる" aria-pressed={voiceOn} data-tip={voiceOn ? '音声をオフにする' : '音声をオンにする'} onClick={() => setVoiceOn(v => !v)}><ControlIcon name={voiceOn ? 'sound' : 'mute'} /></button>
          <FullscreenControl /></div>
      </nav>}
      {error && (screen !== 'chat' || !failedAction) && <div className="error-banner" role="alert"><span>{error}</span>{!ready && !booting && <button onClick={() => void initialize()}>再読み込み</button>}</div>}

      {screen === 'home' && <Welcome example={scenarios.find(s => s.id === 'shop')} onBegin={() => { setAdultConfirmed(true); setScreen('places'); }} />}
      {screen === 'places' && <ScenarioSelect scenarios={scenarios} loading={booting} ready={ready} onSelect={selectScenario} />}

      {screen === 'chat' && selected && <section className="novel-experience">
        <ConversationExperience scenario={selected} session={session} reducedMotion={reducedMotion}>
        {!session && <fieldset className="opening-actions" aria-label="最初の行動" disabled={!!pending || !ready}>
          {selected.actions.map(action => <button type="button" key={action.id} value={action.id} onClick={() => void start(action.id)}><span>{action.label}</span><ControlIcon name="next" /></button>)}
        </fieldset>}
        <div className="story-controls">
          {session && <div className="turn-suggestions" role="group" aria-label="行動の候補">{actionSuggestions[selected.id].map(text => <button key={text} disabled={!!pending} onClick={() => { setDraft(text); document.getElementById('message-input')?.focus();}}>{text}</button>)}</div>}
          <form onSubmit={sendMessage} className="composer" aria-busy={pending === 'message'}>
            <label className="sr-only" htmlFor="message-input">発言や行動を入力</label>
            <div className="message-pill"><textarea id="message-input" placeholder={pending === 'message' ? '返事を待っています…' : '発言や行動を入力'} value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} rows={1} disabled={!!pending} aria-describedby={error && failedAction === 'message' ? 'message-help conversation-error' : 'message-help'} />
              <button type="submit" data-tip={error && failedAction === 'message' ? 'もう一度送る' : '送信'} aria-label={error && failedAction === 'message' ? 'もう一度送る' : '送信'} disabled={!draft.trim() || !!pending}><ControlIcon name="send" /></button>
            </div>
            <span id="message-help" className="sr-only">500文字まで。個人情報は入力しないでください。</span>
            {error && failedAction === 'message' && <div id="conversation-error" className="conversation-error" role="alert" ref={chatErrorRef}><p>{error}</p><p>入力した文章は残っています。送信ボタンで再送できます。</p></div>}
          </form>
          {error && failedAction === 'end' && <div id="conversation-error" className="conversation-error" role="alert" ref={chatErrorRef}><p>{error}</p><p>画面の会話と入力は残っています。もう一度、終了操作を試せます。</p></div>}

        </div>
        </ConversationExperience>
        {session && <dialog className="history-dialog end-dialog" ref={endRef} aria-labelledby="end-heading"><header><h2 id="end-heading">会話を終える</h2><button aria-label="閉じる" autoFocus onClick={() => endRef.current?.close()}><ControlIcon name="close" /></button></header>
            <button disabled={!!pending} onClick={() => { endRef.current?.close(); void end('finish') }}>振り返る</button>
            <button disabled={pending === 'end'} onClick={() => { endRef.current?.close(); void end('emergency') }}>振り返らずに中断</button>
        </dialog>}
        {session && <dialog ref={logRef} className="history-dialog" aria-labelledby="log-heading">
          <header><h2 id="log-heading">これまでのやり取り</h2><button aria-label="閉じる" onClick={() => logRef.current?.close()}><ControlIcon name="close" /></button></header>
          <p>{session.turnCount} / {session.maxTurns} 往復</p><ConversationModeNote mode={actualMode} />
          <ConversationHistory session={session} scenario={selected} />
        </dialog>}
      </section>}

      {screen === 'reflection' && selected && session && <section className="reflection-page">
        <div className="reflection-heading"><h1>{session.status === 'interrupted' ? '練習を中断しました。' : '自分の声かけを振り返る'}</h1><p>{selected.title} <span>／</span> {selected.character}</p></div>
        {session.status === 'interrupted' ? <details className="interrupted-panel"><summary>実際に危険を感じたときは</summary><p>このアプリでは緊急性の判断はできません。実際の場面ではご自身の安全を確保し、近くの職員や適切な緊急窓口に助けを求めてください。</p></details> : <>
          {session.endReason === 'respect' ? <p className="respect-note">相手の意思を尊重して会話を終えました。</p> :
            !session.messages.some(message => message.role === 'user') && <p>今回は声をかけずに会話を終えました。</p>}
          {reflection ? <div className="reflection-grid">{session.actionId !== freeOpening.id && <article className="reflection-card"><h2>はじめに選んだ接し方</h2><blockquote>{reflection.action.label}</blockquote><p>{reflection.action.observation}</p><div className="principle-box"><p>{reflection.action.principle}</p></div></article>}<article className="reflection-card"><h2>{!session.messages.some(m => m.role === 'user') || reflection.conversation.source === 'fixed' ? 'この場面の振り返り' : session.messages.some(m => m.kind != null) ? '接し方を振り返る' : reflection.conversation.source === 'demo' ? '声かけを見直すヒント' : '声かけを見直すヒント（AI）'}</h2>{reflection.conversation.quote && <blockquote>{reflection.conversation.quote}</blockquote>}<p>{reflection.conversation.observation}</p><div className="principle-box"><span>{reflection.conversation.source === 'fixed' ? '会話の終え方' : '次に試してみるなら'}</span><p>{reflection.conversation.suggestion}</p></div></article></div> : <div className="reflection-grid">{session.actionId !== freeOpening.id && <article className="reflection-card"><h2>はじめに選んだ接し方</h2><blockquote>{selected.actions.find(action => action.id === session.actionId)?.label}</blockquote><p>{selected.actions.find(action => action.id === session.actionId)?.reflection}</p><div className="principle-box"><p>{selected.actions.find(action => action.id === session.actionId)?.principle}</p></div></article>}<div className="loading-panel">{pending === 'reflection' || autoReflectionFor.current !== session.id ? <p role="status">振り返りを準備しています…</p> : <button className="secondary-button" disabled={!!pending} onClick={() => void retryReflection()}>再読み込み</button>}</div></div>}
          <p className="reflection-disclaimer">振り返りは、実際の人の気持ちや症状を判定するものではありません。</p>
        </>}
        <details className="transcript"><summary>会話を読み返す</summary><div>{session.messages.map((message, i) => <p key={i}><strong>{message.role === 'user' ? (message.kind==='action'?'あなたの行動':message.kind==='mixed'?'あなたの行動と発言':'あなた') : selected.character}</strong>{message.text}</p>)}</div></details>
        <div className="reflection-actions practice-retry-actions">
          <button className="primary-button" onClick={() => selectScenario(selected, practiceCharacterId(session))}>同じ人ともう一度話す</button>
          <button className="secondary-button" onClick={() => selectScenario(selected)}>同じ場所でもう一度</button>
          <button className="secondary-button" onClick={() => goHome('places')}>ほかの場所を選ぶ<ControlIcon name="next" /></button>
        </div>
        <p className="storage-note">履歴は最長30分、または次の練習を始めるまで残ります。</p>
      </section>}
    </main>
    <footer className="team-credit">OIF Team B</footer>

  </div>;
}

export default App;


