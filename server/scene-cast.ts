import type { CharacterLine, Scenario } from '../shared/types.js';
import { defaultCharacterId, type CharacterId } from '../shared/scene-characters.js';
import { privateScenarios } from './private-scenarios.js';

const profiles: Record<CharacterId, string> = {
  tanaka: '田中さんは78歳の穏やかで協力的な女性。案内は受けたいが選択は自分で行う。最近聞いた案内をたまに聞き直す場合があるが、毎回忘れたり何にでも同意したりしない。',
  sato: '佐藤さんは72歳の落ち着いた男性。最初は自分で調べたいと援助を断る。繰り返し提案されても同意する義務はない。本人が望めば案内先を聞くこともできるが、敬意への報酬として支援を受け入れない。',
  yamamoto: '山本さんは76歳の穏やかな女性。長い質問では言葉が途切れる場合がある。短い問い、指差しやうなずきで意思を示せる。目的は一貫させ、意味のない言葉をランダムに繰り返さない。誤った推測には首を振れる。突然起きた言語障害を平常の特徴として説明しない。',
};
const intentions: Record<string, string> = {
  shop: 'いつもの香ばしい緑茶（緑の袋）を探す。購入する商品は本人が選ぶ。未確認の在庫や棚の位置、商品を見つけたことを捏造しない。',
  bookstore: '前に読んで気に入った青い表紙の本を探す。本人が本と探す方法を選ぶ。未確認の在庫を断定しない。',
  station: '桜町の自宅近くへ帰るため、駅前の青いバス乗り場を探す。正確な乗り場は未確認。本人が望めば駅員と確認できる。帰宅できたことやバスに乗れたことを捏造しない。',
};

export function characterFacts(scenario: Scenario): string {
  const id = scenario.characterId ?? defaultCharacterId(scenario.id);
  const agency:Record<CharacterId,string> = {
    tanaka:'新しい案内は抜けやすいが、見慣れた特徴なら自分で選べる。手伝いを喜ぶことと選択を任せることは別。待ってもらったら品物や表示を自分で見比べてよい。',
    sato:'昔から愛想を振りまく方ではなく、余計な世話には口が尖る。人に順番ややり方を決められるのが嫌い。これは本人の性格で、名前の出にくさとは別。名前の想起に時間がかかるが、手伝いを望むかの判断は明確。自分のペースを好み、一歩離れてもらったら自分の作業に戻れる。何度も勧められても根負けしない。',
    yamamoto:'言葉で複数の情報をやり取りする負担が大きい。静かに待たれたときは、声を出さず視線や手の動きだけで応じることもある。選択を急かされたときに無言でも同意にはしない。どれを望むかは本人が決める。',
  };
  if (id === defaultCharacterId(scenario.id)) return privateScenarios[scenario.id].facts + ' ' + agency[id];
  return `${profiles[id]} ${agency[id]} 今いる場所は${scenario.location}。${intentions[scenario.id]} 病名や未設定の生活歴を追加せず、目的と人物像を会話中に変えない。`;
}

const variantReplies: Record<string, Partial<Record<CharacterId, string[]>>> = {
  shop: {
    sato: ['選ぶくらい、自分でやりますよ。', 'いつもの緑の袋のお茶を探しているんです。', '買うものは自分で決めたいんです。', '必要なら店員さんに場所を聞きます。', 'では、ゆっくり探してみます。'],
    yamamoto: ['お茶……緑の……。（棚を指す）', 'いつもの、香ばしい……。', 'ええ……緑の袋。', '選ぶのは……自分で……。（棚に目を向ける）', '店の方に……場所を……。'],
  },
  bookstore: {
    tanaka: ['青い表紙の本なんです。前に読んで気に入りました。', '題名が出てこなくて。棚の案内をお願いできますか。', 'どの棚でしたっけ。もう一度教えてもらえますか。', '買う本は、自分で見てから決めたいです。', 'ありがとうございます。ここから少し自分で探してみます。'],
    yamamoto: ['本……青い表紙……。', '前に読んだ……また……。（本棚を指す）', '題名……今は……。', '……ええ、自分で……見て。', '店の方に……一緒に……。'],
  },
  station: {
    tanaka: ['桜町の自宅の近くへ帰りたいんです。', 'いつも青いバス乗り場を使っています。', '乗り場はどちらでしたっけ。もう一度確かめたいです。', 'どのバスにするかは、自分でも案内を見て決めたいです。', '駅員さんに確認する方法もありますね。ありがとうございます。'],
    sato: ['読んでるところですよ、今。', '桜町の自宅の近くへ帰るところです。', '青いバス乗り場を確認しています。', 'まだ手助けは要りません。必要なら駅員さんに聞きます。', 'では、ここで案内を確かめてみます。'],
  },
};

export function variantDemoLine(scenario: Scenario, turn: number): CharacterLine | undefined {
  const id = scenario.characterId;
  if (!id || id === defaultCharacterId(scenario.id)) return undefined;
  const replies = variantReplies[scenario.id]?.[id];
  if (!replies || turn < 0 || turn >= replies.length) throw new Error('Unknown character demo turn');
  const expressions: Record<CharacterId, CharacterLine['expression'][]> = {
    tanaka: ['neutral', 'neutral', 'confused', 'cautious', 'relieved'],
    sato: ['cautious', 'neutral', 'neutral', 'cautious', 'neutral'],
    yamamoto: ['confused', 'neutral', 'confused', 'neutral', 'relieved'],
  };
  return { text: replies[turn], expression: expressions[id][turn] };
}
