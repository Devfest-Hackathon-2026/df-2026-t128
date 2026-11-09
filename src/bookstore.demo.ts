import type { BookstoreResponse } from './bookstore.config';

/** Fixed script, independent of the user's wording. Not sentiment analysis. */
export const bookstoreDemo: readonly BookstoreResponse[] = [
  { reply: '大丈夫ですよ。自分で探せますから。', expression: 'neutral', conversationEnded: false },
  { reply: '題名が思い出せなくて……青い表紙だったと思うんですが。', expression: 'confused', conversationEnded: false },
  { reply: 'すみません、急いで決めるのは少し不安です。ここでゆっくり探してもいいですか。', expression: 'cautious', conversationEnded: false },
  { reply: 'ありがとうございます。必要になったら、私から店員さんに聞いてみます。', expression: 'relieved', conversationEnded: false },
  { reply: 'それでは、もう少し自分で本棚を見ていきますね。', expression: 'relieved', conversationEnded: true },
];
