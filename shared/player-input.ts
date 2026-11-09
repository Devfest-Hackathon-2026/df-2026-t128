import type { ActionOption, Scenario } from './types.js';
export type InputKind = 'speech' | 'action' | 'auto';
export type InterpretedKind = 'speech' | 'action' | 'mixed';
export const freeOpening: ActionOption = {id:'free-input', label:'自分の言葉や行動で応じる', reflection:'', principle:''};
export const openingFor = (scene:Scenario, id:string) => id === freeOpening.id ? freeOpening : scene.actions.find(a => a.id === id);
export const actionSuggestions:Record<string,string[]> = {
  shop:['少し待つ','商品の袋を指す','一歩離れる'],
  bookstore:['少し待つ','本棚を指す','一歩離れる'],
  station:['少し待つ','案内板を指す','一歩離れる'],
};
