import test from 'node:test';
import assert from 'node:assert/strict';
import { AiDevInputError, AiDevOrchestrator, sanitizeAiDevInput } from './dev-orchestrator.mjs';

const safeInput = { objective: 'Review retry behavior', items: [{ type: 'diff', label: 'gateway.patch', content: '+ retryCount += 1' }] };

test('accepts only allowlisted sanitized engineering artifacts', () => {
  assert.deepEqual(sanitizeAiDevInput(safeInput), safeInput);
  assert.throws(() => sanitizeAiDevInput({ items: [{ type: 'database', content: 'select 1' }] }), (error) => error instanceof AiDevInputError && error.code === 'unsupported_input_type');
  assert.throws(() => sanitizeAiDevInput({ items: [{ type: 'log', content: 'Authorization: Bearer sk-example123456789' }] }), (error) => error.code === 'secret_or_identifier_detected');
  assert.throws(() => sanitizeAiDevInput({ items: [{ type: 'documentation', content: 'raw roster and APZ regulatory inputs' }] }), (error) => error.code === 'raw_operational_data_detected');
  assert.throws(() => sanitizeAiDevInput({ userEmail: 'hidden', items: [{ type: 'test', content: 'ok' }] }), (error) => error.code === 'forbidden_field');
});

test('runs enabled providers in parallel and consolidates advisory reports', async () => {
  let active = 0;
  let peak = 0;
  const provider = (id, finding) => ({ id, enabled: true, generate: async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return { text: JSON.stringify({ findings: [{ text: finding }], risks: [{ text: 'Retry storm' }], suggestions: [{ text: 'Add a cap' }], evidence: [{ text: 'retryCount changes', artifact: 'gateway.patch' }] }) };
  } });
  const report = await new AiDevOrchestrator({ providers: [provider('openrouter', 'Shared finding'), provider('cloudflare', 'Shared finding'), provider('gemini', 'Unique finding')] }).analyze(safeInput);
  assert.equal(peak, 3);
  assert.equal(report.consensus[0].providers.length, 2);
  assert.equal(report.divergences.length, 1);
  assert.equal(report.mergeAuthorized, false);
  assert.equal(report.gatesReplaced, false);
});

test('fails closed before providers receive unsafe input', async () => {
  let calls = 0;
  const orchestrator = new AiDevOrchestrator({ providers: [{ id: 'gemini', enabled: true, generate: async () => { calls += 1; } }] });
  await assert.rejects(() => orchestrator.analyze({ items: [{ type: 'log', content: 'password=super-secret-value' }] }), AiDevInputError);
  assert.equal(calls, 0);
});

test('provider failure does not erase successful independent evidence', async () => {
  const providers = [
    { id: 'openrouter', enabled: true, generate: async () => { throw new Error('down'); } },
    { id: 'gemini', enabled: true, generate: async () => ({ text: JSON.stringify({ findings: [{ text: 'Keep local fallback' }], risks: [], suggestions: [], evidence: [] }) }) },
  ];
  const report = await new AiDevOrchestrator({ providers }).analyze(safeInput);
  assert.deepEqual(report.providers.completed, ['gemini']);
  assert.equal(report.divergences[0].text, 'Keep local fallback');
});

test('enforces a real timeout when a provider ignores abort', async () => {
  const orchestrator = new AiDevOrchestrator({
    timeoutMs: 5,
    providers: [{ id: 'stuck', enabled: true, generate: async () => new Promise(() => {}) }],
  });
  const report = await orchestrator.analyze(safeInput);
  assert.deepEqual(report.providers, { attempted: ['stuck'], completed: [] });
});
