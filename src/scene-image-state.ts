import type { Expression } from '../shared/types';

export type ImageStatus = 'loaded' | 'failed';
export type ImageStates = Partial<Record<string, ImageStatus>>;

/** Keep the previous decoded portrait until the requested expression can be displayed. */
export function displayedExpression(
  requested: Expression, previous: Expression | null,
  images: Record<Expression, string>, states: ImageStates,
): Expression | null {
  if (states[images[requested]] === 'loaded') return requested;
  if (previous && states[images[previous]] === 'loaded') return previous;
  return null;
}

export function sceneImageProgress(background: string, portrait: string, states: ImageStates) {
  const needed = [background, portrait];
  return {
    failed: needed.some(path => states[path] === 'failed'),
    loading: needed.some(path => states[path] === undefined),
  };
}
