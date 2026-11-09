import { bookstoreAssets, type BookstoreExpression, type BookstoreResponse } from './bookstore.config';
import { bookstoreDemo } from './bookstore.demo';

/** Shared frontend contract. A future API adapter can supply this directly to the stage. */
export type ConversationResponse = BookstoreResponse;
export interface ConversationScenario {
  id: 'supermarket' | 'bookstore' | 'station';
  location: string;
  title: string;
  character: string;
  age: number;
  profile: string;
  /** Stable personal goal, including when speech is incomplete. */
  intention: string;
  assets: { background: string; expressions: Record<BookstoreExpression, string> };
  assetGuide: string;
  demo: readonly ConversationResponse[];
}

export const conversationScenarios: readonly ConversationScenario[] = [
  {
    id: 'supermarket', location: 'スーパー', title: '田中さんと、お茶を探す', character: '田中さん', age: 78,
    profile: '架空の78歳の女性。穏やかで会話に協力的です。最近聞いた情報を忘れることもありますが、必要な手助けを受けながら自分で商品を選びたいと思っています。',
    intention: 'いつもの香ばしいお茶を探す。売り場の案内は頼みたいが、買う商品は自分で決める。',
    assets: {
      background: '/supermarket/supermarket-bg.webp',
      expressions: { neutral: '/supermarket/tanaka-neutral.webp', confused: '/supermarket/tanaka-confused.webp', cautious: '/supermarket/tanaka-cautious.webp', relieved: '/supermarket/tanaka-relieved.webp' },
    },
    assetGuide: '/supermarket/ASSETS.md',
    demo: [
      { reply: 'すみません、いつものお茶が見つからなくて……一緒に探してもらえますか？', expression: 'neutral', conversationEnded: false },
      { reply: '香ばしいお茶が好きなんです。棚まで一緒に来てもらえるとうれしいです。', expression: 'neutral', conversationEnded: false },
      { reply: 'お茶の棚は……さっき教えてもらったのに、どちらでしたっけ。もう一度教えていただけますか。', expression: 'confused', conversationEnded: false },
      { reply: '選んでくださるお気持ちはうれしいですが、買うものは自分で決めたいんです。', expression: 'cautious', conversationEnded: false },
      { reply: 'この辺りですね。ありがとう。いつものお茶かどうか、ここからは自分で見てみます。', expression: 'relieved', conversationEnded: true },
    ],
  },
  {
    id: 'bookstore', location: '書店', title: '書店で、ひと言。', character: '佐藤さん', age: 72,
    profile: '架空の72歳の男性。自分で本を探すことを大切にしています。手助けを希望しないこともあります。',
    intention: '青い表紙の本を自分のペースで探す。支援を受けるかどうかも自分で決めたい。',
    assets: bookstoreAssets, assetGuide: '/bookstore/ASSETS.md', demo: bookstoreDemo,
  },
  {
    id: 'station', location: '駅', title: '山本さんと、帰り道を確かめる', character: '山本さん', age: 76,
    profile: '架空の76歳の女性。帰りの交通手段を探しています。言葉が出にくく、話が途切れたり別の話題に移ったりします。不安な中でも、自分の帰りたい場所や希望を持っています。',
    intention: '自宅近くの桜町へ帰るため、駅前の青いバス乗り場を探している。駅員に一緒に案内を確かめてもらうことは受け入れられる。',
    assets: {
      background: '/station/station-bg.webp',
      expressions: { neutral: '/station/yamamoto-neutral.webp', confused: '/station/yamamoto-confused.webp', cautious: '/station/yamamoto-cautious.webp', relieved: '/station/yamamoto-relieved.webp' },
    },
    assetGuide: '/station/ASSETS.md',
    demo: [
      { reply: 'あの……青いのが……いつもの……あっちだったかしら……。', expression: 'confused', conversationEnded: false },
      { reply: '帰り……桜の……桜町。家の近く……。（駅前の案内板を指す）', expression: 'neutral', conversationEnded: false },
      { reply: 'いくつも聞かれると……待って……。夕方には、お茶を……家で。', expression: 'cautious', conversationEnded: false },
      { reply: '青い……バス、そう……。（案内板のバスの絵を指し、うなずく）', expression: 'neutral', conversationEnded: false },
      { reply: '駅の方に……一緒に……。でも、まだ……どこか……。（駅員のいる窓口を見る）', expression: 'relieved', conversationEnded: true },
    ],
  },
];

/** Fixed demonstration only: never claims to interpret free text or diagnose the person. */
export function nextDemoResponse(scenario: ConversationScenario, turn: number): ConversationResponse {
  return scenario.demo[Math.min(Math.max(0, turn + 1), scenario.demo.length - 1)];
}
