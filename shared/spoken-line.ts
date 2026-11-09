// Parentheses in the role contract describe visible gestures, not spoken dialogue.
export function spokenLine(text: string): string {
  return text.replace(/（[^（）]*）|\([^()]*\)/gu, '').trim();
}
