function textFromOpenAi(payload) {
  return payload?.choices?.[0]?.message?.content || '';
}

async function postJson({ fetchImpl, url, headers, body, signal }) {
  const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error('AI provider unavailable'), { status: response.status, retryable: response.status === 429 || response.status >= 500 });
  return payload;
}

export function createOpenRouterProvider({ apiKey, model = 'openrouter/free', fetchImpl = fetch, baseUrl = 'https://openrouter.ai/api/v1' } = {}) {
  return {
    id: 'openrouter', model, tier: 'light', enabled: Boolean(apiKey),
    async generate(request, { signal } = {}) {
      const payload = await postJson({ fetchImpl, url: `${baseUrl}/chat/completions`, headers: { authorization: `Bearer ${apiKey}` }, body: { model, messages: [{ role: 'user', content: request.prompt }] }, signal });
      return { text: textFromOpenAi(payload), usage: payload.usage || null };
    },
  };
}

export function createCloudflareProvider({ accountId, apiToken, model = '@cf/meta/llama-3.1-8b-instruct', fetchImpl = fetch, baseUrl = 'https://api.cloudflare.com/client/v4' } = {}) {
  return {
    id: 'cloudflare', model, tier: 'light', enabled: Boolean(accountId && apiToken),
    async generate(request, { signal } = {}) {
      const payload = await postJson({ fetchImpl, url: `${baseUrl}/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`, headers: { authorization: `Bearer ${apiToken}` }, body: { prompt: request.prompt }, signal });
      return { text: payload?.result?.response || '', usage: payload?.result?.usage || null };
    },
  };
}

export function createGeminiProvider({ apiKey, model = 'gemini-3.8-flash', tier = 'light', fetchImpl = fetch, baseUrl = 'https://generativelanguage.googleapis.com/v1beta' } = {}) {
  return {
    id: 'gemini', model, tier, enabled: Boolean(apiKey),
    async generate(request, { signal } = {}) {
      const payload = await postJson({ fetchImpl, url: `${baseUrl}/models/${model}:generateContent`, headers: { 'x-goog-api-key': apiKey }, body: { contents: [{ parts: [{ text: request.prompt }] }] }, signal });
      return { text: payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '', usage: payload?.usageMetadata || null };
    },
  };
}

export function providersFromEnv(env = process.env, fetchImpl = fetch) {
  return [
    createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, model: env.AI_OPENROUTER_MODEL, fetchImpl }),
    createCloudflareProvider({ accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_AI_API_TOKEN, model: env.AI_CLOUDFLARE_MODEL, fetchImpl }),
    createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.AI_GEMINI_MODEL, tier: env.AI_GEMINI_TIER === 'strong' ? 'strong' : 'light', fetchImpl }),
  ];
}
