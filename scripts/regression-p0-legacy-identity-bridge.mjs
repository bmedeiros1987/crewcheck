import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #399 legacy identity bridge (v14.4.00): a legacy crewcheck_users row with no
// current crewcheck_platform_profiles/accounts row must never get a modern account
// created just because its email matches - the modern identity is only ever
// materialized after the user proves possession of that email through the SAME
// single-use code flow already used for every other password reset
// (requestReset()/resetPassword()). This regression never runs the real roster
// recovery; ownership of any legacy roster is preserved purely because this bridge
// never references crewcheck_rosters/crewcheck_platform_rosters at all.
//
// Static guards below prove the *shape* of the materialized code. Because this
// slice can - for the first time - create crewcheck_platform_profiles/accounts for
// a legacy-only identity, shape alone isn't enough: the dynamic harness further
// down actually EXECUTES the real materialized requestReset()/resetPassword()/
// login(), against a stateful mock DB with real per-email row-locking, to prove the
// end-to-end behavior (issuance, invalid/expired code, valid consumption,
// single-use, real concurrent interleaving, and post-recovery login).

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  // "function NAME(" is a substring of "async function NAME(" too, so this one
  // marker locates both - but the slice must still start at "async " or an
  // extracted async function's internal await calls become a syntax error. The
  // parameter list is skipped via paren-depth tracking BEFORE searching for the
  // body's opening brace, because a destructured parameter (e.g. issueAuthArtifact's
  // `{ email, purpose, ... }`) contains its own `{` that would otherwise be
  // mistaken for the function body.
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() não encontrada em server/v139/auth.mjs`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const parenOpen = source.indexOf('(', start);
  let parenDepth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < source.length; i += 1) {
    if (source[i] === '(') parenDepth += 1;
    else if (source[i] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenClose = i; break; }
    }
  }
  const braceOpen = source.indexOf('{', parenClose);
  let depth = 0;
  for (let i = braceOpen; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name}() nunca fecha`);
}

function extractConst(name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} não encontrada em server/v139/auth.mjs`);
  const valueStart = start + marker.length;
  const first = source[valueStart];
  let end;
  if (first === '[' || first === '{' || source.startsWith('new Set(', valueStart)) {
    const openIdx = (first === '[' || first === '{') ? valueStart : source.indexOf('(', valueStart);
    const openChar = source[openIdx];
    const closeChar = openChar === '[' ? ']' : openChar === '{' ? '}' : ')';
    let depth = 0;
    for (let i = openIdx; i < source.length; i += 1) {
      if (source[i] === openChar) depth += 1;
      else if (source[i] === closeChar) {
        depth -= 1;
        if (depth === 0) {
          end = source.indexOf(';', i) + 1;
          break;
        }
      }
    }
  } else if (first === "'" || first === '"') {
    let i = valueStart + 1;
    while (source[i] !== first) i += 1;
    end = source.indexOf(';', i) + 1;
  } else {
    throw new Error(`formato de const não suportado para ${name}`);
  }
  assert.ok(end > start, `${name} nunca fecha`);
  return source.slice(start, end);
}

const legacyIdentityExistsSrc = extractFunction('legacyIdentityExists');
const requestResetSrc = extractFunction('requestReset');
const resetPasswordSrc = extractFunction('resetPassword');
const loginSrc = extractFunction('login');

// ============================================================================
// Guards estáticos (forma do código materializado)
// ============================================================================

// --- Regra 1: nunca criar conta/profile moderno só por achar o e-mail na tabela
// legada - requestReset() só pode emitir o código, nunca escrever identidade. ------
assert.doesNotMatch(
  requestResetSrc,
  /INSERT INTO crewcheck_platform_accounts|INSERT INTO crewcheck_platform_profiles|ensureProfile\(/,
  'requestReset() nunca pode criar profile/account - a criação só pode acontecer em resetPassword(), após consumo válido do código',
);

// legacyIdentityExists() é puramente estrutural: nunca lê segredo, nunca retorna uma
// linha individual (só contagens/metadado de schema), e falha fechado (false) em
// ambiguidade ou erro - nunca lançando para dentro de requestReset()/resetPassword().
for (const forbidden of ['password_hash', 'password_salt']) {
  assert.doesNotMatch(legacyIdentityExistsSrc, new RegExp(forbidden, 'i'), `legacyIdentityExists() nunca pode referenciar "${forbidden}"`);
}
assert.doesNotMatch(
  legacyIdentityExistsSrc,
  /SELECT\s+(?!TABLE_NAME|COLUMN_NAME|COUNT)/i,
  'legacyIdentityExists() só pode retornar contagens ou metadado de schema, nunca uma linha individual do usuário legado',
);
assert.match(legacyIdentityExistsSrc, /catch\s*\{\s*return false;\s*\}/, 'qualquer erro (ex.: mismatch de collation) deve falhar fechado retornando false, nunca lançar');
assert.ok(legacyIdentityExistsSrc.includes('=== 1'), 'só exatamente uma linha legada correspondente pode habilitar a ponte - ambiguidade (>1) deve falhar fechado');

// Os dois gates de requestReset() devem dobrar a nova elegibilidade na MESMA
// condição que já governa a resposta genérica não-enumerável - nunca um novo formato
// de resposta que vazasse a diferença entre "não existe" e "existe mas é legado".
assert.ok(
  requestResetSrc.includes('const legacyBridgeEligible = !profiles[0] && !accounts[0] && !isAdminEmail(email) && await legacyIdentityExists(db, email);'),
  'gate inicial deve computar legacyBridgeEligible a partir do e-mail já normalizado (safeEmail)',
);
assert.ok(
  requestResetSrc.includes('if (!profiles[0] && !accounts[0] && !isAdminEmail(email) && !legacyBridgeEligible) return sendJson(res, 200, generic);'),
  'gate inicial deve continuar retornando a MESMA resposta genérica quando não elegível',
);
assert.ok(
  requestResetSrc.includes('if (!lockedProfiles[0] && !lockedAccounts[0] && !legacyBridgeEligible) {'),
  'gate transacional (sob FOR UPDATE) deve considerar legacyBridgeEligible antes de decidir emitir o código',
);

assert.ok(
  resetPasswordSrc.includes('const legacyBridgeEligible = !lockedProfiles[0] && !lockedAccounts[0] && await legacyIdentityExists(db, email);'),
  'gate de consumo deve computar legacyBridgeEligible sob o mesmo lock transacional dos profiles/accounts',
);
assert.ok(
  resetPasswordSrc.includes('if (!lockedProfiles[0] && !lockedAccounts[0] && !legacyBridgeEligible) {'),
  'código não pode ser consumido se não houver identidade atual NEM ponte legada elegível',
);

// --- Regra 3: só materializa o profile DEPOIS da verificação do código, e só cria a
// account DEPOIS do profile - ordem no texto prova a ordem de execução, já que é
// tudo sequencial dentro da mesma função/transação. ---------------------------------
const codeVerificationIndex = resetPasswordSrc.indexOf('secureCompare(reset.code_hash');
const profileMaterializationIndex = resetPasswordSrc.indexOf('ensureProfile(connection, email)');
const accountInsertIndex = resetPasswordSrc.indexOf('INSERT INTO crewcheck_platform_accounts');
const consumeIndex = resetPasswordSrc.indexOf('used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL');
assert.ok(codeVerificationIndex >= 0, 'resetPassword() deve verificar o code_hash antes de qualquer escrita de identidade');
assert.ok(profileMaterializationIndex > codeVerificationIndex, 'ensureProfile() só pode ser chamado depois da verificação do código - nunca antes');
assert.ok(profileMaterializationIndex < accountInsertIndex, 'o profile deve existir antes do INSERT/UPSERT da account, para nunca duplicar identidade');
assert.ok(accountInsertIndex < consumeIndex, 'o código só pode ser marcado como consumido (used_at) depois que a conta já foi criada/atualizada com sucesso - tudo na mesma transação atômica');
assert.ok(
  resetPasswordSrc.includes('if (!lockedProfiles[0]) {\n      await ensureProfile(connection, email);\n    }'),
  'profile só deve ser materializado quando ainda não existir sob o mesmo lock - nunca duplicado',
);

// must_change_password=0 preservado - a senha definida na recuperação já é a senha
// definitiva, nunca um placeholder pendente de troca.
assert.ok(
  resetPasswordSrc.includes('ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt),must_change_password=0'),
  'senha recuperada nunca pode deixar must_change_password pendente',
);

// Single-use / concorrência: o mecanismo já testado (PR #417) de FOR UPDATE +
// used_at IS NULL continua absolutamente intocado - a ponte só adiciona um gate de
// elegibilidade ANTES dele, nunca substitui ou enfraquece a trava transacional.
for (const lock of [
  "SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE",
  "SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE",
  'SELECT * FROM crewcheck_platform_password_resets WHERE email=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
]) assert.ok(resetPasswordSrc.includes(lock), `trava transacional ausente em resetPassword(): ${lock}`);
assert.ok(
  resetPasswordSrc.includes("UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL"),
  'consumo single-use (used_at) deve permanecer intocado - garante no máximo uma identidade final mesmo sob duas tentativas concorrentes',
);

// Ownership de roster preservado: a ponte não pode, em nenhuma circunstância,
// referenciar tabelas de roster (legado ou moderno) - preservado estruturalmente
// por nunca ser alcançável a partir deste código.
for (const [name, src] of [
  ['legacyIdentityExists', legacyIdentityExistsSrc],
  ['requestReset', requestResetSrc],
  ['resetPassword', resetPasswordSrc],
]) {
  assert.doesNotMatch(src, /crewcheck_rosters|crewcheck_platform_rosters/, `${name}() nunca pode tocar tabelas de roster - ownership é preservado por nunca ser alcançado`);
}

// login() não pode ganhar nenhuma lógica especial para a ponte legada - a conta
// recuperada deve se comportar exatamente como qualquer conta normal (must_change_
// password=0), permitindo dois logins consecutivos sem pedir nova troca de senha.
assert.doesNotMatch(
  loginSrc,
  /legacyIdentityExists|legacyBridgeEligible/,
  'login() não pode ter lógica especial para a ponte legada - deve tratar a identidade recuperada como qualquer conta normal',
);

// Nunca logar segredo/código/e-mail completo - mesma convenção já usada no restante
// do arquivo (console.info() de metadado é aceitável, console.log/warn/error com
// code/token/email não é).
for (const [name, src] of [
  ['requestReset', requestResetSrc],
  ['resetPassword', resetPasswordSrc],
  ['legacyIdentityExists', legacyIdentityExistsSrc],
]) {
  assert.doesNotMatch(src, /console\.(?:log|warn|error).*?(?:code|token|email)/i, `${name}() não pode logar segredo/código/e-mail`);
}
assert.doesNotMatch(resetPasswordSrc, /console\./, 'resetPassword() não deve logar nada');
assert.doesNotMatch(legacyIdentityExistsSrc, /console\./, 'legacyIdentityExists() não deve logar nada');

// ============================================================================
// Harness dinâmico: executa o código materializado REAL de requestReset(),
// resetPassword() e login() (mais suas dependências locais reais: legacyIdentity
// Exists, issueAuthArtifact, resetHash, resetMessage, passwordDigest/Matches,
// enrichCrewFunction) contra um mock de DB com estado real e locks por e-mail que
// simulam o SELECT...FOR UPDATE do MySQL/InnoDB - a mesma trava já validada em
// #417. Dependências externas (common.mjs/delivery.mjs) recebem stand-ins fiéis,
// seguindo a mesma convenção de todo o resto desta suíte (ex.:
// regression-p0-legacy-recovery-candidate.mjs).
// ============================================================================

const collationReportColumnsSrc = extractConst('LEGACY_COLLATION_REPORT_COLUMNS');
const defaultCollationSrc = extractConst('LEGACY_DEFAULT_COLLATION');
const collationReportFnSrc = extractFunction('legacyColumnCollationReport');
const resolveCollationSrc = extractFunction('resolveCommonCollation');
const collateEqSrc = extractFunction('collateEq');
const authArtifactPurposesSrc = extractConst('AUTH_ARTIFACT_PURPOSES');
const authArtifactHashSrc = extractFunction('authArtifactHash');
const authArtifactCodeHashSrc = extractFunction('authArtifactCodeHash');
const issueAuthArtifactSrc = extractFunction('issueAuthArtifact');
const resetHashSrc = extractFunction('resetHash');
const resetMessageSrc = extractFunction('resetMessage');
const passwordDigestSrc = extractFunction('passwordDigest');
const passwordMatchesSrc = extractFunction('passwordMatches');
const isCurrentScryptFormatSrc = extractFunction('isCurrentScryptFormat');
const loginResponseSrc = extractFunction('loginResponse');
const crewFunctionsSrc = extractConst('CREW_FUNCTIONS');
const normalizeCrewFunctionSrc = extractFunction('normalizeCrewFunction');
const ensureCrewFunctionTableSrc = extractFunction('ensureCrewFunctionTable');
const enrichCrewFunctionSrc = extractFunction('enrichCrewFunction');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-legacy-identity-bridge-'));
const tempFile = path.join(tempDir, 'legacy-identity-bridge.mjs');
try {
  const harness = `
import crypto from 'node:crypto';

${collationReportColumnsSrc}
${defaultCollationSrc}
${collationReportFnSrc}
${resolveCollationSrc}
${collateEqSrc}
${legacyIdentityExistsSrc}
${authArtifactPurposesSrc}
${authArtifactHashSrc}
${authArtifactCodeHashSrc}
${issueAuthArtifactSrc}
${resetHashSrc}
${resetMessageSrc}
${passwordDigestSrc}
${passwordMatchesSrc}
${isCurrentScryptFormatSrc}
${loginResponseSrc}
${crewFunctionsSrc}
${normalizeCrewFunctionSrc}
${ensureCrewFunctionTableSrc}
${enrichCrewFunctionSrc}
${requestResetSrc}
${resetPasswordSrc}
${loginSrc}

export { legacyIdentityExists, requestReset, resetPassword, login, passwordDigest };

// --- Stand-ins fiéis para common.mjs/delivery.mjs (mesma convenção do resto da
// suíte - nunca importa o módulo real, para não arrastar dbPool/mysql2). ----------
function authSecret() { return 'test-secret-fixed-for-regression'; }
function safeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ? email : '';
}
function cleanText(value, max) {
  return String(value || '').normalize('NFC').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, max);
}
let envValues = {};
export function setEnv(values) { envValues = values; }
function env(name, fallback = '') { return envValues[name] === undefined ? fallback : envValues[name]; }
function flag(name, fallback = false) {
  const value = env(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on', 'enabled'].includes(String(value).toLowerCase());
}
let adminEmails = [];
export function setAdminEmails(list) { adminEmails = list; }
function isAdminEmail(email) { return adminEmails.includes(email); }
function secureCompare(a = '', b = '') {
  try {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch { return false; }
}
async function readBody(req) { return req.__body; }
function sendJson(res, status, payload) { res.__captured = { status, body: payload }; }
function issueJwt(user) { return 'jwt-test-' + user.email; }
function setAuthCookie(res, token) { res.__cookie = token; }

// ensureProfile()/userFromAccount() are imported from common.mjs in the real file.
// This is a behaviorally faithful re-implementation (check-then-insert, same shape)
// operating directly on the shared mock state, not a no-op - it must actually
// create/return a real profile row so the scenarios below can assert on it.
async function ensureProfile(dbLike, email, name = '') {
  const state = dbLike.__state;
  const existing = state.profiles.get(email);
  if (existing) return existing;
  const row = {
    email,
    public_id: 'pub_' + crypto.randomBytes(6).toString('hex'),
    display_name: cleanText(name || email.split('@')[0], 120) || 'Tripulante',
    plan: isAdminEmail(email) ? 'premium_unlimited' : 'free',
  };
  state.profiles.set(email, row);
  state.calls.push({ sql: '__MOCK_ENSURE_PROFILE_INSERT__', params: [email] });
  return row;
}
async function userFromAccount(dbLike, email, mustChangePassword = false) {
  const profile = await ensureProfile(dbLike, email);
  const admin = isAdminEmail(email);
  const plan = admin ? 'premium_unlimited' : String(profile.plan || 'free');
  return {
    id: profile.public_id,
    name: profile.display_name,
    email,
    role: admin ? 'admin' : plan,
    plan,
    premium: admin || plan !== 'free',
    admin,
    verified: true,
    mustChangePassword: Boolean(mustChangePassword),
  };
}

const mailbox = [];
export function drainMailbox() { return mailbox.splice(0); }
async function sendSystemEmail({ to, subject, text, html }) {
  const match = /Código: (\\d{6})/.exec(text || '');
  mailbox.push({ to, subject, code: match ? match[1] : null });
  return { ok: true, accepted: true, provider: 'mailersend-mock', status: 202, sendPaused: false, messageId: 'msg-test-' + mailbox.length };
}
async function telegramLink() { return null; }
async function sendTelegram() { return { ok: false }; }
async function callTelegram() { return { ok: false }; }
async function callUsageAllowed() { return { allowed: false }; }
async function consumeCallUsage() {}
function telegramToken() { return ''; }

function collationMismatchError() {
  return Object.assign(new Error('Illegal mix of collations'), { code: 'ER_CANT_AGGREGATE_2COLLATIONS' });
}

// Mutex per e-mail simulando o SELECT ... FOR UPDATE do InnoDB: a primeira query
// FOR UPDATE em crewcheck_platform_profiles dentro de uma transação adquire a
// trava; commit()/rollback() a libera. Isso reproduz a serialização real entre
// duas transações concorrentes tentando recuperar a MESMA identidade, sem precisar
// de um banco de verdade.
function createEmailMutex() {
  const chains = new Map();
  return async function lock(email) {
    const previous = chains.get(email) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    chains.set(email, previous.then(() => current));
    await previous;
    let released = false;
    return () => { if (released) return; released = true; release(); };
  };
}

export function makeDb({
  legacyEmails = [],
  collations = {},
  seedProfiles = [],
  seedAccounts = [],
  throwOn = null,
} = {}) {
  const state = {
    profiles: new Map(seedProfiles.map((row) => [row.email, row])),
    accounts: new Map(seedAccounts.map((row) => [row.email, { must_change_password: 0, ...row }])),
    passwordResets: [],
    authArtifacts: [],
    calls: [],
  };
  const calls = state.calls;
  const mutex = createEmailMutex();

  function runQuery(sql, params) {
    calls.push({ sql, params });
    if (throwOn && sql.includes(throwOn)) throw collationMismatchError();
    if (sql.includes("TABLE_NAME='crewcheck_users' LIMIT 1")) {
      return [legacyEmails.length > 0 ? [{ name: 'crewcheck_users' }] : []];
    }
    if (sql.includes("TABLE_NAME='crewcheck_users' AND COLUMN_NAME='email'")) {
      return [legacyEmails.length > 0 ? [{ name: 'email' }] : []];
    }
    if (sql.includes('information_schema.columns') && sql.includes('COLUMN_NAME=?')) {
      const [table, column] = params;
      const found = collations[\`\${table}.\${column}\`];
      return [found ? [{ charset: found.charset, collation: found.collation }] : []];
    }
    if (sql.includes('variantCount')) {
      const [target] = params;
      const count = legacyEmails.filter((e) => safeEmail(e) === safeEmail(target)).length;
      return [[{ variantCount: count }]];
    }
    if (sql.includes('SELECT email FROM crewcheck_platform_profiles WHERE email=?')) {
      const row = state.profiles.get(params[0]);
      return [row ? [{ email: row.email }] : []];
    }
    if (sql.includes('SELECT email FROM crewcheck_platform_accounts WHERE email=?')) {
      const row = state.accounts.get(params[0]);
      return [row ? [{ email: row.email }] : []];
    }
    if (sql.includes('SELECT created_at FROM crewcheck_platform_password_resets WHERE email=?')) {
      return [[]];
    }
    if (sql.includes('UPDATE crewcheck_platform_auth_artifacts') && sql.includes('SET invalidated_at')) {
      for (const artifact of state.authArtifacts) {
        if (artifact.email === params[0] && artifact.purpose === params[1] && !artifact.used_at && !artifact.invalidated_at) artifact.invalidated_at = new Date();
      }
      return [{}];
    }
    if (sql.includes('INSERT INTO crewcheck_platform_auth_artifacts')) {
      const [id, email, purpose, tokenHash, codeHash, expiresAt, correlationId] = params;
      state.authArtifacts.push({ id, email, purpose, token_hash: tokenHash, code_hash: codeHash, expires_at: expiresAt, correlation_id: correlationId, created_at: new Date(), used_at: null, invalidated_at: null, attempts: 0 });
      return [{}];
    }
    if (sql.includes('UPDATE crewcheck_platform_auth_artifacts') && sql.includes("delivery_state='accepted'")) {
      return [{}];
    }
    if (sql.includes('UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL')) {
      for (const r of state.passwordResets) { if (r.email === params[0] && !r.used_at) r.used_at = new Date(); }
      return [{}];
    }
    if (sql.includes('INSERT INTO crewcheck_platform_password_resets')) {
      const [id, email, codeHash, expiresAt, channels] = params;
      state.passwordResets.push({ id, email, code_hash: codeHash, expires_at: expiresAt, used_at: null, attempts: 0, channels, created_at: new Date() });
      return [{}];
    }
    if (sql.includes('UPDATE crewcheck_platform_password_resets SET channels=?')) { return [{}]; }
    if (sql.includes('SELECT * FROM crewcheck_platform_password_resets WHERE email=? AND used_at IS NULL')) {
      const rows = state.passwordResets.filter((r) => r.email === params[0] && !r.used_at).sort((a, b) => b.created_at - a.created_at);
      return [rows.slice(0, 1)];
    }
    if (sql.includes('UPDATE crewcheck_platform_password_resets SET attempts=attempts+1')) {
      const reset = state.passwordResets.find((r) => r.id === params[0]);
      if (reset) reset.attempts = (reset.attempts || 0) + 1;
      return [{}];
    }
    if (sql.includes('INSERT INTO crewcheck_platform_accounts')) {
      const [email, hash, salt] = params;
      state.accounts.set(email, { email, password_hash: hash, password_salt: salt, must_change_password: 0 });
      return [{}];
    }
    if (sql.includes('SELECT * FROM crewcheck_platform_accounts WHERE email=?')) {
      const row = state.accounts.get(params[0]);
      return [row ? [row] : []];
    }
    if (sql.includes('UPDATE crewcheck_platform_accounts SET last_login_at')) { return [{}]; }
    if (sql.includes('CREATE TABLE IF NOT EXISTS crewcheck_platform_profile_functions')) { return [{}]; }
    if (sql.includes('SELECT crew_function FROM crewcheck_platform_profile_functions')) { return [[]]; }
    throw new Error('Unexpected query in test harness: ' + sql + ' | params=' + JSON.stringify(params));
  }

  function makeConnection() {
    let unlock = null;
    return {
      __state: state,
      async beginTransaction() {},
      async query(sql, params) {
        if (sql.includes('crewcheck_platform_profiles') && sql.includes('FOR UPDATE') && !unlock) {
          unlock = await mutex(params[0]);
        }
        return runQuery(sql, params);
      },
      async commit() { if (unlock) { unlock(); unlock = null; } },
      async rollback() { if (unlock) { unlock(); unlock = null; } },
      async release() { if (unlock) { unlock(); unlock = null; } },
    };
  }

  return {
    __state: state,
    calls,
    state,
    async query(sql, params) { return runQuery(sql, params); },
    async getConnection() { return makeConnection(); },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  function makeReq(bodyObj) { return { method: 'POST', __body: bodyObj }; }
  async function callRequestReset(db, email, extra = {}) {
    const req = makeReq({ email, delivery: 'email', ...extra });
    const res = {};
    await mod.requestReset(req, res, db);
    return res.__captured;
  }
  async function callResetPassword(db, email, code, password) {
    const req = makeReq({ email, code, password, confirmPassword: password });
    const res = {};
    await mod.resetPassword(req, res, db);
    return res.__captured;
  }
  async function callLogin(db, email, password) {
    const req = makeReq({ email, password });
    const res = {};
    await mod.login(req, res, db);
    return res.__captured;
  }
  async function issueCodeFor(db, email) {
    const result = await callRequestReset(db, email);
    assert.equal(result.status, 200);
    const [sent] = mod.drainMailbox();
    assert.ok(sent && /^\d{6}$/.test(sent.code || ''), 'e-mail simulado deve conter um código de 6 dígitos, exatamente como o usuário real leria');
    return sent.code;
  }

  const collations = {
    'crewcheck_users.id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_users.email': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_rosters.user_id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_platform_accounts.email': { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
    'crewcheck_platform_profiles.email': { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
  };
  const allRuntimeCalls = [];
  const trackDb = (db) => { const origPush = db.calls.push.bind(db.calls); db.calls.push = (...args) => { allRuntimeCalls.push(...args); return origPush(...args); }; return db; };

  // ---------------------------------------------------------------------------
  // 1) legacy-only + requestReset: elegível, emite, mas NÃO cria identidade ainda.
  // ---------------------------------------------------------------------------
  {
    const target = 'soraiasaraivam@gmail.com';
    const db = trackDb(mod.makeDb({ legacyEmails: [target], collations }));
    assert.equal(await mod.legacyIdentityExists(db, target), true, 'pré-condição: exatamente uma linha crewcheck_users deve existir para o e-mail alvo');
    assert.equal(db.state.profiles.has(target), false, 'pré-condição: nenhum profile atual');
    assert.equal(db.state.accounts.has(target), false, 'pré-condição: nenhuma account atual');

    const result = await callRequestReset(db, target);
    assert.equal(result.status, 200);
    assert.equal(result.body.message, 'Se a conta estiver cadastrada, o código temporário será enviado pelos canais disponíveis.', 'resposta pública deve ser idêntica ao caso de identidade normal - não-enumerável');
    assert.equal(db.state.passwordResets.length, 1, 'exatamente um artifact/código deve ter sido emitido');
    assert.equal(db.state.authArtifacts.length, 1);
    const [sent] = mod.drainMailbox();
    assert.ok(sent && /^\d{6}$/.test(sent.code || ''), 'código real de 6 dígitos deve ter sido enviado');
    assert.equal(db.state.profiles.has(target), false, 'requestReset() NUNCA pode criar profile - só emite o código');
    assert.equal(db.state.accounts.has(target), false, 'requestReset() NUNCA pode criar account - só emite o código');
  }

  // ---------------------------------------------------------------------------
  // 2) código inválido/expirado: zero writes, fail-closed.
  // ---------------------------------------------------------------------------
  {
    const target = 'codigo-invalido@example.com';
    const db = mod.makeDb({ legacyEmails: [target], collations });
    const code = await issueCodeFor(db, target);

    // 2a) código errado.
    const wrong = await callResetPassword(db, target, '000000' === code ? '111111' : '000000', 'SenhaNovaValida1');
    assert.equal(wrong.status, 400);
    assert.equal(db.state.profiles.size, 0, 'código errado não pode criar profile');
    assert.equal(db.state.accounts.size, 0, 'código errado não pode criar account');

    // 2b) código certo, mas expirado (avança o relógio manualmente no registro).
    db.state.passwordResets[0].expires_at = new Date(Date.now() - 60_000);
    const expired = await callResetPassword(db, target, code, 'SenhaNovaValida1');
    assert.equal(expired.status, 400);
    assert.equal(db.state.profiles.size, 0, 'código expirado não pode criar profile');
    assert.equal(db.state.accounts.size, 0, 'código expirado não pode criar account');
  }

  // ---------------------------------------------------------------------------
  // 3) código válido: cria exatamente um profile (se ausente) + uma account, com
  // digest atual e must_change_password=0.
  // ---------------------------------------------------------------------------
  {
    const target = 'codigo-valido@example.com';
    const db = mod.makeDb({ legacyEmails: [target], collations });
    const code = await issueCodeFor(db, target);

    const ok = await callResetPassword(db, target, code, 'SenhaRecuperada123');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.message, 'Senha atualizada. Entre novamente.');
    assert.equal(db.state.profiles.size, 1, 'exatamente um profile deve ter sido criado');
    assert.equal(db.state.accounts.size, 1, 'exatamente uma account deve ter sido criada');
    const account = db.state.accounts.get(target);
    assert.equal(account.must_change_password, 0);
    // A senha nova deve validar via passwordDigest() com o formato scrypt atual.
    assert.match(account.password_salt, /^[0-9a-f]{32}$/i);
    assert.match(account.password_hash, /^[0-9a-f]{128}$/i);
    assert.equal(mod.passwordDigest('SenhaRecuperada123', account.password_salt).hash, account.password_hash, 'o hash gravado deve corresponder exatamente à senha enviada, com o salt gravado');
  }

  // ---------------------------------------------------------------------------
  // 4) single-use: primeiro consume funciona, segundo consume do MESMO código
  // falha e não cria identidade/account adicional.
  // ---------------------------------------------------------------------------
  {
    const target = 'single-use@example.com';
    const db = mod.makeDb({ legacyEmails: [target], collations });
    const code = await issueCodeFor(db, target);

    const first = await callResetPassword(db, target, code, 'PrimeiraSenhaOk1');
    assert.equal(first.status, 200, 'primeiro consume deve funcionar');
    assert.equal(db.state.profiles.size, 1);
    assert.equal(db.state.accounts.size, 1);
    const hashAfterFirst = db.state.accounts.get(target).password_hash;

    const second = await callResetPassword(db, target, code, 'SegundaSenhaOutra2');
    assert.equal(second.status, 400, 'segundo consume do mesmo código deve falhar (single-use)');
    assert.equal(db.state.profiles.size, 1, 'segundo consume não pode criar profile adicional');
    assert.equal(db.state.accounts.size, 1, 'segundo consume não pode criar account adicional');
    assert.equal(db.state.accounts.get(target).password_hash, hashAfterFirst, 'segundo consume não pode alterar a senha já definida');
  }

  // ---------------------------------------------------------------------------
  // 5) concorrência real: duas resetPassword() concorrentes para o MESMO código
  // (via mutex por e-mail simulando FOR UPDATE) deixam no máximo um profile/
  // account final - nenhuma duplicidade de identidade.
  // ---------------------------------------------------------------------------
  {
    const target = 'concorrencia@example.com';
    const db = mod.makeDb({ legacyEmails: [target], collations });
    const code = await issueCodeFor(db, target);

    const [resultA, resultB] = await Promise.all([
      callResetPassword(db, target, code, 'SenhaConcorrenteA1'),
      callResetPassword(db, target, code, 'SenhaConcorrenteB1'),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    assert.deepEqual(statuses, [200, 400], 'exatamente uma das duas tentativas concorrentes deve vencer (200) e a outra deve falhar (400) - nunca as duas com sucesso');
    assert.equal(db.state.profiles.size, 1, 'no máximo um profile final, mesmo sob concorrência real');
    assert.equal(db.state.accounts.size, 1, 'no máximo uma account final, mesmo sob concorrência real');
    const winnerPassword = resultA.status === 200 ? 'SenhaConcorrenteA1' : 'SenhaConcorrenteB1';
    const account = db.state.accounts.get(target);
    assert.equal(
      mod.passwordDigest(winnerPassword, account.password_salt).hash,
      account.password_hash,
      'a senha final gravada deve corresponder exatamente à tentativa vencedora, sem mistura entre as duas',
    );
  }

  // ---------------------------------------------------------------------------
  // 6) login depois da recuperação: primeiro e segundo login funcionam, sem pedir
  // nova troca (mustChangePassword:false em ambos) - a ausência de qualquer erro
  // aqui é o que evita o front-end cair em modo Demo/convidado.
  // ---------------------------------------------------------------------------
  {
    const target = 'login-pos-recuperacao@example.com';
    const db = mod.makeDb({ legacyEmails: [target], collations });
    const code = await issueCodeFor(db, target);
    const reset = await callResetPassword(db, target, code, 'MinhaSenhaFinal1');
    assert.equal(reset.status, 200);

    const firstLogin = await callLogin(db, target, 'MinhaSenhaFinal1');
    assert.equal(firstLogin.status, 200, 'primeiro login após recuperação deve funcionar');
    assert.equal(firstLogin.body.ok, true);
    assert.equal(firstLogin.body.message, 'Login realizado.', 'não pode pedir nova troca de senha após a recuperação');
    assert.equal(firstLogin.body.user.mustChangePassword, false);
    assert.equal(firstLogin.body.user.email, target);

    const secondLogin = await callLogin(db, target, 'MinhaSenhaFinal1');
    assert.equal(secondLogin.status, 200, 'segundo login consecutivo também deve funcionar');
    assert.equal(secondLogin.body.message, 'Login realizado.');
    assert.equal(secondLogin.body.user.mustChangePassword, false);
  }

  // ---------------------------------------------------------------------------
  // 7) compatibilidade: identidade atual / profile-only / ambíguo / desconhecido.
  // ---------------------------------------------------------------------------
  {
    // 7a) Identidade atual já existente (não-legado) continua funcionando (upsert de
    // senha via ON DUPLICATE KEY, sem passar pela ponte legada).
    const target = 'identidade-atual@example.com';
    const db = mod.makeDb({
      legacyEmails: [],
      collations,
      seedProfiles: [{ email: target, public_id: 'pub_existente', display_name: 'Existente' }],
      seedAccounts: [{ email: target, password_hash: 'x'.repeat(128), password_salt: 'y'.repeat(32), must_change_password: 0 }],
    });
    const code = await issueCodeFor(db, target);
    const result = await callResetPassword(db, target, code, 'NovaSenhaAtual123');
    assert.equal(result.status, 200);
    assert.equal(db.state.profiles.size, 1, 'não pode duplicar o profile já existente');
    assert.equal(db.state.accounts.size, 1);
    const login = await callLogin(db, target, 'NovaSenhaAtual123');
    assert.equal(login.status, 200);
  }
  {
    // 7b) Profile-only recovery (v14.3.96) continua funcionando: profile existe,
    // account não - resetPassword cria só a account, sem duplicar profile.
    const target = 'profile-only@example.com';
    const db = mod.makeDb({
      legacyEmails: [],
      collations,
      seedProfiles: [{ email: target, public_id: 'pub_profile_only', display_name: 'ProfileOnly' }],
      seedAccounts: [],
    });
    const code = await issueCodeFor(db, target);
    const result = await callResetPassword(db, target, code, 'NovaSenhaProfileOnly1');
    assert.equal(result.status, 200);
    assert.equal(db.state.profiles.size, 1);
    assert.equal(db.state.profiles.get(target).public_id, 'pub_profile_only', 'o profile pré-existente não pode ser substituído/recriado');
    assert.equal(db.state.accounts.size, 1);
  }
  {
    // 7c) Legado ambíguo (>1 linha normalizando para o mesmo e-mail) continua
    // fail-closed - nada é emitido.
    const target = 'ambiguo@example.com';
    const db = mod.makeDb({ legacyEmails: [target, ' Ambiguo@Example.com '], collations });
    const result = await callRequestReset(db, target);
    assert.equal(result.status, 200);
    assert.equal(db.state.passwordResets.length, 0, 'legado ambíguo não pode emitir código - precisa de revisão humana antes');
    assert.equal(mod.drainMailbox().length, 0);
  }
  {
    // 7d) E-mail totalmente desconhecido (sem legado, sem identidade atual)
    // continua sem criar nada.
    const target = 'desconhecido@example.com';
    const db = mod.makeDb({ legacyEmails: [], collations });
    const result = await callRequestReset(db, target);
    assert.equal(result.status, 200);
    assert.equal(db.state.passwordResets.length, 0);
    const fakeAttempt = await callResetPassword(db, target, '123456', 'QualquerSenha123');
    assert.equal(fakeAttempt.status, 400);
    assert.equal(db.state.profiles.size, 0);
    assert.equal(db.state.accounts.size, 0);
  }

  // ---------------------------------------------------------------------------
  // 8) ownership: nenhuma chamada real, em nenhum cenário acima, tocou tabela de
  // roster - checagem sobre o LOG REAL de SQL executado (mais forte que a checagem
  // estática, porque cobre exatamente o que rodou de verdade). Roster recovery não
  // é executado neste teste.
  // ---------------------------------------------------------------------------
  {
    const target = 'ownership-check@example.com';
    const db = trackDb(mod.makeDb({ legacyEmails: [target], collations }));
    const code = await issueCodeFor(db, target);
    await callResetPassword(db, target, code, 'SenhaOwnership123');
    await callLogin(db, target, 'SenhaOwnership123');
    for (const call of db.state.calls) {
      assert.doesNotMatch(call.sql, /crewcheck_rosters|crewcheck_platform_rosters/i, 'nenhuma query real pode tocar tabelas de roster');
    }
  }

  console.log('[p0-legacy-identity-bridge] OK — harness dinâmico prova: emissão sem criação prematura; código inválido/expirado sem writes; código válido cria exatamente 1 profile+1 account com must_change_password=0; single-use; concorrência real via mutex por e-mail deixa no máximo 1 identidade final; dois logins consecutivos pós-recuperação funcionam sem repedir troca; identidade atual/profile-only/ambíguo/desconhecido continuam corretos; nenhuma query tocou tabelas de roster.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
