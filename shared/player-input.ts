import type { ActionOption, Scenario } from './types.js';
export type InputKind = 'speech' | 'action' | 'auto';
export type InterpretedKind = 'speech' | 'action' | 'mixed';
export const freeOpening: ActionOption = {id:'free-input', label:'自分の言葉や行動で応じる', reflection:'', principle:''};
export const openingFor = (scene:Scenario, id:string) => id === freeOpening.id ? freeOpening : scene.actions.find(a => a.id === id);
// Openings and offline demo turns do not call a model for suggestions.
export function suggestionsFor(text:string, character:string|undefined,previous:string|undefined):string[] {
  const next = /自分で|ひとりで|大丈夫です/.test(text) ? ['一歩離れる','「わかりました」と答える']
    : /どちら|どこ|見つから/.test(text) ? ['どこまで一緒に探すか尋ねる','近くの表示を一緒に見る']
    : /バス|乗り場|案内板|青いの/.test(text) ? ['案内板を指す','相手が指す方を見る']
    : /袋|お茶|商品/.test(text) ? ['袋を見比べる時間をとる','どの袋か尋ねる']
    : /本|表紙/.test(text) ? ['表紙を一緒に見る','本の印象を尋ねる']
    : character==='yamamoto' ? ['少し待つ','目線の先を見る'] : ['少し待つ','希望を尋ねる'];
  return [...new Set([...next,'少し待つ'])].filter(v=>v!==previous).slice(0,2);
}
export type PlayerInputKind = InputKind;
export function playerInputLimit(_kind: PlayerInputKind): number { return 500; }
export function encodePlayerInput(_kind: PlayerInputKind, draft: string): string {
  const text = draft.trim();
  if (!text) throw new Error('内容を入力してください。');
  if (text.length > 500) throw new Error('入力できる文字数を超えています。');
  return text;
}

export function suggestedSpeech(line:string, choices:string[],place?:string):string {
  for (const choice of choices) {
    const quote=choice.match(/[「『]([^」』]+)[」』]/u)?.[1];
    if (quote) return quote;
    if (/(?:ですか|ますか|ですね|しょうか|ください|ませんか|[？?])。?$/u.test(choice)) return choice;
  }
  if (/要りません|いりません|自分で|ひとりで|一人で/.test(line)) return 'わかりました。失礼しますね。';
  if (/一緒に|お願い/.test(line)) return 'はい、一緒に見てみましょう。';
  if (/どちら|どこ|乗り場/.test(line)) return '一緒に確かめましょうか？';
  return place==='shop'?'どんなお茶をお探しですか？':place==='bookstore'?'どんな本をお探しですか？':'こちらの案内を一緒に見ましょうか？';
}

// Keep the free-entry hint independent of the visible response buttons.
export function draftHint(line: string, choices: string[], place?: string): string {
  const declined = /要りません|いりません|自分で|ひとりで|一人で|大丈夫です/.test(line);
  const hints = declined ? ['では、私はこれで。', '声をかけてすみません。', 'どうぞごゆっくり。']
    : /ありがとう|助かりました/.test(line) ? ['こちらこそ、ありがとうございます。', 'お役に立ててよかったです。', 'では、失礼します。']
    : place === 'shop' ? ['いつもは、どんな袋ですか？', '一緒に棚を見てみませんか？', 'この辺りでしょうか？']
    : place === 'bookstore' ? ['どんなお話でしたか？', '表紙に見覚えはありますか？', 'この棚から見てみますか？']
    : ['気になる表示はありますか？', 'あちらのことですか？', 'ここで少し待ちましょうか？'];
  const normalize = (value: string) => value.normalize('NFKC').replace(/[\p{P}\s]/gu, '');
  const labels = choices.map(normalize);
  return [...hints, 'はい。', 'そうでしたか。'].find(hint => !labels.some(label => label.includes(normalize(hint)))) ?? hints[0];
}
