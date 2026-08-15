import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceServer = path.join(repoRoot, 'server.mjs');
const applyScript = path.join(repoRoot, 'scripts/p0-elevenlabs-stt-key-isolation/apply.mjs');
const chain = fs.readFileSync(path.join(repoRoot, 'scripts/v139/apply.mjs'), 'utf8');
assert.match(chain, /p0-elevenlabs-stt-key-isolation\/apply\.mjs/, 'preparação canônica deve aplicar o hardening STT');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-stt-key-'));
fs.copyFileSync(sourceServer, path.join(tmp, 'server.mjs'));

for (let run = 0; run < 2; run += 1) {
  const result = spawnSync(process.execPath, [applyScript], { cwd: tmp, encoding: 'utf8' });
  assert.equal(result.status, 0, `apply STT deve ser idempotente (run ${run + 1}): ${result.stderr || result.stdout}`);
}

const patched = fs.readFileSync(path.join(tmp, 'server.mjs'), 'utf8');
assert.match(patched, /ELEVENLABS_STT_KEY_ENV_KEYS = \['ELEVENLABS_STT_API_KEY', 'CREWCHECK_ELEVENLABS_STT_API_KEY', \.\.\.ELEVENLABS_KEY_ENV_KEYS\]/, 'STT dedicado deve ter precedência');
assert.match(patched, /\^sk_\[A-Za-z0-9_-\]\{8,\}\$/, 'somente segredo sk_ compatível deve ser aceito para STT');
assert.match(patched, /const key = elevenLabsSttApiKey\(\)/, 'transcrição deve usar resolvedor STT, não resolvedor TTS genérico');
assert.doesNotMatch(patched, /const key = elevenLabsApiKey\(\);\n  if \(!key\) return \{ ok: false, configured: false, provider: 'elevenlabs'/, 'STT não pode mais usar chave TTS genérica diretamente');
assert.match(patched, /Não consegui processar seu áudio agora\. Tente novamente ou envie por texto\./, 'erro técnico do provedor deve ser sanitizado');
assert.match(patched, /elevenLabsActiveKeyEnv: elevenLabsSttKeyWithSource\(\)\.name/, 'health deve expor apenas o nome da variável ativa');
assert.match(patched, /'authentication_failed'/, 'health deve diferenciar falha de autenticação');
assert.doesNotMatch(patched, /elevenLabsActiveKeyEnv:.*\.value/, 'health nunca deve expor o segredo');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('OK: ElevenLabs STT usa chave dedicada/compatível sk_, sanitiza erro e expõe somente diagnóstico seguro.');
