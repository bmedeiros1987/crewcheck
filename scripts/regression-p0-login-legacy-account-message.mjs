import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

// #399: login() tratava "sem accounts row" (identidade antiga sem senha no padrão
// atual) exatamente igual a "senha incorreta" - mesma mensagem genérica para os dois
// casos. Isso engana usuários legítimos de contas antigas, que acreditam ter digitado
// a senha certa mas na verdade nunca tiveram um hash de senha para validar. A conta
// antiga precisa de uma mensagem distinta que aponte para a recuperação verificada
// (requestReset/resetPassword, já existente e já fail-closed - ver
// regression-auth-profile-only-recovery.mjs), sem NUNCA aceitar nenhuma senha para
// essas identidades (isso seria enfraquecer a autenticação).
//
// Follow-up (P0 Auth #399, produção V14.3.82/9c43b14): #494 só cobria "sem accounts
// row". Uma conta antiga pode MUITO bem ter uma accounts row e AINDA cair em
// password_mismatch com a senha correta digitada, em dois estados estruturais reais,
// nenhum dos dois provável de ser "senha digitada errada":
//  - must_change_password=1: o hash armazenado é um placeholder conhecido
//    (requestReset cria a conta com hash aleatório) ou uma senha temporária do fluxo
//    de convite de parceiro (server/v1410/partnerAccounts.mjs) - o usuário nunca
//    conseguiria adivinhar/digitar esse valor.
//  - hash/salt que não tem o formato que passwordDigest() sempre produz (32 hex do
//    salt, 128 hex do hash) - só pode ter sido escrito fora deste código (SQL direto,
//    migração externa); passwordMatches() nunca teria como confirmar nenhuma senha
//    contra ele, correta ou não.
// Nenhum dos dois casos aceita senha por fallback - só muda a classificação/mensagem
// de uma tentativa que já ia falhar de qualquer forma.
function extract(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `marcador não encontrado: ${marker}`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `fim de bloco não localizado para: ${marker}`);
  return source.slice(start, end + 2);
}

const passwordDigestSrc = extract('function passwordDigest(password, salt = crypto.randomBytes(16).toString(\'hex\')) {');
const passwordMatchesSrc = extract('function passwordMatches(password, salt, expected) {');
const isCurrentScryptFormatSrc = extract('function isCurrentScryptFormat(salt, hash) {');
const loginSrc = extract('async function login(req, res, db) {');

// Assertions estáticas: a conta antiga (sem accounts row) precisa ser tratada em um
// branch separado do "senha incorreta" real, e nunca deve reutilizar a checagem de
// passwordMatches para decidir se autentica.
assert.ok(
  /if \(!account\) \{[\s\S]*SELECT email FROM crewcheck_platform_profiles WHERE email=\? LIMIT 1[\s\S]*if \(profiles\[0\]\) \{[\s\S]*code: 'legacy_credential'[\s\S]*\}\s*\n\s*return sendJson\(res, 401, \{ ok: false, code: 'account_not_found'/.test(loginSrc),
  'login deve separar "sem conta" em profile-exists (legacy_credential) vs profile-not-found (account_not_found), sem chamar passwordMatches nesse caminho',
);
assert.ok(
  /if \(!passwordMatches\(password, account\.password_salt, account\.password_hash\)\) \{[\s\S]*if \(account\.must_change_password\) \{[\s\S]*code: 'account_state'[\s\S]*if \(!isCurrentScryptFormat\(account\.password_salt, account\.password_hash\)\) \{[\s\S]*code: 'unknown_hash_state'[\s\S]*return sendJson\(res, 401, \{ ok: false, code: 'password_mismatch'/.test(loginSrc),
  'dentro de "conta existe mas senha não bate", must_change_password e formato de hash não-atual precisam ser classificados antes de cair em password_mismatch',
);
// Duplicidade/casing safety: login() só pode selecionar a linha exata que o próprio
// safeEmail() normalizou - nenhuma comparação fuzzy (LOWER/TRIM) pode aparecer aqui,
// ou uma identidade diferente poderia ser selecionada por engano.
assert.doesNotMatch(loginSrc, /LOWER\(|TRIM\(/i, 'login() não pode usar comparação fuzzy de e-mail (risco de selecionar identidade errada em duplicidade/casing)');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-login-legacy-'));
const tempFile = path.join(tempDir, 'login.mjs');
try {
  const harness = `
import crypto from 'node:crypto';

${passwordDigestSrc}
${passwordMatchesSrc}
${isCurrentScryptFormatSrc}

function secureCompare(a, b) {
  return String(a) === String(b);
}
let envValues = {};
function env(name) { return envValues[name]; }
function isAdminEmail() { return false; }
function safeEmail(value) { return String(value || '').trim().toLowerCase(); }
async function readBody(req) { return req.__body; }
function sendJson(res, status, payload) { res.__captured = { status, payload }; }
function loginResponse(res, user, message) { res.__captured = { status: 200, payload: { ok: true, user, message } }; }
async function enrichCrewFunction(db, email, user) { return { ...user, rank: null }; }
async function userFromAccount(db, email, mustChange) { return { email, mustChangePassword: Boolean(mustChange) }; }

${loginSrc}

export function setEnv(values) { envValues = values; }
export { login, passwordDigest };

export function makeDb({ accountRow = null, profileRow = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT') && sql.includes('FROM crewcheck_platform_accounts')) return [accountRow ? [accountRow] : []];
      if (sql.includes('FROM crewcheck_platform_profiles')) return [profileRow ? [profileRow] : []];
      if (sql.startsWith('UPDATE crewcheck_platform_accounts')) return [{ affectedRows: 1 }];
      throw new Error('Unexpected query in test harness: ' + sql);
    },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);
  mod.setEnv({});

  const email = 'tripulante@example.com';
  const realPassword = 'senha-correta-2026';
  const digest = mod.passwordDigest(realPassword);
  const accountRow = { password_salt: digest.salt, password_hash: digest.hash, must_change_password: 0 };

  async function attemptLogin(db, password) {
    const req = { method: 'POST', __body: { email, password } };
    const res = {};
    await mod.login(req, res, db);
    return res.__captured;
  }

  // A) Nenhuma conta, nenhum perfil (e-mail nunca visto pelo sistema): mensagem
  // genérica inalterada - não deve revelar nada sobre e-mails realmente desconhecidos.
  const dbUnknown = mod.makeDb({});
  const unknownResult = await attemptLogin(dbUnknown, 'qualquer-coisa');
  assert.equal(unknownResult.status, 401, 'e-mail totalmente desconhecido deve continuar 401');
  assert.equal(unknownResult.payload.code, 'account_not_found', 'e-mail desconhecido deve ser classificado como account_not_found');
  assert.equal(unknownResult.payload.message, 'E-mail ou senha inválidos.', 'e-mail desconhecido deve manter a mensagem genérica original');
  assert.equal(dbUnknown.calls.some((c) => c.sql.startsWith('UPDATE')), false, 'tentativa negada não pode atualizar last_login_at');

  // B) Conta antiga: existe perfil mas nenhuma accounts row (sem hash de senha
  // conhecido). Deve ser CLARAMENTE distinta do caso A, apontando para recuperação,
  // e NUNCA deve aceitar nenhuma senha - testado com duas senhas diferentes.
  const dbLegacy = mod.makeDb({ profileRow: { email } });
  const legacyResult1 = await attemptLogin(dbLegacy, 'tentativa-1');
  const legacyResult2 = await attemptLogin(dbLegacy, 'tentativa-completamente-diferente');
  for (const legacyResult of [legacyResult1, legacyResult2]) {
    assert.equal(legacyResult.status, 401, 'conta antiga (sem accounts row) nunca deve autenticar com nenhuma senha');
    assert.equal(legacyResult.payload.code, 'legacy_credential', 'conta antiga deve ser classificada distintamente como legacy_credential');
    assert.notEqual(legacyResult.payload.message, unknownResult.payload.message, 'conta antiga deve ter mensagem diferente do e-mail totalmente desconhecido (não pode ser confundida com "senha incorreta")');
    assert.match(legacyResult.payload.message, /senha.*padrão atual|Esqueci minha senha/i, 'mensagem de conta antiga deve orientar para recuperação/definição de nova senha');
  }
  assert.equal(dbLegacy.calls.some((c) => c.sql.startsWith('UPDATE')), false, 'conta antiga negada não pode atualizar last_login_at');

  // C) Conta real, senha errada: deve continuar com a mensagem genérica original
  // (mesmo texto do caso A, para não vazar nada sobre contas reais), mas com um code
  // interno distinto (password_mismatch) para observabilidade.
  const dbReal = mod.makeDb({ accountRow });
  const wrongResult = await attemptLogin(dbReal, 'senha-errada-qualquer');
  assert.equal(wrongResult.status, 401, 'senha real incorreta deve continuar 401');
  assert.equal(wrongResult.payload.code, 'password_mismatch', 'senha real incorreta deve ser classificada como password_mismatch');
  assert.equal(wrongResult.payload.message, 'E-mail ou senha inválidos.', 'senha real incorreta deve manter a mensagem genérica original (não pode revelar mais que antes)');
  assert.equal(dbReal.calls.some((c) => c.sql.startsWith('UPDATE')), false, 'senha errada não pode atualizar last_login_at');

  // D) Conta real, senha correta: caminho feliz precisa continuar 100% funcional -
  // a prova mais importante de que o fix não quebrou o login legítimo.
  const dbCorrect = mod.makeDb({ accountRow });
  const okResult = await attemptLogin(dbCorrect, realPassword);
  assert.equal(okResult.status, 200, 'senha real correta deve autenticar normalmente');
  assert.equal(okResult.payload.ok, true, 'login bem-sucedido deve retornar ok:true');
  assert.equal(dbCorrect.calls.some((c) => c.sql.startsWith('UPDATE')), true, 'login bem-sucedido deve atualizar last_login_at');

  // E) Conta com must_change_password=1: hash armazenado é um placeholder/senha
  // temporária que o usuário não pode ter digitado de propósito. Testado com duas
  // senhas diferentes (incluindo a "senha real" de outro cenário) para provar que
  // NENHUMA senha é aceita por fallback - só a classificação/mensagem muda.
  // Deliberadamente um digest DIFERENTE do de realPassword - um placeholder/senha
  // temporária precisa ser algo que a senha real do usuário nunca poderia bater, ou
  // este cenário não estaria testando o que afirma.
  const placeholderDigest = mod.passwordDigest('placeholder-ninguem-sabe-este-valor');
  const mustChangeRow = { password_salt: placeholderDigest.salt, password_hash: placeholderDigest.hash, must_change_password: 1 };
  const dbMustChange = mod.makeDb({ accountRow: mustChangeRow });
  for (const attempt of ['qualquer-coisa', realPassword]) {
    const result = await attemptLogin(dbMustChange, attempt);
    assert.equal(result.status, 401, 'must_change_password=1 nunca deve autenticar via login normal');
    assert.equal(result.payload.code, 'account_state', 'must_change_password=1 deve ser classificado como account_state, não password_mismatch');
    assert.notEqual(result.payload.message, 'E-mail ou senha inválidos.', 'account_state deve ter mensagem distinta da genérica de senha incorreta');
    assert.match(result.payload.message, /Esqueci minha senha|definição de senha/i, 'mensagem de account_state deve orientar para recuperação');
  }
  assert.equal(dbMustChange.calls.some((c) => c.sql.startsWith('UPDATE')), false, 'account_state negado não pode atualizar last_login_at');

  // F) Hash/salt que não têm o formato atual (não escrito por passwordDigest()) -
  // nenhuma senha pode ser validada contra eles, correta ou não. Deve ser distinto
  // de password_mismatch (que implica "senha real, só errada") e NUNCA deve tentar
  // inferir qual algoritmo legado gerou o valor.
  const unknownFormatRow = { password_salt: 'nao-e-hex-valido', password_hash: 'muito-curto', must_change_password: 0 };
  const dbUnknownFormat = mod.makeDb({ accountRow: unknownFormatRow });
  const unknownFormatResult = await attemptLogin(dbUnknownFormat, 'qualquer-senha');
  assert.equal(unknownFormatResult.status, 401, 'hash em formato desconhecido nunca deve autenticar');
  assert.equal(unknownFormatResult.payload.code, 'unknown_hash_state', 'formato de hash não reconhecido deve ser unknown_hash_state, não password_mismatch');
  assert.equal(dbUnknownFormat.calls.some((c) => c.sql.startsWith('UPDATE')), false, 'unknown_hash_state negado não pode atualizar last_login_at (nenhuma mutação em estado não identificado)');

  console.log('login() legacy-account classification regression: ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('P0 #399 login legacy-account message regression: ok');
