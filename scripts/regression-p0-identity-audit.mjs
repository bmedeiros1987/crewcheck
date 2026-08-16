import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

// #399 identity-loss investigation (produção: múltiplas contas antigas retornam
// state: "no_identity" via /api/auth/admin/diagnose-credential). Git archaeology
// found the root cause without touching production: commit 9cf5fad2 ("Convert
// CrewCheck platform exclusively to Aiven MySQL", 2026-07-15 01:27) repointed
// DATABASE_URL from PostgreSQL/Supabase to Aiven MySQL and shipped a "clean install"
// schema (migrations/20260715_003_aiven_mysql_full_platform.sql) - no export/import
// step exists anywhere in this repository's history. Every owner_email/email-scoped
// table (rosters, subscriptions, usage, stays, preferences, addresses) uses a plain
// VARCHAR, never a foreign key to a profile/account ID, so recreating an identity
// with the same normalized e-mail reconnects any surviving MySQL-side data
// automatically - the only data this cannot reach is whatever may still exist in the
// retired Supabase project, which this codebase no longer connects to at all.
//
// identityAudit() is the read-only, admin-only, sanitized diagnostic this finding
// calls for: aggregate counts only, no individual e-mail or PII, never a write.

function extract(name) {
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
  const bracketOpen = source.indexOf('[', start);
  let depth = 0;
  for (let i = bracketOpen; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        const semicolon = source.indexOf(';', i);
        return source.slice(start, semicolon + 1);
      }
    }
  }
  throw new Error(`${name} nunca fecha`);
}

const identityAuditTablesSrc = extractConst('IDENTITY_AUDIT_TABLES');
const identityAuditKnownTablesSrc = extractConst('IDENTITY_AUDIT_KNOWN_TABLES');
const identityAuditSrc = extract('identityAudit');
const dateRangeSrc = extract('dateRangeAndMonthlyDistribution');

// Guards estáticos: somente leitura, somente agregados, sempre admin.
for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'DROP ', 'TRUNCATE', 'ALTER TABLE']) {
  assert.doesNotMatch(identityAuditSrc, new RegExp(forbidden, 'i'), `identityAudit() nunca pode conter "${forbidden}" - é somente leitura`);
}
assert.match(identityAuditSrc, /payload\?\.admin \|\| isAdminEmail\(adminEmail\)/, 'auditoria de identidade deve exigir admin real');
assert.match(identityAuditSrc, /req\.method !== 'GET'/, 'auditoria de identidade deve ser GET (sem corpo, sem efeito colateral)');
// Nunca selecionar e-mails individuais das tabelas de ownership - só contagens.
assert.doesNotMatch(identityAuditSrc, /SELECT\s+(?!COUNT|MIN|MAX|TABLE_NAME)/i, 'consultas de auditoria devem retornar apenas agregados (COUNT/MIN/MAX) ou nomes de tabela, nunca linhas individuais com e-mail/dado pessoal');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-identity-audit-'));
const tempFile = path.join(tempDir, 'identity-audit.mjs');
try {
  const harness = `
${identityAuditTablesSrc}
${identityAuditKnownTablesSrc}
${dateRangeSrc}
${identityAuditSrc}

let jwtPayload = null;
function verifyJwt() { if (jwtPayload === 'throw') throw Object.assign(new Error('Sessão expirada.'), { status: 401 }); return jwtPayload; }
function requestToken() { return 'token-fake'; }
function safeEmail(value) { return String(value || '').trim().toLowerCase(); }
let adminEmails = [];
function isAdminEmail(email) { return adminEmails.includes(email); }
function sendJson(res, status, payload) { res.__captured = { status, payload }; }

export function setJwtPayload(value) { jwtPayload = value; }
export function setAdminEmails(list) { adminEmails = list; }
export { identityAudit };

export function makeDb({ knownTables = [], accountsRange = { total: 0 }, profilesRange = { total: 0 }, profilesWithoutAccount = 0, accountsWithoutProfile = 0, ownershipByTable = {} } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('MIN(created_at)') && sql.includes('crewcheck_platform_accounts')) return [[accountsRange]];
      if (sql.includes('MIN(created_at)') && sql.includes('crewcheck_platform_profiles')) return [[profilesRange]];
      if (sql.includes('DATE_FORMAT(created_at') && sql.includes('crewcheck_platform_accounts')) return [accountsRange.byMonth || []];
      if (sql.includes('DATE_FORMAT(created_at') && sql.includes('crewcheck_platform_profiles')) return [profilesRange.byMonth || []];
      if (sql.includes('crewcheck_platform_profiles p LEFT JOIN crewcheck_platform_accounts')) return [[{ count: profilesWithoutAccount }]];
      if (sql.includes('crewcheck_platform_accounts a LEFT JOIN crewcheck_platform_profiles')) return [[{ count: accountsWithoutProfile }]];
      if (sql.includes('information_schema.tables') && sql.includes('TABLE_NAME=?')) {
        return [knownTables.includes(params[0]) ? [{ name: params[0] }] : []];
      }
      if (sql.includes('information_schema.tables')) {
        return [knownTables.map((name) => ({ name }))];
      }
      const tableMatch = sql.match(/FROM (crewcheck_\\w+) t/);
      if (sql.includes('orphanedOwners')) {
        const table = tableMatch ? tableMatch[1] : null;
        return [[{ orphanedOwners: ownershipByTable[table]?.orphanedOwners ?? 0 }]];
      }
      if (sql.includes('COUNT(*) AS totalRows')) {
        const table = sql.match(/FROM (crewcheck_\\w+)/)?.[1];
        return [[{ totalRows: ownershipByTable[table]?.totalRows ?? 0, distinctOwners: ownershipByTable[table]?.distinctOwners ?? 0 }]];
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
    await mod.identityAudit(req, res, db);
    return res.__captured;
  }

  // A) Não-admin: 403, nenhuma query de dados disparada.
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

  // B) Execução normal: formato correto, contagens corretas, tabela desconhecida
  // sinalizada, tabela ausente marcada exists:false sem quebrar a resposta.
  {
    const knownTables = ['crewcheck_platform_accounts', 'crewcheck_platform_profiles', 'crewcheck_platform_rosters', 'crewcheck_uma_tabela_inesperada'];
    const db = mod.makeDb({
      knownTables,
      accountsRange: { total: 10, minCreatedAt: '2026-07-15T20:26:00Z', maxCreatedAt: '2026-08-15T00:00:00Z', byMonth: [{ monthKey: '2026-07', count: 4 }, { monthKey: '2026-08', count: 6 }] },
      profilesRange: { total: 25, minCreatedAt: '2026-07-15T01:27:00Z', maxCreatedAt: '2026-08-15T00:00:00Z', byMonth: [] },
      profilesWithoutAccount: 15,
      accountsWithoutProfile: 0,
      ownershipByTable: {
        crewcheck_platform_rosters: { totalRows: 40, distinctOwners: 12, orphanedOwners: 3 },
      },
    });
    const result = await callAudit(db);
    assert.equal(result.status, 200);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.accounts.total, 10);
    assert.equal(result.payload.profiles.total, 25);
    assert.equal(result.payload.profilesWithoutAccount, 15, 'perfis sem conta (identidades "no_identity" em potencial) devem ser contáveis');
    assert.equal(result.payload.accountsWithoutProfile, 0);
    const rostersEntry = result.payload.ownership.find((item) => item.table === 'crewcheck_platform_rosters');
    assert.ok(rostersEntry, 'tabela de rosters deve aparecer na auditoria de ownership');
    assert.equal(rostersEntry.exists, true);
    assert.equal(rostersEntry.totalRows, 40);
    assert.equal(rostersEntry.orphanedOwners, 3, 'linhas órfãs (sem profile/account correspondente) devem ser contáveis - são exatamente os dados reconectáveis ao recriar a identidade');
    const subscriptionsEntry = result.payload.ownership.find((item) => item.table === 'crewcheck_platform_subscriptions');
    assert.equal(subscriptionsEntry.exists, false, 'tabela ausente do banco de teste deve ser marcada exists:false, não quebrar a resposta');
    assert.ok(result.payload.unexpectedTables.includes('crewcheck_uma_tabela_inesperada'), 'tabela fora da lista conhecida deve ser sinalizada como candidata a tabela legada/incompleta');
    assert.equal(JSON.stringify(result.payload).includes('@example.com'), false, 'resposta nunca pode conter um e-mail individual, só contagens agregadas');
  }

  console.log('[p0-identity-audit] OK — auditoria de identidade admin-only, somente leitura, sanitizada, sem vazar e-mail individual.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
