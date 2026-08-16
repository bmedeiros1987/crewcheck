import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #399 recovery prep: production confirmed 29 legacy users, 27 without a matching
// current identity, 17 of those with real legacy roster data (60/60 rosters resolve
// to a valid legacy user - see docs/399_legacy_roster_recovery_plan.md). Before any
// migration/bridging code is written, this is the read-only, admin-only, per-e-mail
// drill-down a human needs to decide whether ONE specific account is recoverable. It
// must never leak password_hash, salt, a legacy UUID, raw roster content, or data
// belonging to any e-mail other than the one requested - and must never authenticate
// or create anything, since this is pure read-only diagnosis.

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  // "function NAME(" is a substring of "async function NAME(" too, so this one
  // marker locates both plain and async functions without needing two extractors -
  // but the slice must still start at "async " (not just "function") or an
  // extracted async function's internal await calls become a syntax error.
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() não encontrada em server/v139/auth.mjs`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
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

const collationReportColumnsSrc = extractConst('LEGACY_COLLATION_REPORT_COLUMNS');
const defaultCollationSrc = extractConst('LEGACY_DEFAULT_COLLATION');
const collationReportFnSrc = extractFunction('legacyColumnCollationReport');
const resolveCollationSrc = extractFunction('resolveCommonCollation');
const collateEqSrc = extractFunction('collateEq');
const errorCodeSrc = extractFunction('legacyAuditErrorCode');
const candidateSrc = extractFunction('legacyRecoveryCandidate');

// Guards estáticos: somente leitura, sempre admin, POST com corpo pequeno, nunca
// escreve/apaga/altera nada, e nunca ecoa senha/hash/salt/UUID/roster.
for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'DROP ', 'TRUNCATE', 'ALTER TABLE']) {
  assert.doesNotMatch(candidateSrc, new RegExp(forbidden, 'i'), `legacyRecoveryCandidate() nunca pode conter "${forbidden}" - é somente leitura`);
}
assert.match(candidateSrc, /payload\?\.admin \|\| isAdminEmail\(adminEmail\)/, 'diagnóstico de candidato deve exigir admin real');
assert.match(candidateSrc, /req\.method !== 'POST'/, 'diagnóstico de candidato deve ser POST (e-mail vem no corpo)');
for (const forbidden of ['password_hash', 'password_salt', 'roster_json', 'roster:', 'u.id,', 'r.id,']) {
  assert.doesNotMatch(candidateSrc, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `resposta nunca pode referenciar "${forbidden}"`);
}
assert.doesNotMatch(candidateSrc, /SELECT\s+(?!COUNT|MIN|MAX|TABLE_NAME|COLUMN_NAME|email\s+FROM)/i, 'consultas devem retornar apenas agregados, metadado de schema, ou a própria coluna email para checagem de existência - nunca id/UUID/roster');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-legacy-recovery-candidate-'));
const tempFile = path.join(tempDir, 'legacy-recovery-candidate.mjs');
try {
  const harness = `
${collationReportColumnsSrc}
${defaultCollationSrc}
${collationReportFnSrc}
${resolveCollationSrc}
${collateEqSrc}
${errorCodeSrc}
${candidateSrc}

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
export { legacyRecoveryCandidate };

function collationMismatchError() {
  return Object.assign(new Error('Illegal mix of collations'), { code: 'ER_CANT_AGGREGATE_2COLLATIONS' });
}

export function makeDb({
  legacySchemaReady = true,
  collations = {},
  variantCount = 0,
  rosterStats = { total: 0, minCreatedAt: null, maxCreatedAt: null },
  currentAccountExists = false,
  currentProfileExists = false,
  currentRosterCount = 0,
  throwOn = null,
} = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (throwOn && sql.includes(throwOn)) throw collationMismatchError();
      if (sql.includes("TABLE_NAME='crewcheck_users'")) {
        if (!legacySchemaReady) return [[]];
        return [[
          { tbl: 'crewcheck_users', col: 'id' },
          { tbl: 'crewcheck_users', col: 'email' },
          { tbl: 'crewcheck_rosters', col: 'user_id' },
          { tbl: 'crewcheck_rosters', col: 'created_at' },
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
      if (sql.includes('MIN(r.created_at)')) {
        return [[{ total: rosterStats.total, minCreatedAt: rosterStats.minCreatedAt, maxCreatedAt: rosterStats.maxCreatedAt }]];
      }
      if (sql.includes('FROM crewcheck_platform_accounts WHERE email=?')) {
        return [currentAccountExists ? [{ email: params[0] }] : []];
      }
      if (sql.includes('FROM crewcheck_platform_profiles WHERE email=?')) {
        return [currentProfileExists ? [{ email: params[0] }] : []];
      }
      if (sql.includes('FROM crewcheck_platform_rosters WHERE owner_email=?')) {
        return [[{ total: currentRosterCount }]];
      }
      throw new Error('Unexpected query in test harness: ' + sql);
    },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  function makeReq(email) {
    return { method: 'POST', __body: { email } };
  }
  async function callCandidate(db, email) {
    const req = makeReq(email);
    const res = {};
    await mod.legacyRecoveryCandidate(req, res, db);
    return res.__captured;
  }

  const target = 'tripulante-legado@example.com';
  const collations = {
    'crewcheck_users.id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_users.email': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_rosters.user_id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_platform_accounts.email': { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
    'crewcheck_platform_profiles.email': { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
  };

  // A) Não-admin: 403, nenhuma query.
  {
    mod.setJwtPayload({ email: 'tripulante-comum@example.com', admin: false });
    mod.setAdminEmails([]);
    const db = mod.makeDb({});
    const result = await callCandidate(db, target);
    assert.equal(result.status, 403, 'não-admin deve receber 403');
    assert.equal(db.calls.length, 0, 'não-admin não pode disparar nenhuma query');
  }

  mod.setJwtPayload({ email: 'admin@example.com', admin: true });
  mod.setAdminEmails(['admin@example.com']);

  // B) E-mail vazio/inválido: 400.
  {
    const db = mod.makeDb({});
    const result = await callCandidate(db, '');
    assert.equal(result.status, 400);
  }

  // C) Caso real de produção: usuário legado existe, sem identidade atual, com
  // rosters legados - deve virar recoveryCandidate:true.
  {
    const db = mod.makeDb({
      collations,
      variantCount: 1,
      rosterStats: { total: 3, minCreatedAt: '2026-06-01T10:00:00Z', maxCreatedAt: '2026-07-04T09:00:00Z' },
      currentAccountExists: false,
      currentProfileExists: false,
      currentRosterCount: 0,
    });
    const result = await callCandidate(db, target);
    assert.equal(result.status, 200);
    assert.equal(Object.hasOwn(result.payload, 'email'), false, 'o caller já sabe qual e-mail enviou - a resposta não deve ecoá-lo de volta (minimização de dados)');
    assert.equal(result.payload.legacyUserExists, true);
    assert.equal(result.payload.currentIdentityExists, false);
    assert.equal(result.payload.legacyRosterCount, 3);
    assert.equal(result.payload.legacyRosterMinCreatedAt, '2026-06-01T10:00:00Z');
    assert.equal(result.payload.legacyRosterMaxCreatedAt, '2026-07-04T09:00:00Z');
    assert.equal(result.payload.currentRosterCount, 0);
    assert.equal(result.payload.recoveryCandidate, true, 'usuário legado com roster e sem identidade atual é exatamente o caso das 17 contas encontradas em produção');
    assert.equal(result.payload.conflict, null);
  }

  // D) Usuário legado já tem identidade atual (os 2 já reconectados) - ainda pode
  // ser candidato a IMPORTAR roster (não a criar conta), então recoveryCandidate
  // continua true se houver roster legado sem roster atual correspondente.
  {
    const db = mod.makeDb({
      collations,
      variantCount: 1,
      rosterStats: { total: 2, minCreatedAt: '2026-06-10T00:00:00Z', maxCreatedAt: '2026-06-20T00:00:00Z' },
      currentAccountExists: true,
      currentProfileExists: true,
      currentRosterCount: 0,
    });
    const result = await callCandidate(db, target);
    assert.equal(result.payload.currentIdentityExists, true);
    assert.equal(result.payload.recoveryCandidate, true);
  }

  // E) Sem usuário legado: nada a recuperar.
  {
    const db = mod.makeDb({ collations, variantCount: 0 });
    const result = await callCandidate(db, target);
    assert.equal(result.payload.legacyUserExists, false);
    assert.equal(result.payload.legacyRosterCount, 0);
    assert.equal(result.payload.recoveryCandidate, false);
  }

  // F) Usuário legado existe mas sem nenhum roster - não vale a pena recuperar.
  {
    const db = mod.makeDb({ collations, variantCount: 1, rosterStats: { total: 0, minCreatedAt: null, maxCreatedAt: null } });
    const result = await callCandidate(db, target);
    assert.equal(result.payload.legacyUserExists, true);
    assert.equal(result.payload.legacyRosterCount, 0);
    assert.equal(result.payload.recoveryCandidate, false, 'sem roster legado não há o que recuperar, mesmo com o usuário existindo');
  }

  // G) Duplicidade: mais de uma linha legada normaliza para o mesmo e-mail -
  // conflito deve ser sinalizado e recoveryCandidate deve ficar false até revisão
  // humana, mesmo havendo roster.
  {
    const db = mod.makeDb({
      collations,
      variantCount: 2,
      rosterStats: { total: 5, minCreatedAt: '2026-06-01T00:00:00Z', maxCreatedAt: '2026-06-30T00:00:00Z' },
    });
    const result = await callCandidate(db, target);
    assert.equal(result.payload.legacyUserExists, true);
    assert.deepEqual(result.payload.conflict, { type: 'duplicate_legacy_user', count: 2 });
    assert.equal(result.payload.recoveryCandidate, false, 'ambiguidade não pode virar candidato automático - precisa de revisão humana');
  }

  // H) Schema legado ausente/diferente do esperado: resposta vazia e sinalizada,
  // nunca uma exceção.
  {
    const db = mod.makeDb({ legacySchemaReady: false });
    const result = await callCandidate(db, target);
    assert.equal(result.status, 200);
    assert.equal(result.payload.legacyUserExists, false);
    assert.ok(result.payload.message);
  }

  // I) Erro de collation (ou qualquer outra falha de query) durante o diagnóstico:
  // deve degradar para uma resposta sanitizada 200, nunca 500 nem stack trace.
  {
    const db = mod.makeDb({ collations, throwOn: 'variantCount' });
    const result = await callCandidate(db, target);
    assert.equal(result.status, 200, 'uma falha de query nunca pode virar 500');
    assert.equal(result.payload.error, 'COLLATION_MISMATCH');
    const payloadStr = JSON.stringify(result.payload);
    assert.doesNotMatch(payloadStr, /at Object\.query|node_modules|\.mjs:\d+/, 'erro sanitizado não pode vazar stack trace');
  }

  // J) Nunca vaza dado de outra pessoa, UUID/hash, nem o próprio e-mail consultado
  // (minimização: o caller já sabe qual e-mail enviou), em nenhum cenário acima -
  // inclusive nos caminhos de schema ausente (H) e erro de query (I).
  {
    const db = mod.makeDb({ collations, variantCount: 1, rosterStats: { total: 1, minCreatedAt: '2026-06-01T00:00:00Z', maxCreatedAt: '2026-06-01T00:00:00Z' } });
    const result = await callCandidate(db, target);
    assert.equal(Object.hasOwn(result.payload, 'email'), false);
    const payloadStr = JSON.stringify(result.payload);
    assert.equal(payloadStr.includes('outra-pessoa@'), false);
    assert.equal(payloadStr.includes(target), false, 'e-mail consultado não pode aparecer em nenhum campo da resposta');
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(payloadStr), false, 'nunca um UUID individual');
    assert.equal(/[0-9a-f]{40,}/i.test(payloadStr), false, 'nunca algo com formato de hash longo');

    const schemaMissing = await callCandidate(mod.makeDb({ legacySchemaReady: false }), target);
    assert.equal(Object.hasOwn(schemaMissing.payload, 'email'), false, 'resposta de schema ausente também não pode ecoar o e-mail');

    const errored = await callCandidate(mod.makeDb({ collations, throwOn: 'variantCount' }), target);
    assert.equal(Object.hasOwn(errored.payload, 'email'), false, 'resposta de erro também não pode ecoar o e-mail');
  }

  console.log('[p0-legacy-recovery-candidate] OK — diagnóstico admin-only, somente leitura, por e-mail único, com conflito/ambiguidade sinalizado, sem vazar senha/hash/UUID/roster/dado de outra pessoa, e sem derrubar a resposta em falha de query.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
