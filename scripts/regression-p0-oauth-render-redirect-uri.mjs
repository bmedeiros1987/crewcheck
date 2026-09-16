/**
 * P0 — redirect_uri do Google OAuth em ambiente Render.
 *
 * `server/v1405/google-calendar-oauth.mjs::publicBaseUrl()` ignorava
 * `RENDER_EXTERNAL_URL` e caía num literal `https://crewcheck.online`. Em
 * qualquer serviço Render — produção ou preview — o `redirect_uri` enviado ao
 * Google apontava para um host diferente daquele onde o usuário iniciou o
 * fluxo, de modo que o callback voltava para outra origem e o state da sessão
 * não existia lá.
 *
 * Contrato fixado aqui, sem hardcode de host efêmero:
 *  1. `GOOGLE_OAUTH_REDIRECT_URI` explícito vence sempre;
 *  2. `CREWCHECK_PUBLIC_BASE_URL` explícito vence sobre o host do Render;
 *  3. sem configuração explícita, usa o host REAL do Render, nunca um literal;
 *  4. ausência total de configuração falha fechado — nunca inventa host;
 *  5. proxy HTTPS do Render nunca produz `http://`;
 *  6. host não confiável não vira redirect_uri;
 *  7. nenhum secret aparece no objeto de configuração pública.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'server/v1405/google-calendar-oauth.mjs');
const src = fs.readFileSync(SRC, 'utf8');
assert.ok(src.includes('function publicBaseUrl'), 'publicBaseUrl não localizada — arquivo mudou de forma inesperada');
assert.ok(src.includes('function oauthConfig'), 'oauthConfig não localizada — arquivo mudou de forma inesperada');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-oauth-render-'));
const file = path.join(tmp, 'oauth.mjs');
fs.writeFileSync(file, `${src}\nexport { publicBaseUrl as __publicBaseUrl, oauthConfig as __oauthConfig };\n`);
const mod = await import(pathToFileURL(file).href);

let failures = 0;
function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   <<< ${detail}`}`);
}
function withEnv(patch, run) {
  const keys = ['GOOGLE_OAUTH_REDIRECT_URI','GOOGLE_CALENDAR_REDIRECT_URI','CREWCHECK_PUBLIC_BASE_URL','CREWCHECK_APP_URL','PUBLIC_BASE_URL','TELEGRAM_PUBLIC_BASE_URL','RENDER_EXTERNAL_URL','RENDER_EXTERNAL_HOSTNAME','GOOGLE_OAUTH_WEB_CLIENT_ID','GOOGLE_OAUTH_WEB_CLIENT_SECRET','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CLIENT_SECRET','CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY','CREWCHECK_DATA_ENCRYPTION_KEY','CREWCHECK_AUTH_SECRET'];
  const saved = {};
  for (const key of keys) { saved[key] = process.env[key]; delete process.env[key]; }
  Object.assign(process.env, patch);
  try { return run(); }
  finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}
const SECRETS = { GOOGLE_OAUTH_WEB_CLIENT_SECRET: 'unit-test-secret-value', CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY: 'unit-test-encryption-value' };
const CALLBACK = '/api/google-calendar/oauth/callback';

console.log('\nP-0 — redirect_uri do Google OAuth sob Render');

// 1. redirect explícito vence tudo.
withEnv({ ...SECRETS, GOOGLE_OAUTH_REDIRECT_URI: `https://crewcheck.online${CALLBACK}`, RENDER_EXTERNAL_URL: 'https://crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('GOOGLE_OAUTH_REDIRECT_URI explícito prevalece', cfg.redirectUri === `https://crewcheck.online${CALLBACK}`, cfg.redirectUri);
});

// 2. base explícita vence o host do Render.
withEnv({ ...SECRETS, CREWCHECK_PUBLIC_BASE_URL: 'https://crewcheck.online', RENDER_EXTERNAL_URL: 'https://crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('CREWCHECK_PUBLIC_BASE_URL explícita prevalece sobre Render', cfg.redirectUri === `https://crewcheck.online${CALLBACK}`, cfg.redirectUri);
});

// 3. O caso que quebrava: Render sem configuração explícita.
withEnv({ ...SECRETS, RENDER_EXTERNAL_URL: 'https://crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('Render sem config explícita usa o host REAL do Render', cfg.redirectUri === `https://crewcheck.onrender.com${CALLBACK}`, cfg.redirectUri);
  check('Render sem config explícita NÃO inventa crewcheck.online', !cfg.redirectUri.includes('crewcheck.online'), cfg.redirectUri);
});

// 4. RENDER_EXTERNAL_HOSTNAME sozinho ainda produz https, nunca http.
withEnv({ ...SECRETS, RENDER_EXTERNAL_HOSTNAME: 'crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('hostname do Render vira https://, nunca http://', cfg.redirectUri === `https://crewcheck.onrender.com${CALLBACK}`, cfg.redirectUri);
});

// 5. Proxy HTTPS: um RENDER_EXTERNAL_URL http:// não pode virar redirect http.
withEnv({ ...SECRETS, RENDER_EXTERNAL_URL: 'http://crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('proxy HTTPS não produz redirect_uri http://', !/^http:\/\//i.test(cfg.redirectUri), cfg.redirectUri);
});

// 6. Fail-closed total: sem nenhuma configuração de host.
withEnv({ ...SECRETS }, () => {
  const cfg = mod.__oauthConfig();
  check('sem host configurado, falha fechado', cfg.configured === false, `configured=${cfg.configured} redirectUri=${cfg.redirectUri}`);
});

// 7. Fail-closed por secret ausente (comportamento preservado).
withEnv({ RENDER_EXTERNAL_URL: 'https://crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('sem client secret, falha fechado', cfg.configured === false, `configured=${cfg.configured}`);
});

// 8. Host não confiável fornecido pelo cliente nunca entra.
withEnv({ ...SECRETS, RENDER_EXTERNAL_URL: 'https://attacker.example.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('host não-Render não é aceito como redirect_uri', !cfg.redirectUri.includes('attacker.example.com'), cfg.redirectUri);
});

// 9. Nenhum secret vaza na configuração inspecionável.
withEnv({ ...SECRETS, RENDER_EXTERNAL_URL: 'https://crewcheck.onrender.com' }, () => {
  const cfg = mod.__oauthConfig();
  const serialized = JSON.stringify({ redirectUri: cfg.redirectUri, configured: cfg.configured });
  check('redirectUri/configured não carregam secret', !serialized.includes('unit-test-secret-value') && !serialized.includes('unit-test-encryption-value'), serialized);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`  ---> ${failures === 0 ? 'todos os casos passaram' : `${failures} falha(s)`}`);
if (failures) process.exit(1);
