import type { ActionOption, Scenario } from './types.js';

// Compatibility with stored sessions that still have an explicit action ID.
export const directConversationAction: ActionOption = {
  id: 'free-conversation',
  label: '自分の言葉で会話を始める（行動の事前選択なし）',
  reflection: '行動の事前選択はありません。実際に入力した声かけを振り返ります。',
  principle: '本人の希望に耳を傾け、返答を待つ。',
};

export function withConversationEntry(scenario: Scenario, actionId: string): Scenario {
  return actionId === directConversationAction.id
    ? { ...scenario, actions: [...scenario.actions, directConversationAction] }
    : scenario;
}
