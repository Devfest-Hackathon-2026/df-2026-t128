import type { CharacterId } from './scene-characters.js';
export type ProviderMode = 'demo' | 'gemini';
export interface ActionOption { id: string; label: string; reflection: string; principle: string; endOnSelection?: 'respect' }
export interface Scenario {
  characterId?: CharacterId;
  id: string; number: string; title: string; location: string; description: string;
  goal: string; character: string; opening: string; actions: ActionOption[];
  completionHint: string; accent: 'sage' | 'peach' | 'blue';
}
export const expressions = ['neutral', 'confused', 'cautious', 'relieved'] as const;
export type Expression = typeof expressions[number];
export interface CharacterLine { text: string; expression: Expression }
export interface Message { suggestions?:string[]; kind?: 'action' | 'mixed'; expression?: Expression; role: 'user' | 'assistant'; text: string }
export type SessionStatus = 'active' | 'completed' | 'interrupted';
export interface Session {
  characterId?: CharacterId;
  id: string; scenarioId: string; actionId: string; status: SessionStatus;
  turnCount: number; maxTurns: number; messages: Message[]; mode: ProviderMode;
  endReason?: 'turn-limit' | 'finish' | 'respect' | 'emergency';
}
export interface Reflection {
  action: { label: string; observation: string; principle: string };
  conversation: { source: 'demo' | 'gemini' | 'fixed'; observation: string; suggestion: string; quote: string | null };
  nextStep: string;
}
export interface SessionResponse { session: Session; reflection: Reflection | null }
