import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

// #399 (P0 produção V14.3.82/9c43b14): sem acesso a banco nesta auditoria, o menor
// mecanismo possível para classificar o estado estrutural de uma credencial antiga é
// um endpoint admin-only e sanitizado. Prova aqui que ele: (a) exige admin real, (b)
// classifica corretamente os estados possíveis sem inferir algoritmo por comprimento
// de hash, (c) detecta duplicidade por casing/espaço sem usar essa comparação em
// login() (ver regression-p0-login-legacy-account-message.mjs), e (d) nunca devolve
// senha, hash completo, salt completo ou token - só comprimentos/booleanos.

function extract(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `marcador não encontrado: ${marker}`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `fim de bloco não localizado para: ${marker}`);
  return source.slice(start, end + 2);
}

const isCurrentScryptFormatSrc = extract('function isCurrentScryptFormat(salt, hash) {');
const classifySrc = extract('function classifyCredentialState(profile, account) {');
const diagnoseSrc = extract('async function diagnoseCredentialState(req, res, db) {');

// Guards estáticos: nunca expor hash/salt completos, nunca aceitar não-admin, nunca
// tentar identificar um algoritmo legado específico (sem prova concreta no repositório
// - ver auditoria: nenhum verificador legado existe em nenhuma versão deste código).
assert.doesNotMatch(diagnoseSrc, /password_hash:\s*account/, 'diagnóstico não pode ecoar o hash completo no payload');
assert.doesNotMatch(diagnoseSrc, /password_salt:\s*account/, 'diagnóstico não pode ecoar o salt completo no payload');
assert.match(diagnoseSrc, /payload\?\.admin \|\| isAdminEmail\(adminEmail\)/, 'diagnóstico deve exigir admin real (token ou e-mail configurado)');
assert.doesNotMatch(classifySrc, /recognized_legacy/, 'nenhum verificador de esquema legado deve existir sem prova concreta no repositório (regra #399)');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-credential-diagnosis-'));
const tempFile = path.join(tempDir, 'diagnose.mjs');
try {
  const harness = `
${isCurrentScryptFormatSrc}
${classifySrc}
${diagnoseSrc}

let jwtPayload = null;
function verifyJwt() { if (jwtPayload === 'throw') throw Object.assign(new Error('Sessão expirada.'), { status: 401 }); return jwtPayload; }
function requestToken() { return 'token-fake'; }
function safeEmail(value) { return String(value || '').trim().toLowerCase(); }
let adminEmails = [];
function isAdminEmail(email) { return adminEmails.includes(email); }
async function readBody(req) { return req.__body; }
function sendJson(res, status, payload) { res.__captured = { status, payload }; }

export function setJwtPayload(value) { jwtPayload = value; }
export function setAdminEmails(list) { adminEmails = list; }
export { diagnoseCredentialState, classifyCredentialState, isCurrentScryptFormat };

export function makeDb({ profileRow = null, accountRow = null, profileVariants = null, accountVariants = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('LOWER(TRIM(email))') && sql.includes('crewcheck_platform_profiles')) {
        return [profileVariants !== null ? profileVariants : (profileRow ? [{ email: profileRow.email }] : [])];
      }
      if (sql.includes('LOWER(TRIM(email))') && sql.includes('crewcheck_platform_accounts')) {
        return [accountVariants !== null ? accountVariants : (accountRow ? [{ email: accountRow.email }] : [])];
      }
      if (sql.includes('public_id') && sql.includes('crewcheck_platform_profiles')) return [profileRow ? [profileRow] : []];
      if (sql.includes('password_hash') && sql.includes('crewcheck_platform_accounts')) return [accountRow ? [accountRow] : []];
      throw new Error('Unexpected query in test harness: ' + sql);
    },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  const target = 'tripulante@example.com';

  function makeReq(email) {
    return { method: 'POST', __body: { email } };
  }
  async function diagnose(db) {
    const req = makeReq(target);
    const res = {};
    await mod.diagnoseCredentialState(req, res, db);
    return res.__captured;
  }

  // A) Sem admin real (token válido mas e-mail comum): 403, nenhuma query ao banco.
  {
    mod.setJwtPayload({ email: 'tripulante-comum@example.com', admin: false });
    mod.setAdminEmails([]);
    const db = mod.makeDb({});
    const result = await diagnose(db);
    assert.equal(result.status, 403, 'não-admin deve receber 403');
    assert.equal(db.calls.length, 0, 'não-admin não pode disparar nenhuma query de diagnóstico');
  }

  mod.setJwtPayload({ email: 'admin@example.com', admin: true });
  mod.setAdminEmails(['admin@example.com']);

  // B) Nenhum profile, nenhuma account: no_identity.
  {
    const db = mod.makeDb({});
    const result = await diagnose(db);
    assert.equal(result.status, 200);
    assert.equal(result.payload.state, 'no_identity');
    assert.equal(result.payload.profileExists, false);
    assert.equal(result.payload.accountExists, false);
  }

  // C) Profile existe, sem account: profile_only_legacy (mesmo estado que #494 já trata em login()).
  {
    const db = mod.makeDb({ profileRow: { email: target, public_id: 'pub_1', created_at: '2026-01-01' } });
    const result = await diagnose(db);
    assert.equal(result.payload.state, 'profile_only_legacy');
    assert.equal(result.payload.profileExists, true);
    assert.equal(result.payload.accountExists, false);
  }

  // D) Account com must_change_password=1: account_state, independentemente do formato do hash.
  {
    const db = mod.makeDb({
      profileRow: { email: target, public_id: 'pub_1', created_at: '2026-01-01' },
      accountRow: { email: target, password_hash: 'a'.repeat(128), password_salt: 'b'.repeat(32), must_change_password: 1, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null },
    });
    const result = await diagnose(db);
    assert.equal(result.payload.state, 'account_state');
    assert.equal(result.payload.mustChangePassword, true);
  }

  // E) Account com hash/salt fora do formato atual (não escrito por passwordDigest()): unknown_hash_state.
  {
    const db = mod.makeDb({
      profileRow: { email: target, public_id: 'pub_1', created_at: '2026-01-01' },
      accountRow: { email: target, password_hash: 'formato-nao-reconhecido', password_salt: 'tambem-nao', must_change_password: 0, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null },
    });
    const result = await diagnose(db);
    assert.equal(result.payload.state, 'unknown_hash_state');
    assert.equal(result.payload.credentialFormat.recognizedCurrentScheme, false);
    // Nunca o valor completo - só comprimento.
    assert.equal(typeof result.payload.credentialFormat.hashLength, 'number');
    assert.equal(typeof result.payload.credentialFormat.saltLength, 'number');
    assert.equal(JSON.stringify(result.payload).includes('formato-nao-reconhecido'), false, 'diagnóstico nunca pode vazar o valor do hash/salt armazenado');
  }

  // F) Account com hash/salt no formato atual e must_change_password=0: current_scrypt.
  {
    const db = mod.makeDb({
      profileRow: { email: target, public_id: 'pub_1', created_at: '2026-01-01' },
      accountRow: { email: target, password_hash: 'a'.repeat(128), password_salt: 'b'.repeat(32), must_change_password: 0, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: '2026-08-01' },
    });
    const result = await diagnose(db);
    assert.equal(result.payload.state, 'current_scrypt');
    assert.equal(result.payload.credentialFormat.recognizedCurrentScheme, true);
  }

  // G) Duplicidade: uma variante case/whitespace-insensitive existe com valor
  // armazenado diferente do e-mail normalizado - deve ganhar prioridade sobre
  // qualquer outra classificação.
  {
    const db = mod.makeDb({
      accountRow: { email: target, password_hash: 'a'.repeat(128), password_salt: 'b'.repeat(32), must_change_password: 0, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null },
      accountVariants: [{ email: target }, { email: ' Tripulante@Example.com' }],
    });
    const result = await diagnose(db);
    assert.equal(result.payload.state, 'duplicate_identity', 'variante armazenada diferente do valor normalizado deve ser sinalizada como duplicidade');
    assert.equal(result.payload.duplicateIdentity, true);
  }

  console.log('[p0-credential-state-diagnosis] OK — diagnóstico admin-only classifica estados estruturais sem inferir algoritmo, sem vazar hash/salt e sem aceitar não-admin.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
