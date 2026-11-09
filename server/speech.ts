import {readPcmStream} from './speech-stream.js';
import { GoogleAuth } from 'google-auth-library';
import { positiveInteger } from './config.js';

export type SpeechSynthesizer = (text: string, scenarioId?: string, onPcm?:(bytes:Buffer)=>void) => Promise<string>;
const standardEndpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
export const MAX_AUDIO_BASE64 = 1_600_000;
export function validAudio(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_AUDIO_BASE64 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Off by default. Limits are per process, NOT a durable spending cap. */
export function createSpeechSynthesizer(env: NodeJS.ProcessEnv = process.env, deps: {
  reserve?: () => void | Promise<void>; fetch?: typeof fetch; headers?: () => Promise<Record<string, string>>; now?: () => number;
} = {}): SpeechSynthesizer | undefined {
  if ((env.TTS_PROVIDER ?? 'off') === 'off') return undefined;
  const gemini = env.TTS_PROVIDER === 'gemini';
  const project = env.GOOGLE_CLOUD_PROJECT ?? '';
  if (gemini && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) throw new Error('Invalid TTS project');
  const endpoint = gemini ? 'https://aiplatform.googleapis.com/v1/projects/' + project + '/locations/global/publishers/google/models/gemini-3.8-flash-tts:generateContent' : standardEndpoint;
  if (!gemini && env.TTS_PROVIDER !== 'google') throw new Error('TTS_PROVIDER must be off, google or gemini');
  if (!env.TTS_MAX_TOTAL_CHARACTERS) throw new Error('Explicit TTS_MAX_TOTAL_CHARACTERS is required');
  const limit = positiveInteger(env.TTS_MAX_TOTAL_CHARACTERS, 1, 'TTS_MAX_TOTAL_CHARACTERS', 100_000);
  const voice = env.TTS_VOICE ?? 'ja-JP-Standard-A';
  if (!/^ja-JP-Standard-[ABCD]$/.test(voice)) throw new Error('Only Japanese Standard voices are enabled');
  const timeout = positiveInteger(env.TTS_TIMEOUT_MS, 10000, 'TTS_TIMEOUT_MS', 20000);
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const getHeaders = deps.headers ?? (async () => Object.fromEntries((await auth.getRequestHeaders(endpoint)).entries()));
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => performance.now());
  let used = 0, running = 0, windowStart = now(), attempts = 0;
  return async (text, scenarioId, onPcm) => {
    const character = characters.find(c => c.id === scenarioId);
    if (gemini && !character) throw new Error('Unknown character');
    if (!text.trim() || text.length > 1000 || Buffer.byteLength(text, 'utf8') > 5000) throw new Error('Speech text limit');
    const count = [...text].length;
    if (now() - windowStart >= 60_000) { windowStart = now(); attempts = 0; }
    if (used + count > limit || running >= 2 || attempts >= 30) throw new Error('Speech capacity limit');
    // Reserve before awaiting credentials. Failures still consume the reservation.
    used += count; attempts++; running++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Speech deadline')); }, timeout);
    });
    let phase = 'quota';
    const started = now();
    try {
      return await Promise.race([deadline, (async () => {
        await deps.reserve?.();
        if (controller.signal.aborted) throw new Error('Speech deadline');
        phase = 'credentials';
        const headers = await getHeaders();
        if (controller.signal.aborted || !new Headers(headers).get('authorization')) throw new Error('Speech authentication unavailable');
        phase = 'synthesis';
        const streaming = gemini && !!onPcm;
        const response = await fetcher(streaming ? endpoint.replace(':generateContent',':streamGenerateContent?alt=sse') : endpoint, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(gemini ? {
            contents: [{ role: 'user', parts: [{ text, speechMetadata: {style: character!.style} }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {voice: character!.voice}} }
          } : { input: { text }, voice: { languageCode: 'ja-JP', name: voice }, audioConfig: { audioEncoding: 'MP3' } }),
        });
        if (!response.ok || !response.body) throw new Error('Speech unavailable');
        phase = 'audio-body';
        if(streaming) return wav(await readPcmStream(response.body,onPcm!),24000);
        const reader = response.body.getReader();
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.length;
            if (bytes > MAX_AUDIO_BASE64 + 1000) { void reader.cancel(); throw new Error('Speech response too large'); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { audioContent?: unknown };
        if (gemini) {
          const audio = (data as {candidates?: {content?: {parts?: {inlineData?: {mimeType?: string; data?: string}}[]}}[]}).candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
          if (!validAudio(audio?.data)) throw new Error('Invalid Gemini audio');
          const bytes = Buffer.from(audio.data, 'base64');
          if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return audio.data;
          if (!/^audio\/(?:L16|pcm)\b/i.test(audio.mimeType ?? '') || bytes.length % 2) throw new Error('Unexpected audio format');
          const rate = Number(/rate=(\d+)/i.exec(audio.mimeType ?? '')?.[1] ?? 24000);
          if (rate !== 24000) throw new Error('Unexpected sample rate');
          return wav(bytes, rate);
        }
        if (!validAudio(data.audioContent)) throw new Error('Invalid speech response');
        return data.audioContent;
      })()]);
    } catch (error) {
      if (env.K_SERVICE) console.warn(JSON.stringify({event: 'speech_failure', phase, deadline: controller.signal.aborted, elapsedMs: Math.round(now()-started)}));
      throw error;
    } finally { controller.abort(); if (timer) clearTimeout(timer); running--; }
  };
}

const characters = [
  { id: 'shop', voice: 'Fola', style: '78歳の日本人女性。少し低めの温かい地声で、隣の人に気さくに話す。好きなものの話は自然に続け、聞き直す言葉の手前だけ小さく息を置く。接客や朗読の抑揚にしない。老け声を誇張しない。' },
  { id: 'bookstore', voice: 'Charon', style: '72歳の日本人男性。低く丸みのある地声。落ち着いた普段の声。断る返事は短く自然に言い切る。名前を探す言いかけでは一拍待ち、思い出せる特徴に移るときは普段の速さに戻る。素っ気ない返事を愛想よく丸めず、しつこくされた台詞は低い声で語尾を切る。本の思い出を語るときは力が抜ける。怒鳴り声や作ったしゃがれ声にはしない。' },
  { id: 'station', voice: 'Sulafat', style: '76歳の日本人女性。柔らかい落ち着いた地声。言いかけの「……」は無音の間として残し、次の言葉は息を継いでそっと置く。短い肯定は自然な一息で。文末を放送のように強調せず、声を震わせたり言葉を補ったりしない。' },
];

function wav(bytes:Buffer, rate:number) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(bytes.length+36,4); header.write('WAVEfmt ',8); header.writeUInt32LE(16,16);
  header.writeUInt16LE(1,20); header.writeUInt16LE(1,22); header.writeUInt32LE(rate,24); header.writeUInt32LE(rate*2,28);
  header.writeUInt16LE(2,32); header.writeUInt16LE(16,34); header.write('data',36); header.writeUInt32LE(bytes.length,40);
  return Buffer.concat([header, bytes]).toString('base64');
}
