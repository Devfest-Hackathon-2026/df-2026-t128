import type { Scenario } from './types.js';

export const characterIds = ['tanaka', 'sato', 'yamamoto'] as const;
export type CharacterId = typeof characterIds[number];
export const characters = {
  tanaka: { name: '田中さん', age: 78, voiceSceneId: 'shop' },
  sato: { name: '佐藤さん', age: 72, voiceSceneId: 'bookstore' },
  yamamoto: { name: '山本さん', age: 76, voiceSceneId: 'station' },
} as const;

export function defaultCharacterId(sceneId: string): CharacterId {
  if (sceneId === 'shop') return 'tanaka';
  if (sceneId === 'bookstore') return 'sato';
  if (sceneId === 'station') return 'yamamoto';
  throw new Error('Unknown scene');
}

export function pickCharacterId(random: () => number = Math.random): CharacterId {
  return characterIds[Math.min(2, Math.max(0, Math.floor(random() * characterIds.length)))];
}

const openings: Record<string, Record<CharacterId, string>> = {
  shop: {
    tanaka: 'すみません、いつものお茶が見つからなくて……一緒に探してもらえますか？',
    sato: 'お茶を探しているんですが……大丈夫です。少し自分で見てみたいんです。',
    yamamoto: 'あの……お茶の……いつもの袋が……。（お茶の棚の方を指す）',
  },
  bookstore: {
    tanaka: 'すみません、前に読んだ本を探していて。一緒に棚を見てもらえますか？',
    sato: '大丈夫ですよ。自分で探せますから。',
    yamamoto: 'あの……青い……前に読んだ……。（本棚を指す）',
  },
  station: {
    tanaka: 'すみません、桜町へ帰るバスの乗り場を、一緒に確認してもらえますか？',
    sato: '帰りのバスを調べているところです。まずは自分で案内を確認してみます。',
    yamamoto: 'あの……青いのが……いつもの……あっちだったかしら……。',
  },
};

const sceneGuidance: Record<string, { setting: string; endings: Record<CharacterId, string> }> = {
  shop: {
    setting: 'お茶の棚の前で、商品を見比べています。',
    endings: {
      tanaka: 'お茶探しで手伝ってほしい範囲を確かめたら、商品を決める前でも振り返りへ進めます。選ぶのは本人です。',
      sato: 'お茶を自分で探したいという意思を尊重して、ここで終えることもできます。購入まで手伝う必要はありません。',
      yamamoto: '短い問いや棚への指差しを手がかりに、お茶探しの希望を確かめます。分からないことを決めつけず、途中でも振り返れます。',
    },
  },
  bookstore: {
    setting: '本棚の前で、探している本を確かめています。',
    endings: {
      tanaka: '本探しで手伝ってほしい範囲を確かめたら、本が見つかる前でも振り返りへ進めます。店員への相談も本人に確認できます。',
      sato: '本を自分で探したいという意思を尊重して、ここで終えることもできます。さらに手助けを提案する必要はありません。',
      yamamoto: '短い問いや本棚への指差しを手がかりに、探している本を確かめます。題名が分からないままでも、途中で振り返れます。',
    },
  },
  station: {
    setting: '案内表示の前で、帰りの交通手段を確かめています。',
    endings: {
      tanaka: '帰りのバスの案内を一緒に確かめる方法が決まれば、乗車まで付き添わずに振り返れます。本人が選ぶ時間を残せます。',
      sato: '帰りのバスを自分で調べたいという意思を尊重して、ここで終えることもできます。必要なときに駅員へ相談するかも本人が選べます。',
      yamamoto: '短い問いや案内表示への指差しを手がかりに、帰り道の希望を確かめます。行き先を推測で決めず、必要なら本人に駅員への相談を提案できます。途中で振り返っても構いません。',
    },
  },
};

/** Identity is chosen once before the action screen, then stored in the session. */
export function withCharacter(scene: Scenario, characterId: CharacterId): Scenario {
  const person = characters[characterId];
  if (!person || !openings[scene.id]) throw new Error('Unknown scene/character');
  const canonical = characterId === defaultCharacterId(scene.id);
  return {
    ...scene, characterId, character: `${person.name}（${person.age}歳・架空の人物）`,
    opening: openings[scene.id][characterId],
    description: canonical ? scene.description : `${scene.location}で${person.name}が${sceneGuidance[scene.id].setting}声をかけると「${openings[scene.id][characterId]}」と返ってきました。`,
    completionHint: sceneGuidance[scene.id].endings[characterId],
    goal: characterId === 'sato' ? '本人が自分で確かめたい範囲と、手助けを望むかを尊重する。' : characterId === 'yamamoto' ? '短い問いや指差しを手がかりに、本人の希望を一つずつ確かめる。' : '本人が選べる形で、望んでいる手助けの範囲を確かめる。',
    actions: scene.id === 'bookstore' && characterId !== 'sato' ? scene.actions.map((action, i) => ({
      ...action, endOnSelection: undefined,
      label: ['探している本について、一つずつ尋ねる', '店員に確認したいか、本人に尋ねる', '一緒に棚を見ることを提案する'][i],
      reflection: ['本について本人に尋ねることを選びました。返事を待ち、分かったことを一つずつ確かめられます。', '店員への相談を提案する選択です。誰に何を伝えるか、本人の希望を聞けます。', '一緒に見ることを提案しました。本人が選ぶ時間と、手助けを断れる余地を残せます。'][i],
      principle: '本人のペースと、手助けを受けるかどうかの選択を尊重する。',
    })) : scene.actions,
  };
}

// A visible circumstance, not an inference about the learner's body language.
export function openingCue(scene: Scenario): string | undefined {
  return scene.id === 'station' && (scene.characterId ?? defaultCharacterId(scene.id)) === 'yamamoto'
    ? '山本さんは案内板を見上げてつぶやいています。まだあなたには気づいていません。'
    : undefined;
}

export function entryNarration(scene: Scenario): string {
  const name = characters[scene.characterId ?? defaultCharacterId(scene.id)].name;
  if (scene.id === 'shop') return `お茶の売り場で、${name}が棚を端から端まで見ています。ひとつの袋に手を伸ばし、また手を戻しました。`;
  if (scene.id === 'bookstore') return `本棚の前で、${name}が一冊ずつ背表紙を目で追っています。あなたが近くに来ると、ふと顔を上げました。`;
  return `駅の案内板の前で、${name}が立ち止まっています。矢印を目で追っていて、まだあなたには気づいていません。`;
}
