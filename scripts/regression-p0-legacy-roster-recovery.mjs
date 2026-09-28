import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #399 pilot recovery: soraiasaraivam@gmail.com is a confirmed recoverable candidate
// (currentRosterCount:0, recoveryCandidate:true, conflict:null, 2 legacy rosters).
// This is the read-only-first, fail-closed write path that converts her (or any
// single resolved identity's) legacy rosters into the current schema WITHOUT ever
// touching her - or anyone's - current active roster, WITHOUT reusing the legacy
// password_hash, and WITHOUT auto-creating an identity. Nothing in this repository
// calls legacyRosterRecoveryExecute() outside its one admin HTTP route - recovering
// a real account still requires someone to call dry-run, review it, then call
// execute with the token dry-run returned.

const authSource = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');
const platformSource = fs.readFileSync('server/platform.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunctionFrom(source, name) {
  // "function NAME(" is a substring of "async function NAME(" too, so this one
  // marker locates both plain and async functions without needing two extractors -
  // but the slice must still start at "async " (not just "function") or an
  // extracted async function's internal await calls become a syntax error.
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() não encontrada`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  // The parameter list may itself destructure ({ row, ordinal }) and contain
  // braces before the function body even starts - skip past the whole parameter
  // list (tracked by paren depth) before looking for the body's opening brace.
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

function extractConstFrom(source, name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} não encontrada`);
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
  } else if (/[0-9]/.test(first)) {
    end = source.indexOf(';', valueStart) + 1;
  } else {
    throw new Error(`formato de const não suportado para ${name}`);
  }
  assert.ok(end > start, `${name} nunca fecha`);
  return source.slice(start, end);
}

const extractFunction = (name) => extractFunctionFrom(authSource, name);
const extractConst = (name) => extractConstFrom(authSource, name);

const collationReportColumnsSrc = extractConst('LEGACY_COLLATION_REPORT_COLUMNS');
const defaultCollationSrc = extractConst('LEGACY_DEFAULT_COLLATION');
const collationReportFnSrc = extractFunction('legacyColumnCollationReport');
const resolveCollationSrc = extractFunction('resolveCommonCollation');
const collateEqSrc = extractFunction('collateEq');
const errorCodeSrc = extractFunction('legacyAuditErrorCode');
const legacySha256Src = extractFunction('legacySha256');
const legacySanitizeRosterSrc = extractFunction('legacySanitizeRoster');
const legacyDeriveRosterKeySrc = extractFunction('legacyDeriveRosterKey');
const legacyRosterFingerprintSrc = extractFunction('legacyRosterFingerprint');
const recoveryLogTableReadySrc = extractFunction('legacyRecoveryLogTableReady');
const classifySrc = extractFunction('classifyLegacyRoster');
const planSrc = extractFunction('legacyRosterRecoveryPlan');
const sanitizedPlanRostersSrc = extractFunction('sanitizedPlanRosters');
const tokenTtlSrc = extractConst('LEGACY_ROSTER_RECOVERY_TOKEN_TTL_MS');
const planSignatureSrc = extractFunction('legacyRosterRecoveryPlanSignature');
const confirmationMacSrc = extractFunction('legacyRosterRecoveryConfirmationMac');
const confirmationTokenSrc = extractFunction('legacyRosterRecoveryConfirmationToken');
const tokenValidSrc = extractFunction('legacyRosterRecoveryTokenValid');
const dryRunSrc = extractFunction('legacyRosterRecoveryDryRun');
const executeSrc = extractFunction('legacyRosterRecoveryExecute');

const fullWriteSrc = [
  recoveryLogTableReadySrc, classifySrc, planSrc, sanitizedPlanRostersSrc,
  planSignatureSrc, confirmationMacSrc, confirmationTokenSrc, tokenValidSrc,
  dryRunSrc, executeSrc,
].join('\n');

// --- Static guards -----------------------------------------------------------

// Requirement 8: the recovery path must not even SELECT password material.
for (const forbidden of ['password_hash', 'password_salt']) {
  assert.doesNotMatch(fullWriteSrc, new RegExp(forbidden, 'i'), `código de recovery nunca pode referenciar "${forbidden}"`);
}

// Requirement 5: legacy tables are read-only. No INSERT/UPDATE/DELETE/ALTER/DROP/
// TRUNCATE may ever target crewcheck_users or crewcheck_rosters.
for (const verb of ['INSERT INTO crewcheck_users', 'UPDATE crewcheck_users', 'DELETE FROM crewcheck_users', 'ALTER TABLE crewcheck_users', 'DROP TABLE crewcheck_users', 'TRUNCATE crewcheck_users']) {
  assert.doesNotMatch(fullWriteSrc, new RegExp(verb.replace(/\s+/g, '\\s+'), 'i'), `nunca pode conter "${verb}"`);
}
for (const verb of ['INSERT INTO crewcheck_rosters', 'UPDATE crewcheck_rosters', 'DELETE FROM crewcheck_rosters', 'ALTER TABLE crewcheck_rosters', 'DROP TABLE crewcheck_rosters', 'TRUNCATE crewcheck_rosters']) {
  assert.doesNotMatch(fullWriteSrc, new RegExp(verb.replace(/\s+/g, '\\s+'), 'i'), `nunca pode conter "${verb}"`);
}

// Requirement 4 (static half): no UPDATE against the CURRENT rosters table either -
// the only write to crewcheck_platform_rosters is the INSERT of a new, inactive row.
assert.doesNotMatch(executeSrc, /UPDATE\s+crewcheck_platform_rosters/i, 'execute() nunca pode fazer UPDATE em crewcheck_platform_rosters - toda roster recuperada é um INSERT novo, active=FALSE');
assert.match(executeSrc, /VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,FALSE\)/, 'INSERT de roster recuperada deve gravar active=FALSE como literal, nunca um parâmetro que poderia ser TRUE');

// Requirement 2: execute() must require a confirmation token and must not proceed
// on a bare {email}.
assert.match(executeSrc, /confirmationToken/, 'execute() deve exigir confirmationToken');
assert.match(executeSrc, /if \(!confirmationToken\)/, 'execute() deve recusar chamadas sem confirmationToken (400) antes de qualquer leitura de plano');
assert.match(executeSrc, /legacyRosterRecoveryTokenValid\(/, 'execute() deve validar o confirmationToken contra o plano recomputado, não apenas aceitar qualquer valor');
// Hardening from independent review: the plan signature must represent not just
// "what content" (rosterKey:fingerprint) but "from which legacy row" - closes the
// theoretical case of two legacy rows with identical content but different ids.
assert.match(planSignatureSrc, /entry\.row\.id/, 'legacyRosterRecoveryPlanSignature deve incluir legacy_roster_id (entry.row.id), não só rosterKey/fingerprint');

// Requirement 4 (identity gate): both endpoints must require an existing current
// identity - never create one.
assert.doesNotMatch(fullWriteSrc, /INSERT INTO crewcheck_platform_accounts|INSERT INTO crewcheck_platform_profiles/i, 'recovery nunca pode criar uma conta/perfil - identidade ausente deve bloquear, não ser criada');
assert.match(planSrc, /no_current_identity/, 'plano deve bloquear explicitamente quando não há identidade atual');

// Requirement 9: legacyRosterRecoveryExecute must be wired from exactly one place
// (its own definition + the single admin HTTP route) - never a second call site
// (startup hook, scheduler, apply-chain step, etc.).
const executeCallSites = authSource.split('legacyRosterRecoveryExecute').length - 1;
assert.equal(executeCallSites, 2, `legacyRosterRecoveryExecute deve aparecer exatamente 2x no arquivo (definição + 1 rota) - encontrado ${executeCallSites}x. Uma chamada adicional sugeriria execução automática fora do endpoint admin.`);
assert.doesNotMatch(fs.readFileSync('scripts/v139/apply.mjs', 'utf8'), /legacyRosterRecoveryExecute|legacy-roster-recovery-execute/, 'a cadeia de apply/build nunca pode referenciar o execute de recovery');

// Requirement 3: the recovery write path must not duplicate its own JSON parser -
// it must reuse platform.mjs's exact validators via byte-for-byte-behavior copies.
const canonicalSanitizeRosterSrc = extractFunctionFrom(platformSource, 'sanitizeRoster');
const canonicalRosterKeySrc = extractFunctionFrom(platformSource, 'rosterKey');
const canonicalRosterFingerprintSrc = extractFunctionFrom(platformSource, 'rosterFingerprint');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-legacy-roster-recovery-'));
const tempFile = path.join(tempDir, 'legacy-roster-recovery.mjs');
try {
  const harness = `
import crypto from 'node:crypto';

${collationReportColumnsSrc}
${defaultCollationSrc}
${collationReportFnSrc}
${resolveCollationSrc}
${collateEqSrc}
${errorCodeSrc}
${legacySha256Src}
${legacySanitizeRosterSrc}
${legacyDeriveRosterKeySrc}
${legacyRosterFingerprintSrc}
${recoveryLogTableReadySrc}
${classifySrc}
${planSrc}
${sanitizedPlanRostersSrc}
${tokenTtlSrc}
${planSignatureSrc}
${confirmationMacSrc}
${confirmationTokenSrc}
${tokenValidSrc}
${dryRunSrc}
${executeSrc}

// Canonical platform.mjs versions, for the parity check only - a plain function
// rename, same body, no logic changes.
function sha256Canonical(value = '') { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
const sha256 = sha256Canonical;
${canonicalSanitizeRosterSrc.replace('function sanitizeRoster', 'function canonicalSanitizeRoster')}
${canonicalRosterKeySrc.replace('function rosterKey', 'function canonicalRosterKey')}
${canonicalRosterFingerprintSrc.replace('function rosterFingerprint', 'function canonicalRosterFingerprint')}

let jwtPayload = null;
function verifyJwt() { if (jwtPayload === 'throw') throw Object.assign(new Error('Sessão expirada.'), { status: 401 }); return jwtPayload; }
function requestToken() { return 'token-fake'; }
function safeEmail(value) { return String(value || '').trim().toLowerCase(); }
let adminEmails = [];
function isAdminEmail(email) { return adminEmails.includes(email); }
async function readBody(req) { return req.__body; }
function sendJson(res, status, payload) { res.__captured = { status, payload }; }
function authSecret() { return 'test-secret-fixed-for-regression'; }
function secureCompare(a = '', b = '') {
  const bufA = Buffer.from(String(a)); const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}

export function setJwtPayload(value) { jwtPayload = value; }
export function setAdminEmails(list) { adminEmails = list; }
export { legacyRosterRecoveryDryRun, legacyRosterRecoveryExecute, legacySanitizeRoster, legacyDeriveRosterKey, legacyRosterFingerprint, canonicalSanitizeRoster, canonicalRosterKey, canonicalRosterFingerprint };

function collationMismatchError() {
  return Object.assign(new Error('Illegal mix of collations'), { code: 'ER_CANT_AGGREGATE_2COLLATIONS' });
}

export function makeDb(config = {}) {
  const {
    hasRecoveryLogTable = true,
    hasLegacySchema = true,
    accountExists = false,
    profileExists = false,
    variantCount = 1,
    legacyRosterRows = [],
    collations = {},
    existingCurrentRosters = [],
    failOnRosterInsertNumber = null,
    // Models a genuine race: another concurrent execute() call already committed
    // this legacy_roster_id between THIS call's in-memory pre-check (which can't
    // see it) and its INSERT - only the database's real UNIQUE KEY constraint on
    // legacy_roster_id catches this, not the app-level SELECT pre-check.
    existingRecoveryLogAtDbLevel = [],
  } = config;

  const currentRosters = existingCurrentRosters.map((row) => ({ ...row }));
  const recoveryLog = [];
  const calls = [];
  let transactionRosterInserts = [];
  let transactionLogInserts = [];
  let rosterInsertCount = 0;

  async function poolQuery(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("TABLE_NAME='crewcheck_platform_roster_recovery_log'")) {
      return [hasRecoveryLogTable ? [{ name: 'crewcheck_platform_roster_recovery_log' }] : []];
    }
    if (sql.includes("TABLE_NAME='crewcheck_users'")) {
      if (!hasLegacySchema) return [[]];
      return [[
        { tbl: 'crewcheck_users', col: 'id' }, { tbl: 'crewcheck_users', col: 'email' },
        { tbl: 'crewcheck_rosters', col: 'id' }, { tbl: 'crewcheck_rosters', col: 'user_id' },
        { tbl: 'crewcheck_rosters', col: 'created_at' }, { tbl: 'crewcheck_rosters', col: 'deleted_at' },
        { tbl: 'crewcheck_rosters', col: 'period_year' }, { tbl: 'crewcheck_rosters', col: 'period_month' },
        { tbl: 'crewcheck_rosters', col: 'crew_id' }, { tbl: 'crewcheck_rosters', col: 'roster_json' },
        { tbl: 'crewcheck_rosters', col: 'source_file_name' }, { tbl: 'crewcheck_rosters', col: 'storage_provider' },
      ]];
    }
    if (sql.includes('information_schema.columns') && sql.includes('COLUMN_NAME=?')) {
      const [table, column] = params;
      const found = collations[\`\${table}.\${column}\`];
      return [found ? [{ charset: found.charset, collation: found.collation }] : []];
    }
    if (sql.includes('variantCount')) {
      return [[{ variantCount }]];
    }
    if (sql.includes('FROM crewcheck_rosters r') && sql.includes('JOIN crewcheck_users u')) {
      return [legacyRosterRows];
    }
    if (sql.includes('FROM crewcheck_platform_roster_recovery_log WHERE legacy_roster_id=?')) {
      const found = recoveryLog.find((row) => row.legacy_roster_id === params[0]);
      return [found ? [{ status: found.status }] : []];
    }
    if (sql.includes('FROM crewcheck_platform_rosters WHERE owner_email=? AND (roster_key=? OR fingerprint=?)')) {
      const [ownerEmail, rosterKeyValue, fingerprintValue] = params;
      const found = currentRosters.find((row) => row.owner_email === ownerEmail && (row.roster_key === rosterKeyValue || row.fingerprint === fingerprintValue));
      return [found ? [{ roster_key: found.roster_key, fingerprint: found.fingerprint }] : []];
    }
    if (sql.includes('FROM crewcheck_platform_accounts WHERE email=?')) {
      return [accountExists ? [{ email: params[0] }] : []];
    }
    if (sql.includes('FROM crewcheck_platform_profiles WHERE email=?')) {
      return [profileExists ? [{ email: params[0] }] : []];
    }
    throw new Error('Unexpected pool query in test harness: ' + sql);
  }

  const connection = {
    async beginTransaction() { transactionRosterInserts = []; transactionLogInserts = []; rosterInsertCount = 0; },
    async query(sql, params) {
      calls.push({ sql, params, tx: true });
      if (sql.includes('INSERT INTO crewcheck_platform_rosters')) {
        rosterInsertCount += 1;
        if (failOnRosterInsertNumber === rosterInsertCount) {
          throw Object.assign(new Error('Simulated mid-transaction failure'), { code: 'ER_SIMULATED_FAILURE' });
        }
        const [id, ownerEmail, rosterKeyValue, rosterJson, complianceJson, gymJson, sourceName, fingerprintValue] = params;
        transactionRosterInserts.push({ id, owner_email: ownerEmail, roster_key: rosterKeyValue, roster: rosterJson, compliance: complianceJson, gym: gymJson, source_name: sourceName, fingerprint: fingerprintValue, active: false });
        return [{}];
      }
      if (sql.includes('INSERT INTO crewcheck_platform_roster_recovery_log')) {
        const [id, legacyRosterId, ownerEmail, rosterKeyValue, currentRosterId, status, reason] = params;
        if (existingRecoveryLogAtDbLevel.includes(legacyRosterId)) {
          throw Object.assign(new Error("Duplicate entry for key 'crewcheck_roster_recovery_legacy_uq'"), { code: 'ER_DUP_ENTRY' });
        }
        transactionLogInserts.push({ id, legacy_roster_id: legacyRosterId, owner_email: ownerEmail, roster_key: rosterKeyValue, current_roster_id: currentRosterId, status, reason });
        return [{}];
      }
      throw new Error('Unexpected connection query in test harness: ' + sql);
    },
    async commit() {
      currentRosters.push(...transactionRosterInserts);
      recoveryLog.push(...transactionLogInserts);
    },
    async rollback() {
      transactionRosterInserts = [];
      transactionLogInserts = [];
    },
    async release() {},
  };

  return {
    calls,
    currentRosters,
    recoveryLog,
    async query(sql, params) { return poolQuery(sql, params); },
    async getConnection() { return connection; },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  function makeReq(bodyObj) {
    return { method: 'POST', __body: bodyObj };
  }
  async function callDryRun(db, email) {
    const req = makeReq({ email });
    const res = {};
    await mod.legacyRosterRecoveryDryRun(req, res, db);
    return res.__captured;
  }
  async function callExecute(db, email, confirmationToken) {
    const req = makeReq({ email, confirmationToken });
    const res = {};
    await mod.legacyRosterRecoveryExecute(req, res, db);
    return res.__captured;
  }

  const target = 'soraiasaraivam@gmail.com';
  const collations = {
    'crewcheck_users.id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_users.email': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_rosters.user_id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_platform_accounts.email': { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
    'crewcheck_platform_profiles.email': { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
  };
  const soraiaLegacyRosters = [
    {
      id: 'legacy-roster-1', created_at: '2026-06-05T00:00:00Z', deleted_at: null,
      period_year: 2026, period_month: 6, crew_id: 'legacy-crew-soraia',
      roster_json: { days: [{ date: '2026-06-01', legs: [] }, { date: '2026-06-02', legs: [] }] },
      source_file_name: 'junho.pdf', storage_provider: null,
    },
    {
      id: 'legacy-roster-2', created_at: '2026-07-01T00:00:00Z', deleted_at: null,
      period_year: 2026, period_month: 7, crew_id: 'legacy-crew-soraia',
      roster_json: { days: [{ date: '2026-07-01', legs: [] }] },
      source_file_name: 'julho.pdf', storage_provider: null,
    },
  ];

  mod.setJwtPayload({ email: 'admin@example.com', admin: true });
  mod.setAdminEmails(['admin@example.com']);

  // A) Não-admin: 403 em ambos os endpoints, nenhuma query.
  {
    mod.setJwtPayload({ email: 'tripulante-comum@example.com', admin: false });
    mod.setAdminEmails([]);
    const dryDb = mod.makeDb({});
    const dryResult = await callDryRun(dryDb, target);
    assert.equal(dryResult.status, 403);
    assert.equal(dryDb.calls.length, 0);

    const execDb = mod.makeDb({});
    const execResult = await callExecute(execDb, target, 'whatever-token');
    assert.equal(execResult.status, 403);
    assert.equal(execDb.calls.length, 0);
  }
  mod.setJwtPayload({ email: 'admin@example.com', admin: true });
  mod.setAdminEmails(['admin@example.com']);

  // B) execute sem confirmationToken: 400, nenhuma query de plano disparada.
  {
    const db = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters });
    const result = await callExecute(db, target, '');
    assert.equal(result.status, 400);
    assert.equal(db.calls.length, 0, 'sem token, execute não pode nem começar a calcular o plano');
  }

  // C) Identidade atual ausente: dry-run E execute bloqueados, nenhuma query além
  // de accounts/profiles é disparada (requisito 4).
  {
    const dryDb = mod.makeDb({ accountExists: false, profileExists: false });
    const dryResult = await callDryRun(dryDb, target);
    assert.equal(dryResult.payload.blocked, true);
    assert.equal(dryResult.payload.blockedReason, 'no_current_identity');
    assert.equal(dryResult.payload.confirmationToken, null);
    assert.ok(!dryDb.calls.some((c) => c.sql.includes('crewcheck_rosters')), 'sem identidade atual, nenhuma tabela legada deve ser consultada');

    const execDb = mod.makeDb({ accountExists: false, profileExists: false });
    const execResult = await callExecute(execDb, target, 'any-token-value');
    assert.equal(execResult.status, 200);
    assert.equal(execResult.payload.executed, false);
    assert.equal(execResult.payload.blockedReason, 'no_current_identity');
    assert.equal(execDb.currentRosters.length, 0);
    assert.equal(execDb.recoveryLog.length, 0);
  }

  // D) Caso real: dry-run encontra exatamente as 2 rosters da Soraia, ambas
  // recoverable, ZERO escritas.
  let confirmationToken;
  {
    const db = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters });
    const result = await callDryRun(db, target);
    assert.equal(result.status, 200);
    assert.equal(result.payload.blocked, false);
    assert.equal(result.payload.recoverableCount, 2, 'dry-run deve encontrar exatamente as 2 rosters legadas da Soraia');
    assert.equal(result.payload.rosters.length, 2);
    assert.ok(result.payload.rosters.every((r) => r.status === 'recoverable'));
    assert.ok(result.payload.confirmationToken, 'deve emitir um confirmationToken quando há algo recuperável');
    assert.equal(result.payload.confirmationExpiresInSeconds, 900);
    assert.equal(db.currentRosters.length, 0, 'dry-run nunca escreve em crewcheck_platform_rosters');
    assert.equal(db.recoveryLog.length, 0, 'dry-run nunca escreve no recovery log');
    assert.ok(!db.calls.some((c) => c.tx), 'dry-run nunca abre conexão/transação de escrita');
    const payloadStr = JSON.stringify(result.payload);
    assert.equal(payloadStr.includes('legacy-roster-1'), false, 'UUID legado nunca aparece na resposta');
    assert.equal(payloadStr.includes('junho.pdf'), false, 'nome de arquivo/conteúdo bruto nunca aparece na resposta');
    confirmationToken = result.payload.confirmationToken;
  }

  // E) Execute com o token do dry-run acima: as 2 rosters são gravadas active=false,
  // logadas, e a resposta não vaza UUID/roster bruto.
  let sharedDb;
  {
    sharedDb = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters });
    const result = await callExecute(sharedDb, target, confirmationToken);
    assert.equal(result.status, 200);
    assert.equal(result.payload.executed, true);
    assert.equal(result.payload.recoveredCount, 2);
    assert.ok(result.payload.results.every((r) => r.status === 'recovered'));
    assert.equal(sharedDb.currentRosters.length, 2, 'as 2 rosters devem ser persistidas');
    assert.ok(sharedDb.currentRosters.every((r) => r.active === false), 'toda roster recuperada deve entrar active=false - gate absoluto');
    assert.equal(sharedDb.recoveryLog.length, 2, 'as 2 recuperações devem ficar no log auditável');
    assert.ok(sharedDb.recoveryLog.every((r) => r.status === 'recovered'));
    assert.deepEqual(new Set(sharedDb.recoveryLog.map((r) => r.legacy_roster_id)), new Set(['legacy-roster-1', 'legacy-roster-2']));
    assert.ok(!sharedDb.calls.some((c) => /UPDATE\\s+crewcheck_platform_rosters/i.test(c.sql)), 'nenhuma UPDATE deve ter sido emitida contra crewcheck_platform_rosters');
    const payloadStr = JSON.stringify(result.payload);
    assert.equal(payloadStr.includes('legacy-roster-1'), false);
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(payloadStr), false, 'nenhum UUID individual na resposta');
  }

  // F) Segunda execução (mesmo token, mesmo e-mail, MESMO banco com estado
  // persistido da rodada anterior): no-op - nenhuma escrita nova, ambas reportadas
  // como já recuperadas.
  {
    const result = await callExecute(sharedDb, target, confirmationToken);
    assert.equal(result.status, 200);
    assert.equal(result.payload.executed, true);
    assert.equal(result.payload.recoveredCount, 0, 'segunda execução não pode recuperar nada de novo');
    assert.ok(result.payload.results.every((r) => r.status === 'already_recovered'));
    assert.equal(sharedDb.currentRosters.length, 2, 'nenhuma linha nova deve ter sido inserida na segunda execução');
    assert.equal(sharedDb.recoveryLog.length, 2, 'o log não pode duplicar entradas para a mesma legacy roster');
  }

  // G) Roster ativa atual é preservada: com uma roster ATIVA já existente para o
  // owner, a recuperação nunca a toca (nem via UPDATE nem sobrescrevendo seus
  // valores).
  {
    const activeRoster = { id: 'current-active-1', owner_email: target, roster_key: '2026-08', fingerprint: 'unrelated-fingerprint', active: true };
    const db = mod.makeDb({
      accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters,
      existingCurrentRosters: [activeRoster],
    });
    const dry = await callDryRun(db, target);
    const result = await callExecute(db, target, dry.payload.confirmationToken);
    assert.equal(result.payload.recoveredCount, 2);
    const stillThere = db.currentRosters.find((r) => r.id === 'current-active-1');
    assert.ok(stillThere, 'a roster ativa original deve continuar presente');
    assert.equal(stillThere.active, true, 'a roster ativa original deve continuar active=true - nunca desativada pela recuperação');
    assert.ok(!db.calls.some((c) => c.sql.includes('current-active-1') && /UPDATE/i.test(c.sql)), 'nenhuma UPDATE pode ter sido emitida contra a roster ativa existente');
  }

  // H) Conflito: uma das 2 rosters já tem um roster_key igual no schema atual -
  // ela vira conflict, NENHUMA escrita para ela, só a outra é recuperada.
  {
    const conflictingRoster = { id: 'current-conflict-1', owner_email: target, roster_key: '2026-06', fingerprint: 'some-other-fingerprint', active: false };
    const db = mod.makeDb({
      accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters,
      existingCurrentRosters: [conflictingRoster],
    });
    const dry = await callDryRun(db, target);
    assert.equal(dry.payload.recoverableCount, 1, 'a roster de junho deve virar conflict, só julho continua recoverable');
    const conflictEntry = dry.payload.rosters.find((r) => r.status === 'conflict');
    assert.ok(conflictEntry);
    assert.equal(conflictEntry.reason, 'roster_key_exists');

    const result = await callExecute(db, target, dry.payload.confirmationToken);
    assert.equal(result.payload.recoveredCount, 1);
    assert.equal(db.currentRosters.length, 2, '1 pré-existente + 1 nova = 2, a conflitante nunca ganhou uma segunda linha');
    assert.equal(db.recoveryLog.length, 1, 'só a roster não-conflitante deve ter entrado no log');
  }

  // I) Uma das 2 falha no meio da transação: ROLLBACK total - nenhuma das duas
  // fica persistida nem logada.
  {
    const db = mod.makeDb({
      accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters,
      failOnRosterInsertNumber: 2,
    });
    const dry = await callDryRun(db, target);
    assert.equal(dry.payload.recoverableCount, 2);
    const result = await callExecute(db, target, dry.payload.confirmationToken);
    assert.equal(result.status, 200, 'uma falha de escrita nunca pode virar 500 - deve ser reportada de forma sanitizada');
    assert.equal(result.payload.executed, false);
    assert.equal(db.currentRosters.length, 0, 'rollback total: a primeira roster que já tinha sido inserida na transação não pode sobreviver');
    assert.equal(db.recoveryLog.length, 0, 'rollback total: nenhuma entrada de log pode sobreviver');
  }

  // I2) Corrida real entre duas execuções concorrentes: o pré-check em memória
  // (SELECT ... WHERE legacy_roster_id=?) não enxerga a outra transação que ainda
  // não commitou, então ambas as rosters ainda parecem recoverable no dry-run -
  // mas a UNIQUE KEY real do banco (crewcheck_roster_recovery_legacy_uq) rejeita
  // a segunda tentativa de INSERT no momento em que ela de fato acontece. Isso
  // prova que a idempotência não depende só do pré-check da aplicação: mesmo numa
  // corrida que o pré-check não veria, o banco ainda impede duplicidade, e a
  // falha ainda causa ROLLBACK total (nunca uma linha órfã), nunca 500.
  {
    const db = mod.makeDb({
      accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters,
      existingRecoveryLogAtDbLevel: ['legacy-roster-2'],
    });
    const dry = await callDryRun(db, target);
    assert.equal(dry.payload.recoverableCount, 2, 'o pré-check em memória não enxerga a corrida - as duas ainda parecem recuperáveis no dry-run');
    const result = await callExecute(db, target, dry.payload.confirmationToken);
    assert.equal(result.status, 200, 'uma violação real de UNIQUE KEY nunca pode virar 500');
    assert.equal(result.payload.executed, false);
    assert.equal(db.currentRosters.length, 0, 'rollback total: a legacy-roster-1 já inserida na mesma transação não pode sobreviver à falha da segunda');
    assert.equal(db.recoveryLog.length, 0, 'rollback total: nenhuma entrada de log pode sobreviver a uma corrida perdida');
  }

  // J) Token de confirmação stale/inválido (plano mudou ou token forjado): execute
  // recusa e não escreve nada.
  {
    const db = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: soraiaLegacyRosters });
    const result = await callExecute(db, target, 'token-forjado-invalido.deadbeef');
    assert.equal(result.payload.executed, false);
    assert.equal(result.payload.blockedReason, 'confirmation_token_invalid_or_expired');
    assert.equal(db.currentRosters.length, 0);
    assert.equal(db.recoveryLog.length, 0);
  }

  // J2) Endurecimento da revisão independente: trocar SOMENTE o legacy_roster_id de
  // origem - mantendo rosterKey e fingerprint (mesmo conteúdo: mesmo período,
  // crewId e days) idênticos - deve invalidar um token já emitido. Isso prova que
  // a assinatura do plano representa "de qual roster legada veio", não só "qual
  // conteúdo seria gravado".
  {
    const rowA = { ...soraiaLegacyRosters[0], id: 'legacy-origin-A' };
    const rowB = { ...soraiaLegacyRosters[0], id: 'legacy-origin-B' }; // mesmo period_year/period_month/crew_id/days -> mesmo rosterKey e fingerprint

    const dryDb = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: [rowA] });
    const dry = await callDryRun(dryDb, target);
    assert.equal(dry.payload.recoverableCount, 1);
    const tokenForRowA = dry.payload.confirmationToken;
    assert.ok(tokenForRowA);

    const execDb = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: [rowB] });
    const result = await callExecute(execDb, target, tokenForRowA);
    assert.equal(result.payload.executed, false, 'token emitido para a linha legada A não pode autorizar a recuperação da linha B, mesmo com rosterKey/fingerprint idênticos');
    assert.equal(result.payload.blockedReason, 'confirmation_token_invalid_or_expired');
    assert.equal(execDb.currentRosters.length, 0);
    assert.equal(execDb.recoveryLog.length, 0);

    // Controle: o MESMO token, contra a MESMA linha (A), continua válido - a
    // mudança não quebrou o caminho legítimo.
    const controlDb = mod.makeDb({ accountExists: true, collations, variantCount: 1, legacyRosterRows: [rowA] });
    const controlResult = await callExecute(controlDb, target, tokenForRowA);
    assert.equal(controlResult.payload.executed, true);
    assert.equal(controlResult.payload.recoveredCount, 1);
  }

  // K) Identidade legada duplicada/ambígua: bloqueia, nenhuma escrita.
  {
    const db = mod.makeDb({ accountExists: true, collations, variantCount: 2 });
    const dry = await callDryRun(db, target);
    assert.equal(dry.payload.blocked, true);
    assert.equal(dry.payload.blockedReason, 'duplicate_legacy_user');
    assert.equal(dry.payload.confirmationToken, null);
  }

  // L) Migration do recovery log ainda não aplicada: bloqueia com um motivo claro,
  // não presume que a tabela existe.
  {
    const db = mod.makeDb({ accountExists: true, hasRecoveryLogTable: false });
    const result = await callDryRun(db, target);
    assert.equal(result.payload.blocked, true);
    assert.equal(result.payload.blockedReason, 'recovery_log_migration_pending');
  }

  // M) Paridade comportamental: as cópias legacySanitizeRoster()/
  // legacyDeriveRosterKey()/legacyRosterFingerprint() usadas pelo recovery devem
  // produzir exatamente a mesma saída que as versões canônicas de platform.mjs
  // para as mesmas entradas - não podem virar "dois motores independentes".
  {
    const sample = { year: 2026, month: 6, crewId: 'crew-xyz', days: [{ date: '2026-06-01', legs: [{ flight: 'AB123' }], rawText: 'should be stripped' }], rawText: 'top level should be stripped too' };
    assert.deepEqual(mod.legacySanitizeRoster(sample), mod.canonicalSanitizeRoster(sample), 'legacySanitizeRoster deve produzir exatamente a mesma saída que sanitizeRoster()');
    assert.equal(mod.legacyDeriveRosterKey(sample), mod.canonicalRosterKey(sample), 'legacyDeriveRosterKey deve produzir exatamente a mesma saída que rosterKey()');
    assert.equal(mod.legacyRosterFingerprint(sample), mod.canonicalRosterFingerprint(sample), 'legacyRosterFingerprint deve produzir exatamente a mesma saída que rosterFingerprint()');
  }

  console.log('[p0-legacy-roster-recovery] OK — dry-run somente leitura encontra exatamente as rosters recuperáveis; execute é fail-closed (identidade + token), grava sempre active=false, preserva a roster ativa atual, é idempotente por legacy_roster_id, faz rollback total em falha parcial, nunca lê credencial legada, nunca modifica as tabelas legadas, e reusa (sem duplicar) os validadores de conteúdo canônicos.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
