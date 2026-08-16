import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #399 follow-up: production identity-audit found unexpectedTables (auth_accounts,
// crewcheck_users, crewcheck_rosters) living in the SAME schema as the current
// crewcheck_platform_* tables. Git archaeology confirmed crewcheck_users/
// crewcheck_rosters were a real, MySQL-backed user/roster model (id CHAR(36) PK,
// unique email, user_id-linked rosters) active from v11.0.8 (2026-06-21) until its
// code was deleted in v13.5.5 "Operational Core Recovery" (2026-07-10) - five days
// before the Aiven MySQL cutover (9cf5fad2, 2026-07-15). No migration in this repo
// ever dropped these tables. legacyTableAudit() is the read-only, admin-only tool
// that inspects whatever unexpectedTables exist live: schema (column names/types
// only), row counts, a date range when a created-at-shaped column exists, and, for
// any e-mail-shaped column, whether stored values are normalized and how many
// distinct values do/don't already match a current account or profile.

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const marker = `async function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() não encontrada em server/v139/auth.mjs`);
  const braceOpen = source.indexOf('{', start);
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
  if (first === '[' || source.startsWith('new Set(', valueStart)) {
    const openIdx = first === '[' ? valueStart : source.indexOf('(', valueStart);
    const openChar = source[openIdx];
    const closeChar = openChar === '[' ? ']' : ')';
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
  } else if (first === '/') {
    let i = valueStart + 1;
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue; }
      if (source[i] === '/') break;
      i += 1;
    }
    let j = i + 1;
    while (/[a-z]/i.test(source[j])) j += 1;
    end = source.indexOf(';', j) + 1;
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

const identityAuditKnownTablesSrc = extractConst('IDENTITY_AUDIT_KNOWN_TABLES');
const cutoverSrc = extractConst('LEGACY_CUTOVER_TIMESTAMP');
const emailPatternSrc = extractConst('LEGACY_EMAIL_COLUMN_PATTERN');
const datePatternSrc = extractConst('LEGACY_DATE_COLUMN_PATTERN');
const sensitivePatternSrc = extractConst('LEGACY_SENSITIVE_COLUMN_PATTERN');
const textTypesSrc = extractConst('LEGACY_TEXT_TYPES');
const dateTypesSrc = extractConst('LEGACY_DATE_TYPES');
const columnsSrc = extractFunction('legacyTableColumns');
const emailAnalysisSrc = extractFunction('legacyTableEmailAnalysis');
const bridgeEmailPatternSrc = extractConst('LEGACY_ROSTER_BRIDGE_EMAIL_PATTERN');
const bridgeSrc = extractFunction('legacyRosterBridgeAudit');
const auditSrc = extractFunction('legacyTableAudit');

// Guards estáticos: somente leitura, somente agregados/schema, sempre admin, e -
// crucialmente - nenhum nome de tabela/coluna pode vir da requisição (isso é o que
// torna seguro interpolar esses nomes direto no SQL: eles só podem vir do próprio
// information_schema, nunca de req.url/req.body).
const fullSrc = `${columnsSrc}\n${emailAnalysisSrc}\n${bridgeSrc}\n${auditSrc}`;
for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'DROP ', 'TRUNCATE', 'ALTER TABLE']) {
  assert.doesNotMatch(fullSrc, new RegExp(forbidden, 'i'), `legacyTableAudit() nunca pode conter "${forbidden}" - é somente leitura`);
}
assert.match(auditSrc, /payload\?\.admin \|\| isAdminEmail\(adminEmail\)/, 'auditoria de tabelas legadas deve exigir admin real');
assert.match(auditSrc, /req\.method !== 'GET'/, 'auditoria de tabelas legadas deve ser GET (sem corpo, sem efeito colateral)');
for (const forbidden of ['req.body', 'req.url', 'url.searchParams', 'req.query', 'req.params']) {
  assert.doesNotMatch(fullSrc, new RegExp(forbidden.replace('.', '\\.'), 'i'), `nome de tabela/coluna nunca pode vir de "${forbidden}" - todo identificador interpolado deve vir do information_schema`);
}
assert.doesNotMatch(fullSrc, /SELECT\s+\*/i, 'auditoria de tabelas legadas nunca pode fazer SELECT * (linhas individuais)');
// A ponte user_id -> crewcheck_users.id só pode expor contagens/EXISTS - nunca uma
// coluna individual (id, email, user_id) diretamente no SELECT.
assert.doesNotMatch(bridgeSrc, /SELECT\s+(?!COUNT|1\b)/i, 'legacyRosterBridgeAudit() só pode fazer SELECT COUNT(...) ou SELECT 1 (dentro de EXISTS) - nunca uma coluna individual');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-legacy-table-audit-'));
const tempFile = path.join(tempDir, 'legacy-table-audit.mjs');
try {
  const harness = `
${identityAuditKnownTablesSrc}
${cutoverSrc}
${emailPatternSrc}
${datePatternSrc}
${sensitivePatternSrc}
${textTypesSrc}
${dateTypesSrc}
${columnsSrc}
${emailAnalysisSrc}
${bridgeEmailPatternSrc}
${bridgeSrc}
${auditSrc}

let jwtPayload = null;
function verifyJwt() { if (jwtPayload === 'throw') throw Object.assign(new Error('Sessão expirada.'), { status: 401 }); return jwtPayload; }
function requestToken() { return 'token-fake'; }
function safeEmail(value) { return String(value || '').trim().toLowerCase(); }
let adminEmails = [];
function isAdminEmail(email) { return adminEmails.includes(email); }
function sendJson(res, status, payload) { res.__captured = { status, payload }; }

export function setJwtPayload(value) { jwtPayload = value; }
export function setAdminEmails(list) { adminEmails = list; }
export { legacyTableAudit };

export function makeDb({ allTables = [], byTable = {}, rosterBridge = {} } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('information_schema.tables') && sql.includes('TABLE_SCHEMA=DATABASE()') && !sql.includes('TABLE_NAME=')) {
        return [allTables.map((name) => ({ name }))];
      }
      if (sql.includes('information_schema.columns')) {
        const table = params[0];
        return [(byTable[table]?.columns || []).map((c) => ({ name: c.name, dataType: c.dataType, isNullable: c.nullable ? 'YES' : 'NO', columnKey: c.key || null }))];
      }
      if (sql.includes('matchingRosters')) {
        return [[{ matchingRosters: rosterBridge.matchingRosters ?? 0, distinctUsersWithRoster: rosterBridge.distinctUsersWithRoster ?? 0 }]];
      }
      if (sql.includes('orphanedRosters')) {
        return [[{ orphanedRosters: rosterBridge.orphanedRosters ?? 0 }]];
      }
      if (sql.includes('normalizableEmailCount')) {
        return [[{ normalizableEmailCount: rosterBridge.normalizableEmailCount ?? 0 }]];
      }
      if (sql.includes('JOIN crewcheck_rosters r ON r.user_id=u.id')) {
        return [[{ count: rosterBridge.notMatchingWithRosterCount ?? 0 }]];
      }
      if (sql.includes('matchingCount')) {
        return [[{ matchingCount: rosterBridge.matchingCount ?? 0 }]];
      }
      if (sql.includes('notMatchingCount')) {
        return [[{ notMatchingCount: rosterBridge.notMatchingCount ?? 0 }]];
      }
      const fromMatch = sql.match(/FROM \\\`([^\\\`]+)\\\`/);
      const table = fromMatch ? fromMatch[1] : null;
      const config = byTable[table] || {};
      if (sql.includes('COUNT(*) AS totalRows FROM')) {
        return [[{ totalRows: config.totalRows ?? 0 }]];
      }
      if (sql.includes('nonNormalizedCount')) {
        const colMatch = sql.match(/COUNT\\(DISTINCT \\\`([^\\\`]+)\\\`\\)/);
        const stats = config.emailStats?.[colMatch?.[1]] || {};
        return [[{ totalRows: stats.totalRows ?? 0, distinctValues: stats.distinctValues ?? 0, nonNormalizedCount: stats.nonNormalizedCount ?? 0 }]];
      }
      if (sql.includes('matchingCurrentIdentity')) {
        const colMatch = sql.match(/t\\.\\\`([^\\\`]+)\\\`/);
        const stats = config.emailStats?.[colMatch?.[1]] || {};
        return [[{ matchingCurrentIdentity: stats.matchingCurrentIdentity ?? 0 }]];
      }
      if (sql.includes('orphanedFromCurrentIdentity')) {
        const colMatch = sql.match(/t\\.\\\`([^\\\`]+)\\\`/);
        const stats = config.emailStats?.[colMatch?.[1]] || {};
        return [[{ orphanedFromCurrentIdentity: stats.orphanedFromCurrentIdentity ?? 0 }]];
      }
      if (sql.includes('MIN(\\\`')) {
        return [[{ minCreatedAt: config.dateRange?.minCreatedAt ?? null, maxCreatedAt: config.dateRange?.maxCreatedAt ?? null, beforeCutover: config.dateRange?.beforeCutover ?? 0 }]];
      }
      throw new Error('Unexpected query in test harness: ' + sql);
    },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  async function callAudit(db) {
    const req = { method: 'GET' };
    const res = {};
    await mod.legacyTableAudit(req, res, db);
    return res.__captured;
  }

  // A) Não-admin: 403, nenhuma query disparada.
  {
    mod.setJwtPayload({ email: 'tripulante-comum@example.com', admin: false });
    mod.setAdminEmails([]);
    const db = mod.makeDb({});
    const result = await callAudit(db);
    assert.equal(result.status, 403, 'não-admin deve receber 403');
    assert.equal(db.calls.length, 0, 'não-admin não pode disparar nenhuma query de auditoria');
  }

  mod.setJwtPayload({ email: 'admin@example.com', admin: true });
  mod.setAdminEmails(['admin@example.com']);

  // B) Execução normal: 3 tabelas inesperadas reais (mesmos nomes achados em
  // produção), uma delas sem coluna de e-mail (crewcheck_rosters, ligada por
  // user_id), verificando schema/contagens/datas/normalização/correspondência.
  {
    const db = mod.makeDb({
      allTables: ['crewcheck_platform_accounts', 'crewcheck_platform_profiles', 'auth_accounts', 'crewcheck_users', 'crewcheck_rosters'],
      byTable: {
        auth_accounts: {
          totalRows: 9,
          columns: [
            { name: 'id', dataType: 'char' },
            { name: 'email', dataType: 'varchar' },
            { name: 'password_hash', dataType: 'text' },
            { name: 'created_at', dataType: 'timestamp' },
          ],
          dateRange: { minCreatedAt: '2026-06-21T20:00:00Z', maxCreatedAt: '2026-07-09T10:00:00Z', beforeCutover: 9 },
          emailStats: { email: { totalRows: 9, distinctValues: 9, nonNormalizedCount: 2, matchingCurrentIdentity: 1, orphanedFromCurrentIdentity: 8 } },
        },
        crewcheck_users: {
          totalRows: 40,
          columns: [
            { name: 'id', dataType: 'char' },
            { name: 'email', dataType: 'varchar' },
            { name: 'password_hash', dataType: 'text' },
            { name: 'created_at', dataType: 'timestamp' },
          ],
          dateRange: { minCreatedAt: '2026-06-21T15:49:00Z', maxCreatedAt: '2026-07-10T02:24:00Z', beforeCutover: 40 },
          emailStats: { email: { totalRows: 40, distinctValues: 38, nonNormalizedCount: 5, matchingCurrentIdentity: 3, orphanedFromCurrentIdentity: 35 } },
        },
        crewcheck_rosters: {
          totalRows: 120,
          columns: [
            { name: 'id', dataType: 'char' },
            { name: 'user_id', dataType: 'char' },
            { name: 'roster_json', dataType: 'json' },
            { name: 'created_at', dataType: 'timestamp' },
          ],
          dateRange: { minCreatedAt: '2026-06-21T15:49:00Z', maxCreatedAt: '2026-07-10T02:24:00Z', beforeCutover: 120 },
        },
      },
      rosterBridge: {
        matchingRosters: 110,
        distinctUsersWithRoster: 33,
        orphanedRosters: 10,
        normalizableEmailCount: 39,
        matchingCount: 3,
        notMatchingCount: 36,
        notMatchingWithRosterCount: 29,
      },
    });
    const result = await callAudit(db);
    assert.equal(result.status, 200);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.tables.length, 3, 'apenas as 3 tabelas inesperadas devem aparecer, nunca as tabelas conhecidas');
    assert.ok(!result.payload.tables.some((t) => t.table.startsWith('crewcheck_platform_')), 'tabelas conhecidas não podem aparecer como inesperadas');

    const authAccounts = result.payload.tables.find((t) => t.table === 'auth_accounts');
    assert.equal(authAccounts.totalRows, 9);
    assert.deepEqual(authAccounts.sensitiveColumnNames, ['password_hash'], 'nome da coluna sensível deve ser reportado, nunca seu valor');
    assert.equal(authAccounts.dateRange.beforeCutover, 9, 'todas as 9 linhas são anteriores ao cutover de 2026-07-15');
    assert.equal(authAccounts.emailAnalysis[0].column, 'email');
    assert.equal(authAccounts.emailAnalysis[0].orphanedFromCurrentIdentity, 8, 'linhas órfãs são o sinal mais forte de identidade encalhada no mesmo banco');

    const rosters = result.payload.tables.find((t) => t.table === 'crewcheck_rosters');
    assert.equal(rosters.emailAnalysis.length, 0, 'crewcheck_rosters não tem coluna de e-mail (liga por user_id) - análise de e-mail deve ficar vazia, não quebrar');
    assert.equal(rosters.totalRows, 120);

    // rosterBridge: crewcheck_rosters liga por user_id (UUID), não por e-mail - a
    // reconexão automática das tabelas owner_email não vale aqui. Isso mede
    // especificamente essa ponte, sempre em contagens agregadas.
    const { rosterBridge } = result.payload;
    assert.equal(rosterBridge.available, true);
    assert.equal(rosterBridge.totalLegacyUsers, 40);
    assert.equal(rosterBridge.totalLegacyRosters, 120);
    assert.equal(rosterBridge.distinctLegacyUsersWithRoster, 33);
    assert.equal(rosterBridge.rostersMatchingLegacyUser, 110);
    assert.equal(rosterBridge.rostersWithoutLegacyUser, 10, 'rosters cujo user_id não bate com nenhum crewcheck_users - órfãs mesmo dentro da camada legada');
    assert.equal(rosterBridge.legacyUsersWithNormalizableEmail, 39);
    assert.equal(rosterBridge.legacyUsersMatchingCurrentIdentity, 3);
    assert.equal(rosterBridge.legacyUsersNotMatchingCurrentIdentity, 36);
    assert.equal(rosterBridge.legacyUsersNotMatchingCurrentIdentityWithRoster, 29, 'usuários legados fora da identidade atual mas com roster - candidatos fortes a recuperação dentro do próprio banco');
    assert.deepEqual(rosterBridge.rosterDateRange, rosters.dateRange, 'rosterDateRange deve reaproveitar o dateRange já calculado para crewcheck_rosters, não reconsultar');

    const payloadStr = JSON.stringify(result.payload);
    assert.equal(payloadStr.includes('@example.com'), false, 'resposta nunca pode conter um e-mail individual');
    assert.equal(/[0-9a-f]{64,}/i.test(payloadStr), false, 'resposta nunca pode conter algo com formato de hash/token longo');
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(payloadStr), false, 'resposta nunca pode conter um UUID individual');
  }

  // C) crewcheck_users ausente (ex.: schema diferente do esperado): rosterBridge
  // deve reportar indisponibilidade com motivo, nunca quebrar a resposta inteira.
  {
    const db = mod.makeDb({
      allTables: ['crewcheck_platform_accounts', 'crewcheck_platform_profiles', 'crewcheck_rosters'],
      byTable: {
        crewcheck_rosters: {
          totalRows: 5,
          columns: [{ name: 'id', dataType: 'char' }, { name: 'user_id', dataType: 'char' }],
        },
      },
    });
    const result = await callAudit(db);
    assert.equal(result.status, 200);
    assert.equal(result.payload.rosterBridge.available, false);
    assert.ok(result.payload.rosterBridge.reason, 'indisponibilidade da ponte deve vir com um motivo legível');
  }

  console.log('[p0-legacy-table-audit] OK — auditoria de tabelas legadas admin-only, somente leitura, sem interpolar identificadores vindos da requisição, sem vazar e-mail/UUID/hash individual, incluindo a ponte crewcheck_rosters.user_id -> crewcheck_users.id.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
