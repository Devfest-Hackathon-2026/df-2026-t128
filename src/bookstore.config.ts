export { expressions as bookstoreExpressions } from '../shared/types';
import type { Expression } from '../shared/types';
export type BookstoreExpression = Expression;

/** Frontend contract for a future provider adapter; no API dependency. */
export interface BookstoreResponse {
  reply: string;
  expression: BookstoreExpression;
  conversationEnded: boolean;
}

export const bookstoreAssets = {
  background: '/bookstore/bookstore-bg.webp',
  expressions: {
    neutral: '/bookstore/sato-neutral-v2.webp',
    confused: '/bookstore/sato-confused-v2.webp',
    cautious: '/bookstore/sato-cautious-v2.webp',
    relieved: '/bookstore/sato-relieved-v2.webp',
  } satisfies Record<BookstoreExpression, string>,
};

export const expressionLabels: Record<BookstoreExpression, string> = {
  neutral: '通常', confused: '困惑', cautious: '警戒', relieved: '安心',
};
