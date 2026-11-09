import {openingFor, type InputKind} from '../shared/player-input.js';
import { spokenLine } from '../shared/spoken-line.js';
import { characterIds, characters, defaultCharacterId, withCharacter } from '../shared/scene-characters.js';
import express from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { scenarios } from '../shared/scenarios.js';
import type { Session, Reflection, SessionResponse } from '../shared/types.js';
import { GenerationLimitError } from './generation-limits.js';
import { noInputReflection, type Provider } from './provider.js';
import { validAudio, type SpeechSynthesizer } from './speech.js';

// Only a server-side verifier may supply this stable subject, never a client header directly.
export type Authenticate = (request: express.Request) => Promise<string | null>;
type StoredSession = { owner: string | null; session: Session; reflection: Reflection | null; expires: number; busy: boolean; llmAttempts: number; speechBusy?: boolean; speechAttempts?: number; speech?: { index: number; audioContent: string }; messageRequests: Map<string, { kind: InputKind; text: string; committed: boolean }> };
const startSchema = z.object({ scenarioId: z.string(), characterId: z.enum(characterIds).optional(), actionId: z.string(), adultConfirmed: z.literal(true) }).strict();
const messageSchema = z.object({ kind:z.enum(['speech','action']).default('speech'), text: z.string().trim().min(1).max(500), requestId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict();
const endSchema = z.object({ reason: z.enum(['finish', 'respect', 'emergency']) }).strict();
const MAX_TURNS = 20;
const TTL = 30 * 60 * 1000;

export function createApp(provider: Provider, options: { ttlMs?: number; now?: () => number; maxSessions?: number; maxConcurrentGenerations?: number; secureCookie?: boolean; authenticate?: Authenticate; synthesizeSpeech?: SpeechSynthesizer } = {}) {
  const app = express();
  let generations = 0;
  let disposed = false;
  const sessions = new Map<string, StoredSession>();
  const rates = new Map<string, { count: number; until: number }>();
  const now = options.now ?? Date.now;
  const cleanup = () => {
    for (const [id, s] of sessions) if (s.expires <= now()) sessions.delete(id);
    for (const [id, r] of rates) if (r.until <= now()) rates.delete(id);
  };
  const sweep = setInterval(cleanup, 10_000);
  sweep.unref();
  app.locals.dispose = () => { disposed = true; clearInterval(sweep); sessions.clear(); rates.clear(); };
  const generate = async <T,>(operation: () => Promise<T>): Promise<T> => {
    generations++;
    try { return await operation(); } finally { generations--; }
  };
  const capacity = (res: express.Response) => {
    if (generations < (options.maxConcurrentGenerations ?? 4)) return true;
    res.set('Retry-After', '5').status(503).json({ error: 'AIが混み合っています。少し待ってから再度お試しください。' });
    return false;
  };
  app.disable('x-powered-by');

  app.use('/api', async (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (disposed) { res.status(503).json({ error: 'サーバーを停止しています。' }); return; }
    if (req.method === 'GET' && req.path === '/health') { res.json({ ok: true }); return; }
    // Health remains public. All other API routes fail closed when a verifier is configured.
    res.locals.subject = null;
    if (options.authenticate) {
      try {
        const subject = await options.authenticate(req);
        if (typeof subject !== 'string' || !subject.trim() || subject.length > 512) throw new Error('Unauthenticated');
        res.locals.subject = subject;
      } catch {
        res.status(401).json({ error: '認証を確認できません。ログインし直してください。' }); return;
      }
      if (disposed) { res.status(503).json({ error: 'サーバーを停止しています。' }); return; }
    }
    if (req.get('Sec-Fetch-Site') === 'cross-site' && !['GET','HEAD'].includes(req.method)) {
      res.status(403).json({ error: '同じサイトから操作してください。' }); return;
    }
    if (!options.authenticate) {
      const cookies = (req.headers.cookie ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith('__session='));
      res.locals.subject = cookies.length === 1 && /^__session=[A-Za-z0-9_-]{43}$/.test(cookies[0])
        ? cookies[0].slice(10) : null;
    }
    cleanup();
    // Local demo guard. Not a distributed quota or authentication mechanism.
    const address = options.authenticate ? `user:${res.locals.subject}` : `ip:${req.ip ?? 'local'}`;
    if (!rates.has(address) && rates.size >= 10000) { res.set('Retry-After', '60').status(503).json({ error: '混み合っています。後で再度お試しください。' }); return; }
    const rate = rates.get(address) ?? { count: 0, until: now() + 60_000 };
    rate.count++;
    rates.set(address, rate);
    const releasesSession = req.method === 'DELETE' && /^\/sessions\/[^/]+\/?$/.test(req.path);
    if (rate.count > 90 && !req.path.endsWith('/end') && !releasesSession) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((rate.until - now()) / 1000)))).status(429).json({ error: 'リクエストが多いため、1分ほど待ってから再度お試しください。' }); return;
    }
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  app.get('/api/config', (_req, res) => { res.json({ mode: provider.mode, maxTurns: MAX_TURNS, cloudSpeech: !!options.synthesizeSpeech }); });
  app.get('/api/scenarios', (_req, res) => { res.json({ scenarios }); });
  app.post('/api/sessions', (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '場面と最初の行動を選び、18歳以上であることを確認してください。' }); return; }
    const { scenarioId, characterId, actionId } = parsed.data;
    const baseScenario = scenarios.find(s => s.id === scenarioId);
    const scenario = baseScenario && characterId ? withCharacter(baseScenario, characterId) : baseScenario;
    if (!scenario || !openingFor(scenario, actionId)) { res.status(400).json({ error: 'シナリオと行動の組み合わせを確認してください。' }); return; }
    if (sessions.size >= (options.maxSessions ?? 100)) { res.status(503).json({ error: 'ただいま体験が混み合っています。時間をおいて再度お試しください。' }); return; }
    const session: Session = { id: randomUUID(), scenarioId, ...(characterId ? { characterId } : {}), actionId, status: 'active', turnCount: 0, maxTurns: MAX_TURNS, messages: [{ role: 'assistant', text: scenario.opening, ...(characterId ? { expression: characterId === 'yamamoto' ? 'confused' as const : characterId === 'sato' ? 'cautious' as const : 'neutral' as const } : {}) }], mode: provider.mode };
    const selectedAction = openingFor(scenario, actionId)!;
    if (selectedAction.endOnSelection === 'respect') {
      session.status = 'completed';
      session.endReason = 'respect';
    }
    if (!options.authenticate) {
      res.locals.subject = randomBytes(32).toString('base64url');
      res.cookie('__session', res.locals.subject, { path: '/api/sessions/' + session.id,
        httpOnly: true, sameSite: 'strict', secure: options.secureCookie ?? true, maxAge: options.ttlMs ?? TTL });
    }
    sessions.set(session.id, { owner: res.locals.subject, session, reflection: null, expires: now() + (options.ttlMs ?? TTL), busy: false, llmAttempts: 0, messageRequests: new Map() });
    res.status(201).json({ session, reflection: null } satisfies SessionResponse);
  });
  // Explicit release when leaving an experience, not on completion: reflection
  // retries remain available until release or TTL. Unknown and foreign IDs look alike.
  app.delete('/api/sessions/:id', (req, res) => {
    const stored = sessions.get(req.params.id);
    if (stored && stored.owner === res.locals.subject) {
      sessions.delete(req.params.id);
      if (!options.authenticate) res.clearCookie('__session', { path: '/api/sessions/' + req.params.id, httpOnly: true, sameSite: 'strict', secure: options.secureCookie ?? true });
    }
    res.status(204).end();
  });
  const getStored = (id: string, res: express.Response): StoredSession | undefined => {
    let stored = sessions.get(id);
    // Body parsing can finish after the request middleware checked the TTL.
    if (stored && (disposed || stored.expires <= now())) { sessions.delete(id); stored = undefined; }
    if (stored && stored.owner !== res.locals.subject) stored = undefined;
    if (!stored) res.status(404).json({ error: 'この会話は見つかりませんでした。場面を選んでもう一度始めてください。' });
    return stored;
  };
  const stillValid = (stored: StoredSession, res: express.Response) => {
    if (!disposed && stored.expires > now() && sessions.get(stored.session.id) === stored) return true;
    sessions.delete(stored.session.id);
    res.status(404).json({ error: '体験の有効期限が切れました。シナリオからやり直してください。' });
    return false;
  };
  const handleLimit = (error: unknown, res: express.Response) => {
    if (!(error instanceof GenerationLimitError)) return false;
    if (error.retrySeconds) res.set('Retry-After', String(error.retrySeconds));
    res.status(error.kind === 'concurrent' ? 503 : 429).json({ error: error.kind === 'total'
      ? 'AIの利用枠に達しました。新しい返事やコメントは表示できません。会話はここで終えられます。'
      : 'AIの利用が集中しています。少し待ってから再度お試しください。' });
    return true;
  };
  const fixedOnly = (stored: StoredSession) =>
    provider.mode === 'gemini' && (stored.session.endReason === 'respect' || !stored.session.messages.some(m => m.role === 'user'));
  // Grow the session allowance with successful turns. Allow some failed
  // attempts, but keep the final attempt available for a completed reflection.
  const admitSession = (stored: StoredSession, res: express.Response, reflection = false) => {
    if (provider.mode !== 'gemini' || (reflection && fixedOnly(stored))) return true;
    const replyBudget = Math.max(9, stored.session.turnCount + 4);
    if (stored.llmAttempts >= replyBudget + Number(reflection)) {
      res.status(429).json({ error: 'この会話のAI利用枠に達しました。会話を終了できます。' }); return false;
    }
    stored.llmAttempts++; return true;
  };
  const reflect = async (stored: StoredSession) => {
    const baseScenario = scenarios.find(s => s.id === stored.session.scenarioId)!;
    const scenario = stored.session.characterId ? withCharacter(baseScenario, stored.session.characterId) : baseScenario;
    const action = openingFor(scenario, stored.session.actionId)!;
    const lastUser = stored.session.messages.filter(m => m.role === 'user').at(-1);
    const respect = stored.session.endReason === 'respect' && provider.mode === 'gemini';
    const conversation = respect && lastUser ? {
      source: 'fixed' as const, quote: lastUser.text,
      observation: '最後の声かけのあと、相手の意思を尊重して会話を終えることを選びました。',
      suggestion: '手助けを断られたときは、その返事を受け止めて会話を終えて構いません。',
    } : fixedOnly(stored) ? noInputReflection(stored.session) : await generate(() => provider.reflect(scenario, structuredClone(stored.session)));
    stored.reflection = {
      action: { label: action.label, observation: respect ? 'これは最初に選んだ行動です。その後、会話を終えることを選びました。' : action.reflection, principle: respect ? '援助を受けるかどうかは本人が選びます。' : action.principle },
      conversation,
      nextStep: (stored.session.endReason === 'respect' || (stored.session.characterId ? stored.session.characterId === 'sato' : scenario.id === 'bookstore'))
        ? '援助を受けるかどうかは本人が決めます。距離を保つ終え方も、次の練習に活かしてみましょう。'
        : '同じ場面で、別の声かけを一つ試してみましょう。',
    };
  };
  // Every response rechecks map membership and TTL, including automatic demo reflection.
  // Caller ownership is checked once before the route begins; owners are immutable.
  const send = (stored: StoredSession, res: express.Response) => {
    if (stillValid(stored, res)) res.json({ session: stored.session, reflection: stored.reflection } satisfies SessionResponse);
  };

  // Accept only an index into this owner's stored latest assistant reply. Never arbitrary text/SSML.
  app.post('/api/sessions/:id/speech', async (req, res) => {
    const stored = getStored(req.params.id, res); if (!stored) return;
    const parsed = z.object({ messageIndex: z.number().int().min(0).max(MAX_TURNS * 2) }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '音声の対象を確認できません。' }); return; }
    if (!options.synthesizeSpeech) { res.status(503).json({ error: '音声は現在利用できません。文字で会話を続けられます。' }); return; }
    const index = parsed.data.messageIndex;
    const message = stored.session.messages[index];
    const current = () => stored.session.status === 'active' && !stored.busy &&
      index === stored.session.messages.length - 1 && message?.role === 'assistant';
    if (!current()) { res.status(409).json({ error: 'この返答の音声再生は終了しました。' }); return; }
    if (!spokenLine(message.text)) { res.status(409).json({ error: 'この返事に音声はありません。' }); return; }
    if (stored.speech?.index === index) { res.json({ audioContent: stored.speech.audioContent }); return; }
    if (stored.speechBusy || (stored.speechAttempts ?? 0) >= Math.min(MAX_TURNS + 3, 8 + stored.session.turnCount)) { res.status(429).json({ error: '音声を利用できません。文字で会話を続けてください。' }); return; }
    stored.speechBusy = true; stored.speechAttempts = (stored.speechAttempts ?? 0) + 1;
    try {
      const audioContent = await options.synthesizeSpeech(spokenLine(message.text), characters[stored.session.characterId ?? defaultCharacterId(stored.session.scenarioId)].voiceSceneId);
      if (!stillValid(stored, res)) return;
      if (!current()) { res.status(409).json({ error: '音声再生を終了しました。' }); return; }
      if (!validAudio(audioContent)) throw new Error('Invalid speech response');
      stored.speech = { index, audioContent }; // At most one bounded clip per session.
      res.json({ audioContent });
    } catch {
      if (!stillValid(stored, res)) return;
      res.status(502).json({ error: '音声を取得できませんでした。文字で会話を続けられます。' });
    } finally { stored.speechBusy = false; }
  });

  app.post('/api/sessions/:id/messages', async (req, res) => {
    const stored = getStored(req.params.id, res); if (!stored) return;
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '声かけは1〜500文字で入力してください。' }); return; }
    const { text, requestId, kind } = parsed.data;
    const previous = requestId ? stored.messageRequests.get(requestId) : undefined;
    if (previous) {
      if (previous.text !== text || previous.kind !== kind) { res.status(409).json({ error: '送信内容が前回と異なります。入力を確認して、もう一度送ってください。' }); return; }
      // Return current state, not an old snapshot that could resurrect a stopped session.
      if (previous.committed) { send(stored, res); return; }
      res.set('Retry-After', '1').status(409).json({ error: '先ほどの声かけに返事をしています。少し待ってから、同じ内容でもう一度お試しください。' }); return;
    }
    if (stored.session.status !== 'active') { res.status(409).json({ error: 'この体験は終了しています。シナリオからもう一度試せます。' }); return; }
    if (stored.busy) { res.status(409).json({ error: '返答を待っています。しばらくお待ちください。' }); return; }
    if (!capacity(res) || !admitSession(stored, res)) return;
    stored.busy = true;
    const request = { text, kind, committed: false };
    if (requestId) stored.messageRequests.set(requestId, request);
    try {
      const baseScenario = scenarios.find(s => s.id === stored.session.scenarioId)!;
      const scenario = stored.session.characterId ? withCharacter(baseScenario, stored.session.characterId) : baseScenario;
      const reply = await generate(() => provider.reply(scenario, structuredClone(stored.session), text, kind));
      if (!stillValid(stored, res)) return;
      // End requests are allowed during generation. Never append a late reply after a stop.
      if (stored.session.status !== 'active') { send(stored, res); return; }
      stored.session.messages.push({ role: 'user', text, ...(kind === 'action' ? {kind} : {}) }, { role: 'assistant', ...(typeof reply === 'string' ? { text: reply } : reply) });
      stored.session.turnCount++;
      // Record the commit before any subsequent await (including demo reflection).
      request.committed = true;
      if (stored.session.turnCount >= stored.session.maxTurns) {
        stored.session.status = 'completed'; stored.session.endReason = 'turn-limit';
        if (provider.mode === 'demo') await reflect(stored);
      }
      send(stored, res);
    } catch (error) {
      if (!stillValid(stored, res)) return;
      if (stored.session.status !== 'active') { send(stored, res); return; }
      if (handleLimit(error, res)) return;
      res.status(502).json({ error: '返答を取得できませんでした。入力は送信前の状態です。時間をおいて再送するか、振り返りへ進めます。' });
    } finally {
      stored.busy = false;
      // Failed/cancelled work has no turn to deduplicate. Retain at most maxTurns keys.
      if (requestId && !request.committed) stored.messageRequests.delete(requestId);
    }
  });
  app.post('/api/sessions/:id/end', async (req, res) => {
    const stored = getStored(req.params.id, res); if (!stored) return;
    const parsed = endSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '終了方法を確認してください。' }); return; }
    if (stored.session.status === 'active') {
      stored.session.status = parsed.data.reason === 'emergency' ? 'interrupted' : 'completed';
      stored.session.endReason = parsed.data.reason;
      if (provider.mode === 'demo' && stored.session.status === 'completed') await reflect(stored);
    }
    send(stored, res);
  });
  app.post('/api/sessions/:id/reflection', async (req, res) => {
    const stored = getStored(req.params.id, res); if (!stored) return;
    if (stored.session.status !== 'completed') { res.status(409).json({ error: '会話終了後に振り返りを表示できます。' }); return; }
    if (stored.reflection) { send(stored, res); return; }
    if (stored.busy) { res.status(409).json({ error: '処理中です。少し待ってから再度お試しください。' }); return; }
    if ((!fixedOnly(stored) && !capacity(res)) || !admitSession(stored, res, true)) return;
    stored.busy = true;
    try { await reflect(stored); if (stillValid(stored, res)) send(stored, res); }
    catch (error) { if (!stillValid(stored, res) || handleLimit(error, res)) return; res.status(502).json({ error: 'コメントを表示できませんでした。もう一度読み込んでください。' }); }
    finally { stored.busy = false; }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'APIが見つかりません。' }); });
  app.use(express.static(path.resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error && 'status' in error && error.status === 413 ? 413 : 400;
    res.status(status).json({ error: status === 413 ? '入力が大きすぎます。' : '入力形式を確認してください。' });
  });
  return app;
}
