import { providersFromEnv } from '../server/ai/providers.mjs';

const timeoutMs = Math.max(1000, Number(process.env.AI_SMOKE_TIMEOUT_MS || 30000));
const providers = providersFromEnv(process.env).filter((provider) => provider.enabled);

if (providers.length === 0) {
  console.error('AI provider smoke: nenhum provedor possui credenciais server-side configuradas.');
  process.exitCode = 2;
} else {
  console.log(`AI provider smoke: ${providers.length} provedor(es) configurado(s); timeout=${timeoutMs}ms.`);
}

for (const provider of providers) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await provider.generate({ prompt: 'Responda apenas OK.' }, { signal: controller.signal });
    const hasText = typeof result?.text === 'string' && result.text.trim().length > 0;
    if (!hasText) throw Object.assign(new Error('empty_response'), { code: 'empty_response' });
    console.log(`[PASS] ${provider.id} model=${provider.model || 'unknown'} latencyMs=${Date.now() - started}`);
  } catch (error) {
    const code = error?.code ? ` code=${error.code}` : '';
    const status = error?.status ? ` status=${error.status}` : '';
    console.error(`[FAIL] ${provider.id} model=${provider.model || 'unknown'} latencyMs=${Date.now() - started}${status}${code} reason=${error?.name || 'Error'}:${error?.message || 'unknown'}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}
