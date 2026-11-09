import type { ActionOption, Scenario } from './types.js';
export type InputKind = 'speech' | 'action' | 'auto';
export type InterpretedKind = 'speech' | 'action' | 'mixed';
export const freeOpening: ActionOption = {id:'free-input', label:'自分の言葉や行動で応じる', reflection:'', principle:''};
export const openingFor = (scene:Scenario, id:string) => id === freeOpening.id ? freeOpening : scene.actions.find(a => a.id === id);
// Only visible details belong in opening choices: the player's character has not spoken yet.
const openingChoices: Record<string, string[]> = {
  shop: ['少し離れて、棚を見る様子を待つ', '手を伸ばした袋を指して「これですか？」'],
  bookstore: ['顔を上げた相手に「こんにちは」', '「本をお探しですね」と棚に近づく'],
  station: ['視界に入る位置で立ち止まる', '案内板を見ながら「どちらまで？」'],
};

export function turnChoices(place: string, line: string | undefined, generated: string[] = [], previous = '', turn = 0, seed = 0, heard = line ?? ''): string[] {
  const fallback = line === undefined ? openingChoices[place]
    : /自分で|ひとりで|一人で|手助けは|大丈夫です/.test(line) ? ['「わかりました」と一歩離れる', '離れる前に、困ったところがないか尋ねる']
    : /放課後|図書室|友達|友人|窓際/.test(line) ? ['うなずいて話の続きを待つ', '「それで、本の題名は？」']
    : /私に|ご用/.test(line) ? ['「急にすみません」と名乗る', '「何をお探しですか？」']
    : /袋|緑茶|お茶/.test(line) ? ['「どの袋にしましょうか？」', '似た袋を指して「こちらですね」']
    : /表紙|題名|本棚/.test(line) ? ['「覚えているところからどうぞ」', '題名と著者を一度に尋ねる']
    : /案内板|乗り場|バス|桜町/.test(line) ? ['本人が見る表示を一緒に確かめる', '「乗り場をお探しですね？」']
    : ['少し間をおいて返事を待つ', '間を置かず、別の聞き方を試す'];
  // Keep undisclosed character details and unverified directions out of learner choices.
  const clues = [/青(?:い|色)?/, /緑(?:の|色)?/, /桜町/, /放課後/, /図書室/, /窓際/, /香ばし/];
  const grounded = generated.filter(choice => !clues.some(clue => clue.test(choice) && !clue.test(heard))
    && !/(?:改札.{0,6}(?:出て|右|左)|(?:一番|いちばん)(?:右|左|奥).{0,12}(?:あります|ですよ)|(?:あちら|そちら|右|左).{0,6}(?:乗り場です|乗り場ですよ))/.test(choice));
  const pair = [...new Set([...grounded, ...(fallback ?? []), '少し待つ', 'もう少し詳しく尋ねる']
    .map(v => v.trim()).filter(v => v && v !== previous))].slice(0, 2);
  return (turn + seed) % 2 ? pair.reverse() : pair;
}

export type PlayerInputKind = InputKind;
export function playerInputLimit(_kind: PlayerInputKind): number { return 500; }
export function encodePlayerInput(_kind: PlayerInputKind, draft: string): string {
  const text = draft.trim();
  if (!text) throw new Error('内容を入力してください。');
  if (text.length > 500) throw new Error('入力できる文字数を超えています。');
  return text;
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
