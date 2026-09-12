import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOpenRouterProvider,
  createCloudflareProvider,
  createGeminiProvider,
  providersFromEnv,
} from './providers.mjs';

function fakeJsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return payload; } };
}

test('OpenRouter uses the free router by default and keeps the key in Authorization', async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return fakeJsonResponse({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 3 } });
  };
  const provider = createOpenRouterProvider({ apiKey: 'secret-openrouter', fetchImpl });
  const result = await provider.generate({ prompt: 'safe' });
  assert.equal(provider.model, 'openrouter/free');
  assert.equal(seen.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(seen.options.headers.authorization, 'Bearer secret-openrouter');
  assert.equal(JSON.parse(seen.options.body).model, 'openrouter/free');
  assert.equal(result.text, 'OK');
});

test('Cloudflare uses the documented Workers AI REST contract', async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return fakeJsonResponse({ result: { response: 'OK' } });
  };
  const provider = createCloudflareProvider({ accountId: 'acct-1', apiToken: 'secret-cf', fetchImpl });
  const result = await provider.generate({ prompt: 'safe' });
  assert.equal(provider.model, '@cf/meta/llama-3.1-8b-instruct');
  assert.equal(seen.url, 'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run/@cf/meta/llama-3.1-8b-instruct');
  assert.equal(seen.options.headers.authorization, 'Bearer secret-cf');
  assert.deepEqual(JSON.parse(seen.options.body), { prompt: 'safe' });
  assert.equal(result.text, 'OK');
});

test('Gemini uses the current Flash default and x-goog-api-key header', async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return fakeJsonResponse({ candidates: [{ content: { parts: [{ text: 'O' }, { text: 'K' }] } }] });
  };
  const provider = createGeminiProvider({ apiKey: 'secret-gemini', fetchImpl });
  const result = await provider.generate({ prompt: 'safe' });
  assert.equal(provider.model, 'gemini-3.8-flash');
  assert.equal(seen.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(seen.options.headers['x-goog-api-key'], 'secret-gemini');
  assert.deepEqual(JSON.parse(seen.options.body), { contents: [{ parts: [{ text: 'safe' }] }] });
  assert.equal(result.text, 'OK');
});

test('providersFromEnv enables only providers with the required server-side credentials', () => {
  const providers = providersFromEnv({
    OPENROUTER_API_KEY: 'or',
    AI_OPENROUTER_MODEL: 'openrouter/free',
    CLOUDFLARE_ACCOUNT_ID: 'account',
    CLOUDFLARE_AI_API_TOKEN: 'cf',
    GEMINI_API_KEY: '',
  }, async () => fakeJsonResponse({}));

  assert.deepEqual(providers.map(({ id, enabled }) => [id, enabled]), [
    ['openrouter', true],
    ['cloudflare', true],
    ['gemini', false],
  ]);
});
