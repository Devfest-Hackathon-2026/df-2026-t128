import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSafetyEvaluation, plannedCalls, safetyCases } from './safety-evaluation.js';
import { createProvider, validateConversation } from './provider.js';
import type { Provider } from './provider.js';

const fake: Provider = {
  mode: 'gemini',
  async reply(_scenario, session, input) {
    assert.notEqual(session.messages.at(-1)?.role, 'user');
    assert.ok(input.length > 0);
    return 'これは合成テスト応答です。';
  },
  async reflect(_scenario, session) {
    assert.equal(session.status, 'completed');
    return { source: 'gemini', observation: '合成観察', suggestion: '合成提案', quote: session.messages.find(m => m.role === 'user')!.text };
  },
};

test('synthetic runner covers all cases and repetitions but never reports a safety pass', async () => {
  const result = await collectSafetyEvaluation(fake, 2);
  assert.equal(result.status, 'human-review-required');
  assert.equal(result.records.length, safetyCases.length * 2);
  assert.equal(result.attemptedCalls, plannedCalls(2));
  assert.ok(result.records.every(r => r.verdict === 'human-review-required' && !r.error));
  assert.equal(result.records.find(r => r.caseId === 'refusal-pressure')!.session.turnCount, 3);
  assert.ok(result.records.filter(r => r.session.scenarioId === 'bookstore').every(r => r.session.endReason === 'respect'));
});

test('runner rejects demo and invalid repetition counts before any calls', async () => {
  await assert.rejects(collectSafetyEvaluation(createProvider({ AI_PROVIDER: 'demo' })));
  for (const count of [0, -1, 1.5, 4, NaN]) assert.throws(() => plannedCalls(count));
});

test('reply failure is incomplete, not retried or reflected, and errors are redacted', async () => {
  const result = await collectSafetyEvaluation({ ...fake,
    async reply() { throw new Error('SECRET_DIAGNOSTIC'); },
    async reflect() { assert.fail('Must not reflect a failed turn'); },
  });
  assert.equal(result.attemptedCalls, safetyCases.length);
  assert.ok(result.records.every(r => r.verdict === 'incomplete' && r.error === 'reply-unavailable' && r.session.turnCount === 0));
  assert.ok(!JSON.stringify(result).includes('SECRET_DIAGNOSTIC'));
});

test('reflection failure is incomplete without losing captured replies', async () => {
  const result = await collectSafetyEvaluation({ ...fake, async reflect() { throw new Error('private'); } });
  assert.equal(result.attemptedCalls, plannedCalls(1));
  assert.ok(result.records.every(r => r.error === 'reflection-unavailable' && r.session.turnCount >= 1));
});

test('known limitation: correct quotation is not a semantic safety filter', () => {
  const unsafe = { observation: '認知症と断定できます。', suggestion: '断られても何度も説得しましょう。', quote: '失礼します' };
  const result = validateConversation(unsafe, [{ role: 'user', text: '失礼します。' }]);
  assert.equal(result.suggestion, unsafe.suggestion);
  // This test documents the current boundary, not an endorsement or safety pass.
});
