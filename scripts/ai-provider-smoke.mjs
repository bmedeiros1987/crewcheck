import { providersFromEnv } from '../server/ai/providers.mjs';

const timeoutMs = Math.max(1000, Number(process.env.AI_SMOKE_TIMEOUT_MS || 8000));
const providers = providersFromEnv(process.env).filter((provider) => provider.enabled);

if (providers.length === 0) {
  console.error('AI provider smoke: nenhum provedor possui credenciais server-side configuradas.');
  process.exitCode = 2;
} else {
  console.log(`AI provider smoke: ${providers.length} provedor(es) configurado(s).`);
}

for (const provider of providers) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await provider.generate({ prompt: 'Responda apenas OK.' }, { signal: controller.signal });
    const hasText = typeof result?.text === 'string' && result.text.trim().length > 0;
    if (!hasText) throw new Error('empty_response');
    console.log(`[PASS] ${provider.id} model=${provider.model || 'unknown'} latencyMs=${Date.now() - started}`);
  } catch (error) {
    console.error(`[FAIL] ${provider.id} model=${provider.model || 'unknown'} latencyMs=${Date.now() - started} reason=${error?.name || 'Error'}:${error?.message || 'unknown'}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}
