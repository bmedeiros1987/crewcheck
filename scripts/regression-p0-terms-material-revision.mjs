import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #399 (Termos/Privacidade): the Version 1 seed text shipped without PT-BR accents
// and with an internal note leaked into the body every user reads ("Este texto
// deve passar por revisão jurídica..."). Fixing that exposed a real gap: ANY
// republish of crewcheck_platform_terms, however small, bumped `version` and
// forced every already-accepted user to accept again, because acceptance was
// validated against an exact content_hash match. v14.4.02 makes each publish an
// explicit `revision` within a `version`, flagged `material` (default true) -
// only a revision the admin explicitly marks material=false is treated as
// cosmetic, and only a material revision forces re-acceptance. This regression
// proves both the one-off text fix AND that the general mechanism holds for any
// future publish, material or not.

const migration = fs.readFileSync('migrations/20260816_019_terms_material_revision.sql', 'utf8').replace(/\r\n/g, '\n');
const source = fs.readFileSync('server/platform.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() não encontrada em server/platform.mjs`);
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
  assert.ok(start >= 0, `${name} não encontrada em server/platform.mjs`);
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
        if (depth === 0) { end = source.indexOf(';', i) + 1; break; }
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

// ============================================================================
// Guards estáticos
// ============================================================================

// --- Migration: texto corrigido, sem a nota interna, schema aditivo correto. ---
const bodyLineMatch = migration.match(/SET @crewcheck_terms_body_v1r2 = '([\s\S]*?)';/);
assert.ok(bodyLineMatch, 'migration deve definir @crewcheck_terms_body_v1r2');
const seededBody = bodyLineMatch[1];
assert.doesNotMatch(seededBody, /revis[aã]o jur[ií]dica/i, 'o texto semeado NUNCA pode conter a nota interna de revisão jurídica - é exatamente o vazamento que este patch corrige');
for (const accented of ['é uma ferramenta', 'não substitui', 'decisões operacionais', 'orientações médicas', 'análise jurídica', 'é responsável', 'segurança e transparência', 'não devem ser armazenados', 'exportação, correção e exclusão', 'É proibido enviar conteúdo', 'exploração sexual infantil', 'sem autorização', 'legislação aplicável', 'Integrações externas', 'autorização dos respectivos', 'tratamentos necessários', 'revogar permissões', 'usuário confirma que leu esta versão', 'alteração material exigirá']) {
  assert.ok(seededBody.includes(accented), `texto corrigido deve conter "${accented}" com acentuação correta`);
}
assert.doesNotMatch(seededBody, /\bnao\b|\bversao\b|\busuario\b|\be\suma\b/, 'o texto semeado (não os comentários da migration) não pode conter formas comuns sem acentuação');
assert.match(migration, /DROP INDEX version/, 'a UNIQUE antiga em version sozinha precisa sair para caber mais de uma revisão por versão');
assert.match(migration, /ADD COLUMN revision INT NOT NULL DEFAULT 1/);
assert.match(migration, /ADD COLUMN material TINYINT\(1\) NOT NULL DEFAULT 1/, 'material deve ser fail-closed (default 1/true) para linhas existentes e futuras sem valor explícito');
assert.match(migration, /ADD UNIQUE KEY crewcheck_terms_version_revision_uq \(version, revision\)/);
assert.match(migration, /VALUES \(\s*'terms-1-2-cosmetic-accent-fix', 1, 2,/s, 'o texto corrigido deve ser publicado como version=1, revision=2 - Versão 1 continua Versão 1');
assert.match(migration, /@crewcheck_terms_body_v1r2, SHA2\(@crewcheck_terms_body_v1r2, 256\), 0, 'published'/, 'a correção deve ser material=0 (cosmética)');

// --- platform.mjs: mecanismo geral, não só o fix pontual. -----------------------
const requiredAcceptanceRevisionSrc = extractFunction('requiredAcceptanceRevision');
const currentTermsSrc = extractFunction('currentTerms');
const handleTermsCurrentSrc = extractFunction('handleTermsCurrent');
const handleTermsAcceptSrc = extractFunction('handleTermsAccept');
const handleAdminTermsSrc = extractFunction('handleAdminTerms');

assert.doesNotMatch(
  handleTermsCurrentSrc,
  /content_hash=\$3/,
  'handleTermsCurrent() não pode mais decidir "já aceitou" comparando content_hash exato - isso reintroduziria a invalidação em massa por mudança cosmética',
);
assert.ok(handleTermsCurrentSrc.includes('requiredAcceptanceRevision(db, terms.version, terms.revision)'), 'handleTermsCurrent() deve computar a revisão mínima exigida antes de decidir accepted');
assert.ok(handleTermsCurrentSrc.includes('acceptedRevision >= required'), 'aceite deve ser válido a partir da revisão exigida, não apenas na revisão exata');

assert.ok(requiredAcceptanceRevisionSrc.includes('AND material=1'), 'a revisão exigida só pode considerar publicações material=1 - cosméticas nunca elevam o que é exigido');
assert.ok(currentTermsSrc.includes('ORDER BY version DESC, revision DESC'), 'a linha "atual" é a revisão mais recente da versão mais recente, não só a versão mais recente');

assert.ok(handleAdminTermsSrc.includes('const material = body.material !== false;'), 'material deve ser fail-closed: só é cosmética se o admin marcar explicitamente material:false');
assert.ok(
  handleAdminTermsSrc.includes('const version = published ? (material ? Number(published.version) + 1 : Number(published.version)) : 1;'),
  'só uma publicação material pode incrementar version - cosmética mantém a mesma version',
);
assert.ok(
  handleAdminTermsSrc.includes('const revision = published ? (material ? 1 : Number(published.revision) + 1) : 1;'),
  'cosmética incrementa revision dentro da mesma version; material reinicia revision em 1',
);

// ============================================================================
// Harness dinâmico: executa o código materializado REAL de currentTerms(),
// requiredAcceptanceRevision(), handleTermsCurrent(), handleTermsAccept() e
// handleAdminTerms() contra um mock de "banco" no mesmo formato $1/{rows} usado
// em todo o platform.mjs (via mysqlAdapter). Dependências externas ao terms
// (ensureProfile, pool) recebem stand-ins fiéis o bastante para o que este teste
// precisa provar, seguindo a mesma convenção do resto da suíte.
// ============================================================================

const envSrc = extractFunction('env');
const sendJsonSrc = extractFunction('sendJson');
const safeEmailSrc = extractFunction('safeEmail');
const normalizeTextSrc = extractFunction('normalizeText');
const verifyJwtSrc = extractFunction('verifyJwt');
const requestTokenSrc = extractFunction('requestToken');
const mainIdentitySrc = extractFunction('mainIdentity');
const normalizeLocaleSrc = extractFunction('normalizeLocale');
const normalizeTimezoneSrc = extractFunction('normalizeTimezone');
const platformTableReadySrc = extractFunction('platformTableReady');
const requirePlatformTableSrc = extractFunction('requirePlatformTable');
const requireMainSrc = extractFunction('requireMain');
const requestAuditHashSrc = extractFunction('requestAuditHash');
const publicTermsSrc = extractFunction('publicTerms');
const platformCoreTablesSrc = extractConst('PLATFORM_CORE_TABLES');
const platformOptionalTablesSrc = extractConst('PLATFORM_OPTIONAL_TABLES');
const defaultTimezoneMatch = source.match(/const DEFAULT_TIMEZONE = '[^']*';/);
assert.ok(defaultTimezoneMatch, 'DEFAULT_TIMEZONE não encontrada');
const defaultTimezoneSrc = defaultTimezoneMatch[0];
const supportedLocalesSrc = extractConst('SUPPORTED_LOCALES');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-terms-material-revision-'));
const tempFile = path.join(tempDir, 'terms-material-revision.mjs');
try {
  const harness = `
import crypto from 'node:crypto';

${defaultTimezoneSrc}
${supportedLocalesSrc}
${platformCoreTablesSrc}
${platformOptionalTablesSrc}
const state = { schemaReport: null };
${envSrc}
${sendJsonSrc}
${safeEmailSrc}
${normalizeTextSrc}
${verifyJwtSrc}
${requestTokenSrc}
${normalizeLocaleSrc}
${normalizeTimezoneSrc}
${mainIdentitySrc}
async function readBody(req) { return req.__body || {}; }
${platformTableReadySrc}
${requirePlatformTableSrc}
${requestAuditHashSrc}
${publicTermsSrc}
${currentTermsSrc}
${requiredAcceptanceRevisionSrc}
${handleTermsCurrentSrc}
${handleTermsAcceptSrc}
${handleAdminTermsSrc}

export { handleTermsCurrent, handleTermsAccept, handleAdminTerms, currentTerms, requiredAcceptanceRevision };

// requireMain() calls pool() and ensureProfile() - neither is under test here.
// ensureProfile() is a faithful-enough stand-in (terms handlers only ever read
// context.identity/context.db, never context.profile); pool() is shadowed per
// call via setDb() so each scenario gets an isolated, fresh mock database.
let currentDb = null;
export function setDb(db) { currentDb = db; }
async function pool() { return currentDb; }
async function ensureProfile(db, identity) { return { email: identity.email, public_id: 'pub_test' }; }
${requireMainSrc}

export function makeDb({ seedTerms = [], seedAcceptances = [] } = {}) {
  const state = {
    terms: seedTerms.map((t) => ({ ...t })),
    acceptances: seedAcceptances.map((a) => ({ ...a })),
  };
  const calls = [];

  function runQuery(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('information_schema.tables')) {
      return { rows: [{ relation: params[0] }] };
    }
    if (sql.includes("FROM crewcheck_platform_terms WHERE status='published' ORDER BY version DESC, revision DESC LIMIT 1")) {
      const rows = state.terms.filter((t) => t.status === 'published').sort((a, b) => b.version - a.version || b.revision - a.revision);
      return { rows: rows.slice(0, 1) };
    }
    if (sql.includes('COALESCE(MAX(revision),1) AS required')) {
      const [version, revision] = params;
      const candidates = state.terms.filter((t) => t.version === version && t.revision <= revision && Number(t.material) === 1);
      const required = candidates.length ? Math.max(...candidates.map((t) => t.revision)) : 1;
      return { rows: [{ required }] };
    }
    if (sql.includes('SELECT MAX(t.revision) AS revision FROM crewcheck_platform_terms_acceptances')) {
      const [email, version] = params;
      const revisions = state.acceptances
        .filter((a) => a.email === email)
        .map((a) => state.terms.find((t) => t.id === a.terms_id))
        .filter((t) => t && t.version === version)
        .map((t) => t.revision);
      return { rows: [{ revision: revisions.length ? Math.max(...revisions) : null }] };
    }
    if (sql.includes('INSERT INTO crewcheck_platform_terms_acceptances')) {
      const [email, termsId, termsVersion, contentHash, ipHash, userAgentHash] = params;
      const idx = state.acceptances.findIndex((a) => a.email === email && a.terms_id === termsId);
      const row = { email, terms_id: termsId, terms_version: termsVersion, content_hash: contentHash, accepted_at: new Date(), ip_hash: ipHash, user_agent_hash: userAgentHash };
      if (idx >= 0) state.acceptances[idx] = row; else state.acceptances.push(row);
      return { rows: [] };
    }
    if (sql.includes('SELECT id,version,revision,material,title,content_hash,status,published_at,effective_at,created_by FROM crewcheck_platform_terms')) {
      const rows = [...state.terms].sort((a, b) => b.version - a.version || b.revision - a.revision);
      return { rows };
    }
    if (sql.includes("UPDATE crewcheck_platform_terms SET status='superseded' WHERE status='published'")) {
      for (const t of state.terms) if (t.status === 'published') t.status = 'superseded';
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO crewcheck_platform_terms(id,version,revision,title,body_text,content_hash,material,status,published_at,effective_at,created_by)')) {
      const [id, version, revision, title, bodyText, contentHash, material, createdBy] = params;
      state.terms.push({ id, version, revision, title, body_text: bodyText, content_hash: contentHash, material, status: 'published', published_at: new Date(), effective_at: new Date(), created_by: createdBy });
      return { rows: [] };
    }
    throw new Error('Unexpected query in test harness: ' + sql + ' | params=' + JSON.stringify(params));
  }

  return {
    calls,
    state,
    async query(sql, params) { return runQuery(sql, params); },
    async connect() {
      return {
        async query(sql, params) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          return runQuery(sql, params);
        },
        release() {},
      };
    },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  function withIdentity(email, { admin = false } = {}) {
    process.env.CREWCHECK_AUTH_REQUIRED = 'false';
    process.env.CREWCHECK_ADMIN_EMAILS = admin ? email : 'not-this-user@example.com';
  }

  function makeReq(headers = {}, bodyObj) {
    return { method: bodyObj === undefined ? 'GET' : 'POST', headers, socket: {}, __body: bodyObj || {} };
  }
  function makeRes() {
    const res = { writeHead(status) { res.__status = status; }, end(chunk) { res.__body = JSON.parse(chunk || '{}'); } };
    return res;
  }

  const v1r1 = { id: 'terms-1-initial', version: 1, revision: 1, material: 1, title: 'Termos de Uso e Privacidade CrewCheck', body_text: 'texto original com acentuacao quebrada', content_hash: 'hash-v1r1', status: 'published', published_at: new Date(), effective_at: new Date(), created_by: 'system' };
  const v1r2 = { ...v1r1, id: 'terms-1-2-cosmetic-accent-fix', revision: 2, material: 0, status: 'published', body_text: 'texto corrigido com acentuacao correta', content_hash: 'hash-v1r2' };

  // ---------------------------------------------------------------------------
  // 1) Usuário novo (nunca aceitou nada): accepted=false, vê o texto vigente.
  // ---------------------------------------------------------------------------
  {
    const db = mod.makeDb({ seedTerms: [{ ...v1r1, status: 'superseded' }, v1r2] });
    mod.setDb(db);
    const req = makeReq({ 'x-crewcheck-email': 'novo@example.com' });
    const res = makeRes();
    withIdentity('novo@example.com');
    await mod.handleTermsCurrent(req, res);
    assert.equal(res.__status, 200);
    assert.equal(res.__body.terms.version, 1, 'Versão continua 1');
    assert.equal(res.__body.terms.body, 'texto corrigido com acentuacao correta', 'usuário novo já vê o texto corrigido');
    assert.equal(res.__body.terms.accepted, false, 'usuário que nunca aceitou nada deve precisar aceitar');
  }

  // ---------------------------------------------------------------------------
  // 2) Usuário que já aceitou a revisão 1 (antes da correção cosmética): depois
  // que a revisão 2 (cosmética) é publicada, o aceite dele continua valendo -
  // NÃO precisa aceitar de novo só porque o texto foi corrigido.
  // ---------------------------------------------------------------------------
  {
    const db = mod.makeDb({
      seedTerms: [{ ...v1r1, status: 'superseded' }, v1r2],
      seedAcceptances: [{ email: 'ja-aceitou@example.com', terms_id: 'terms-1-initial', terms_version: 1, content_hash: 'hash-v1r1', accepted_at: new Date(), ip_hash: 'ip', user_agent_hash: 'ua' }],
    });
    mod.setDb(db);
    const req = makeReq({ 'x-crewcheck-email': 'ja-aceitou@example.com' });
    const res = makeRes();
    withIdentity('ja-aceitou@example.com');
    await mod.handleTermsCurrent(req, res);
    assert.equal(res.__status, 200);
    assert.equal(res.__body.terms.accepted, true, 'aceite da revisão 1 deve continuar válido depois de uma correção cosmética (revisão 2) - não pode forçar novo aceite');
  }

  // ---------------------------------------------------------------------------
  // 3) Publicar via handleAdminTerms() sem informar `material`: default é
  // material=true (fail-closed) - incrementa version e invalida aceites antigos.
  // ---------------------------------------------------------------------------
  {
    const db = mod.makeDb({ seedTerms: [{ ...v1r1, status: 'superseded' }, v1r2] });
    mod.setDb(db);
    withIdentity('admin@example.com', { admin: true });
    const req = makeReq({ 'x-crewcheck-email': 'admin@example.com' }, {
      title: 'Termos de Uso e Privacidade CrewCheck - v2',
      body: 'x'.repeat(320) + ' cláusula genuinamente nova sobre um novo recurso do produto',
    });
    const res = makeRes();
    await mod.handleAdminTerms(req, res);
    assert.equal(res.__status, 200);
    assert.equal(res.__body.terms.version, 2, 'sem material explícito, o default deve ser tratado como material e incrementar version');
    assert.equal(db.state.terms.find((t) => t.id === res.__body.terms.id).revision, 1, 'nova version sempre reinicia revision em 1');
  }

  // ---------------------------------------------------------------------------
  // 4) Publicar com material:false: mantém a MESMA version, incrementa revision,
  // e aceites da version atual continuam válidos para quem já tinha aceitado.
  // ---------------------------------------------------------------------------
  {
    const db = mod.makeDb({
      seedTerms: [{ ...v1r1, status: 'superseded' }, v1r2],
      seedAcceptances: [{ email: 'sempre-aceita@example.com', terms_id: 'terms-1-initial', terms_version: 1, content_hash: 'hash-v1r1', accepted_at: new Date(), ip_hash: 'ip', user_agent_hash: 'ua' }],
    });
    mod.setDb(db);
    withIdentity('admin@example.com', { admin: true });
    const publishReq = makeReq({ 'x-crewcheck-email': 'admin@example.com' }, {
      title: 'Termos de Uso e Privacidade CrewCheck',
      body: 'x'.repeat(320) + ' revisão puramente cosmética, nenhuma cláusula muda de sentido',
      material: false,
    });
    const publishRes = makeRes();
    await mod.handleAdminTerms(publishReq, publishRes);
    assert.equal(publishRes.__status, 200);
    assert.equal(publishRes.__body.terms.version, 1, 'material:false NUNCA pode incrementar version');
    assert.equal(db.state.terms.find((t) => t.id === publishRes.__body.terms.id).revision, 3, 'revision deve avançar dentro da mesma version (v1r2 -> v1r3)');

    const req = makeReq({ 'x-crewcheck-email': 'sempre-aceita@example.com' });
    const res = makeRes();
    withIdentity('sempre-aceita@example.com');
    await mod.handleTermsCurrent(req, res);
    assert.equal(res.__body.terms.accepted, true, 'quem já aceitou a versão 1 continua aceito depois de MAIS uma revisão cosmética (v1r3)');
  }

  // ---------------------------------------------------------------------------
  // 5) Encadeamento completo, provando o mecanismo geral (não só o fix pontual):
  // v1r1(material) -> v1r2(cosmética) -> v2r1(material) -> v2r2(cosmética).
  // Quem só aceitou v1r1 precisa aceitar de novo assim que v2r1 (material) sai -
  // e depois disso, mais uma cosmética (v2r2) não pede um TERCEIRO aceite.
  // ---------------------------------------------------------------------------
  {
    const v2r1 = { id: 'terms-2-1', version: 2, revision: 1, material: 1, title: 'Termos v2', body_text: 'mudanca material de verdade', content_hash: 'hash-v2r1', status: 'superseded', published_at: new Date(), effective_at: new Date(), created_by: 'admin@example.com' };
    const v2r2 = { ...v2r1, id: 'terms-2-2', revision: 2, material: 0, status: 'published', body_text: 'mudanca material de verdade, so com typo corrigido', content_hash: 'hash-v2r2' };
    const db = mod.makeDb({
      seedTerms: [{ ...v1r1, status: 'superseded' }, { ...v1r2, status: 'superseded' }, v2r1, v2r2],
      seedAcceptances: [{ email: 'so-aceitou-v1r1@example.com', terms_id: 'terms-1-initial', terms_version: 1, content_hash: 'hash-v1r1', accepted_at: new Date(), ip_hash: 'ip', user_agent_hash: 'ua' }],
    });
    mod.setDb(db);
    const req = makeReq({ 'x-crewcheck-email': 'so-aceitou-v1r1@example.com' });
    const res = makeRes();
    withIdentity('so-aceitou-v1r1@example.com');
    await mod.handleTermsCurrent(req, res);
    assert.equal(res.__body.terms.version, 2);
    assert.equal(res.__body.terms.accepted, false, 'mudança material (v2r1) deve exigir novo aceite mesmo depois de uma cosmética adicional (v2r2) por cima dela');

    // Depois que o usuário aceita a v2 vigente, uma NOVA cosmética (v2r2 já
    // publicada acima) não pede mais nada.
    const acceptReq = makeReq({ 'x-crewcheck-email': 'so-aceitou-v1r1@example.com' }, { termsId: v2r2.id, contentHash: v2r2.content_hash });
    const acceptRes = makeRes();
    await mod.handleTermsAccept(acceptReq, acceptRes);
    assert.equal(acceptRes.__status, 200);
    assert.equal(acceptRes.__body.accepted, true);

    const req2 = makeReq({ 'x-crewcheck-email': 'so-aceitou-v1r1@example.com' });
    const res2 = makeRes();
    await mod.handleTermsCurrent(req2, res2);
    assert.equal(res2.__body.terms.accepted, true, 'depois de aceitar a v2 vigente, continua aceito');
  }

  // ---------------------------------------------------------------------------
  // 6) requiredAcceptanceRevision() isolado: nunca considera revisão cosmética
  // como "exigida", mesmo que seja a mais recente.
  // ---------------------------------------------------------------------------
  {
    const db = mod.makeDb({
      seedTerms: [
        { id: 'a', version: 5, revision: 1, material: 1, status: 'superseded' },
        { id: 'b', version: 5, revision: 2, material: 0, status: 'superseded' },
        { id: 'c', version: 5, revision: 3, material: 0, status: 'published' },
      ],
    });
    const required = await mod.requiredAcceptanceRevision(db, 5, 3);
    assert.equal(required, 1, 'só a revisão material (1) deve ser exigida, mesmo com duas cosméticas depois dela');
  }

  console.log('[p0-terms-material-revision] OK — texto PT-BR corrigido sem a nota interna, Versão continua 1; usuário novo vê o texto certo e precisa aceitar; usuário que já aceitou continua aceito após correção cosmética (mesmo encadeando várias); publicação sem material explícito é fail-closed (incrementa version); material:false nunca incrementa version; mudança material futura exige novo aceite mesmo depois de cosméticas adicionais; requiredAcceptanceRevision() nunca considera revisão cosmética como exigida.');
} finally {
  delete process.env.CREWCHECK_AUTH_REQUIRED;
  delete process.env.CREWCHECK_ADMIN_EMAILS;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
