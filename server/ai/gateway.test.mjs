import test from 'node:test';
import assert from 'node:assert/strict';
import { AiGateway, aiGatewayConfigFromEnv } from './gateway.mjs';
import { AiPrivacyError, sanitizeExternalAiContext } from './privacy.mjs';

const request = { domain: 'concierge', instruction: 'Explique de forma curta', context: { intent: 'recovery', priority: 'high' } };

test('resolves locally before calling a provider', async () => {
  let calls = 0;
  const gateway = new AiGateway({ localResolvers: [async () => ({ resolved: true, text: 'local' })], providers: [{ id: 'free', tier: 'light', enabled: true, generate: async () => { calls += 1; } }] });
  assert.deepEqual(await gateway.resolve(request), { layer: 'local', resolved: true, text: 'local' });
  assert.equal(calls, 0);
});

test('falls back to the next light provider after bounded retries', async () => {
  let failedCalls = 0;
  const providers = [
    { id: 'first', tier: 'light', enabled: true, generate: async () => { failedCalls += 1; throw Object.assign(new Error('down'), { retryable: true }); } },
    { id: 'second', tier: 'light', enabled: true, generate: async () => ({ text: 'fallback' }) },
  ];
  const result = await new AiGateway({ providers, config: { retries: 1 } }).resolve(request);
  assert.equal(failedCalls, 2);
  assert.equal(result.layer, 'second');
  assert.equal(result.text, 'fallback');
});

test('never sends critical domains to an LLM', async () => {
  const gateway = new AiGateway({ providers: [{ id: 'free', tier: 'light', enabled: true, generate: async () => ({ text: 'unsafe' }) }] });
  await assert.rejects(() => gateway.resolve({ ...request, domain: 'compliance' }), (error) => error instanceof AiPrivacyError && error.code === 'critical_domain_local_only');
});

test('strong provider requires request and environment opt-in', async () => {
  let calls = 0;
  const strong = { id: 'paid', tier: 'strong', enabled: true, generate: async () => { calls += 1; return { text: 'paid' }; } };
  assert.equal((await new AiGateway({ providers: [strong], config: { allowPaid: true } }).resolve(request)).resolved, false);
  assert.equal((await new AiGateway({ providers: [strong], config: { allowPaid: false } }).resolve({ ...request, allowPaid: true })).resolved, false);
  assert.equal((await new AiGateway({ providers: [strong], config: { allowPaid: true } }).resolve({ ...request, allowPaid: true })).text, 'paid');
  assert.equal(calls, 1);
});

test('kill switch and daily budget fail closed', async () => {
  const provider = { id: 'free', tier: 'light', enabled: true, generate: async () => ({ text: 'remote' }) };
  assert.equal((await new AiGateway({ providers: [provider], config: { killSwitch: true } }).resolve(request)).reason, 'kill_switch');
  assert.equal((await new AiGateway({ providers: [provider], config: { dailyBudgetUnits: 0 } }).resolve(request)).reason, 'providers_exhausted');
});

test('timeout is enforced and the circuit opens after repeated failures', async () => {
  let calls = 0;
  const hanging = { id: 'hanging', tier: 'light', enabled: true, generate: async () => { calls += 1; return new Promise(() => {}); } };
  const gateway = new AiGateway({ providers: [hanging], config: { timeoutMs: 5, retries: 0, failureThreshold: 2, circuitResetMs: 60_000 } });
  assert.equal((await gateway.resolve(request)).reason, 'providers_exhausted');
  assert.equal((await gateway.resolve(request)).reason, 'providers_exhausted');
  assert.equal((await gateway.resolve(request)).reason, 'providers_exhausted');
  assert.equal(calls, 2);
});

test('sanitizer minimizes sensitive CrewLife/Fem context', () => {
  assert.deepEqual(sanitizeExternalAiContext({ intent: 'rest', summary: 'ana@example.com precisa descansar', cycleDay: 12, symptoms: 'pain', roster: 'JJ1234', arbitrary: 'secret' }), { intent: 'rest', summary: '[email] precisa descansar' });
});

test('feature flags default off and secrets stay outside public config', () => {
  const config = aiGatewayConfigFromEnv({ AI_OPENROUTER_ENABLED: 'true', OPENROUTER_API_KEY: 'secret' });
  assert.equal(config.providerFlags.openrouter, true);
  assert.equal(config.providerFlags.cloudflare, false);
  assert.equal(JSON.stringify(config).includes('secret'), false);
});
