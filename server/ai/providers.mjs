function textFromOpenAi(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : (part?.text || '')).join('');
  }
  return '';
}

function providerHttpError(response, payload = {}) {
  const message = payload?.error?.message || payload?.message || `AI provider unavailable (${response.status})`;
  return Object.assign(new Error(message), {
    status: response.status,
    retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
  });
}

async function postJson({ fetchImpl, url, headers, body, signal }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      throw Object.assign(error, { retryable: true, code: 'provider_timeout' });
    }
    if (!response.ok) throw providerHttpError(response);
    throw Object.assign(new Error('AI provider returned invalid JSON'), {
      status: response.status,
      retryable: response.status >= 500,
      cause: error,
    });
  }

  if (!response.ok) throw providerHttpError(response, payload);
  return payload;
}

export function createOpenRouterProvider({ apiKey, model = 'openrouter/free', fetchImpl = fetch, baseUrl = 'https://openrouter.ai/api/v1' } = {}) {
  return {
    id: 'openrouter', model, tier: 'light', enabled: Boolean(apiKey),
    async generate(request, { signal } = {}) {
      const payload = await postJson({
        fetchImpl,
        url: `${baseUrl}/chat/completions`,
        headers: { authorization: `Bearer ${apiKey}` },
        body: {
          model,
          messages: [{ role: 'user', content: request.prompt }],
          temperature: 0,
        },
        signal,
      });
      return { text: textFromOpenAi(payload), usage: payload.usage || null };
    },
  };
}

export function createCloudflareProvider({ accountId, apiToken, model = '@cf/meta/llama-3.1-8b-instruct-fast', fetchImpl = fetch, baseUrl = 'https://api.cloudflare.com/client/v4' } = {}) {
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
