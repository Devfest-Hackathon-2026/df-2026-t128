import type { InterpretedKind } from '../shared/player-input.js';

// Offline fixtures have no language model. Recognize common explicit stage directions.
export function demoInputKind(text:string):InterpretedKind {
  const t=text.trim().replace(/[。！!]+$/u,'');
  const direction=/[（(][^）)]+[）)]/gu;
  if (direction.test(t)) return t.replace(direction,'').trim() ? 'mixed' : 'action';
  if (/[「『].+[」』]/u.test(t) && /(?:指し|向け|待ち|ながら|近づ|離れ|見せ|うなず)/u.test(t.replace(/[「『].+?[」』]/gu,''))) return 'mixed';
  return /(?:待つ|指す|指差す|指さす|離れる|見守る|見せる|近づく|うなずく|向ける|眺める|腰を下ろす|歩く|会釈する)$/u.test(t) ? 'action' : 'speech';
}
