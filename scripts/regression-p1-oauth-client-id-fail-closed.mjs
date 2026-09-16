/**
 * P1 — client ID do Google OAuth deve ser configuração, não literal embutido.
 *
 * Servidor e cliente traziam o mesmo `...apps.googleusercontent.com` hardcoded
 * como fallback. Consequência: um deploy sem `GOOGLE_OAUTH_WEB_CLIENT_ID`
 * nunca falhava — ele seguia adiante usando o client ID de outro projeto, e o
 * `configured` do servidor jamais reprovava por client ID ausente.
 *
 * Contrato: sem configuração explícita, o client ID é vazio e o fluxo falha
 * fechado. Nenhum literal de client ID permanece no código-fonte.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
let failures = 0;
function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   <<< ${detail}`}`);
}

console.log('\nP-1 — client ID do Google OAuth fail-closed');

// 1. Nenhum literal de client ID no código de produção.
const LITERAL = /[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com/i;
for (const rel of ['server/v1405/google-calendar-oauth.mjs', 'client/src/lib/googleCalendarSync.ts']) {
  const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  check(`${rel} sem client ID literal`, !LITERAL.test(body), (body.match(LITERAL) || [''])[0]);
}

// 2. Servidor: sem client ID configurado, falha fechado.
const src = fs.readFileSync(path.join(ROOT, 'server/v1405/google-calendar-oauth.mjs'), 'utf8');
assert.ok(src.includes('function oauthConfig'), 'oauthConfig não localizada');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-clientid-'));
const file = path.join(tmp, 'oauth.mjs');
fs.writeFileSync(file, `${src}\nexport { oauthConfig as __oauthConfig };\n`);
const mod = await import(pathToFileURL(file).href);

const KEYS = ['GOOGLE_OAUTH_WEB_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_ID','VITE_GOOGLE_CLIENT_ID','GOOGLE_OAUTH_WEB_CLIENT_SECRET','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CLIENT_SECRET','CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY','CREWCHECK_DATA_ENCRYPTION_KEY','CREWCHECK_AUTH_SECRET','CREWCHECK_PUBLIC_BASE_URL','GOOGLE_OAUTH_REDIRECT_URI','RENDER_EXTERNAL_URL','RENDER_EXTERNAL_HOSTNAME'];
function withEnv(patch, run) {
  const saved = {};
  for (const key of KEYS) { saved[key] = process.env[key]; delete process.env[key]; }
  Object.assign(process.env, patch);
  try { return run(); }
  finally { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}
const REST = {
  GOOGLE_OAUTH_WEB_CLIENT_SECRET: 'unit-secret',
  CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY: 'unit-encryption',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://crewcheck.online/api/google-calendar/oauth/callback',
};

withEnv({ ...REST }, () => {
  const cfg = mod.__oauthConfig();
  check('servidor sem client ID falha fechado', cfg.configured === false, `configured=${cfg.configured}`);
});
withEnv({ ...REST, GOOGLE_OAUTH_WEB_CLIENT_ID: 'configured-id.apps.googleusercontent.com' }, () => {
  const cfg = mod.__oauthConfig();
  check('servidor com client ID configurado segue válido', cfg.configured === true, `configured=${cfg.configured}`);
});

// 3. Cliente: resolvedor devolve vazio sem env nem override.
const clientSrc = fs.readFileSync(path.join(ROOT, 'client/src/lib/googleCalendarSync.ts'), 'utf8');
const resolver = clientSrc.slice(clientSrc.indexOf('export function getGoogleClientId'));
check('resolvedor do cliente não tem fallback literal',
  !/GOOGLE_CLIENT_ID_FALLBACK/.test(resolver.slice(0, 400)),
  resolver.slice(0, 200));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`  ---> ${failures === 0 ? 'todos os casos passaram' : `${failures} falha(s)`}`);
if (failures) process.exit(1);
