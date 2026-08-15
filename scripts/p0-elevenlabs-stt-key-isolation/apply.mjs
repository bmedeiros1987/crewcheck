import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[p0-elevenlabs-stt] server.mjs ausente');
let source = fs.readFileSync(serverPath, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`[p0-elevenlabs-stt] âncora ${label} esperada 1x, encontrada ${count}x`);
  source = source.replace(before, after);
}

const keyAnchor = "const ELEVENLABS_KEY_ENV_KEYS = ['ELEVENLABS_API_KEY', 'CREWCHECK_ELEVENLABS_API_KEY', 'ELEVENLABS_TTS_API_KEY'];";
const keyPatch = `${keyAnchor}\nconst ELEVENLABS_STT_KEY_ENV_KEYS = ['ELEVENLABS_STT_API_KEY', 'CREWCHECK_ELEVENLABS_STT_API_KEY', ...ELEVENLABS_KEY_ENV_KEYS];\nfunction isElevenLabsSecret(value) { return /^sk_[A-Za-z0-9_-]{8,}$/.test(String(value || '').trim()); }\nfunction elevenLabsSttKeyWithSource() {\n  for (const name of ELEVENLABS_STT_KEY_ENV_KEYS) {\n    const value = String(process.env[name] || '').trim();\n    if (value && isElevenLabsSecret(value)) return { name, value };\n  }\n  return { name: '', value: '' };\n}\nfunction elevenLabsSttApiKey() { return elevenLabsSttKeyWithSource().value; }\nlet elevenLabsSttAuthenticationFailed = false;`;
replaceOnce(keyAnchor, keyPatch, 'stt-key-resolver');

replaceOnce(
  "function elevenLabsSttConfigured() { return Boolean(elevenLabsApiKey()); }\nasync function transcribeTelegramAudioWithElevenLabs(buffer, fileName, mimeType) {\n  const key = elevenLabsApiKey();",
  "function elevenLabsSttConfigured() { return Boolean(elevenLabsSttApiKey()); }\nasync function transcribeTelegramAudioWithElevenLabs(buffer, fileName, mimeType) {\n  const key = elevenLabsSttApiKey();",
  'stt-dedicated-key-use',
);

replaceOnce(
  "    if (!response.ok) {\n      const message = payload?.detail?.message || payload?.message || 'Não consegui ouvir esse áudio agora.';\n      return { ok: false, configured: true, provider: 'elevenlabs', status: response.status, message };\n    }\n    const transcript = String(payload?.text || '').trim();",
  "    if (!response.ok) {\n      if (response.status === 401 || response.status === 403) elevenLabsSttAuthenticationFailed = true;\n      return { ok: false, configured: true, provider: 'elevenlabs', status: response.status, message: 'Não consegui processar seu áudio agora. Tente novamente ou envie por texto.' };\n    }\n    elevenLabsSttAuthenticationFailed = false;\n    const transcript = String(payload?.text || '').trim();",
  'stt-sanitized-provider-error',
);

replaceOnce(
  "    elevenLabsConfigured: elevenLabsSttConfigured(),\n    openaiConfigured: crewcheckSttConfigured(),",
  "    elevenLabsConfigured: elevenLabsSttConfigured(),\n    elevenLabsActiveKeyEnv: elevenLabsSttKeyWithSource().name,\n    elevenLabsState: !elevenLabsSttConfigured() ? 'unconfigured' : (elevenLabsSttAuthenticationFailed ? 'authentication_failed' : 'ready'),\n    openaiConfigured: crewcheckSttConfigured(),",
  'stt-sanitized-health',
);

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[p0-elevenlabs-stt] STT usa chave dedicada/compatível válida e nunca expõe erro técnico do provedor.');
