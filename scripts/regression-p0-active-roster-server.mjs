import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/platform.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v14372/apply.mjs', 'utf8');

function slice(startNeedle, endNeedle) {
  const start = server.indexOf(startNeedle);
  const end = server.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, `bloco não localizado: ${startNeedle}`);
  return server.slice(start, end);
}

const save = slice('async function saveRosterMysql(', '\nasync function handleRosterSync(');
const lockAt = save.indexOf("SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE");
const deactivateAt = save.indexOf("UPDATE crewcheck_platform_rosters SET active=FALSE WHERE owner_email=$1");
const upsertAt = save.indexOf('INSERT INTO crewcheck_platform_rosters');
const invariantAt = save.indexOf('ACTIVE_ROSTER_INVARIANT');
const commitAt = save.indexOf("client.query('COMMIT')");

assert.ok(save.includes('// [p0-active-roster-server] serialized canonical activation'), 'sync precisa carregar o marcador de ativação serializada');
assert.ok(lockAt >= 0, 'sync precisa serializar concorrência da mesma conta com FOR UPDATE');
assert.ok(deactivateAt > lockAt, 'desativação anterior deve ocorrer depois do lock por conta');
assert.ok(upsertAt > deactivateAt, 'novo snapshot deve ser salvo depois de desativar o anterior');
assert.ok(invariantAt > upsertAt, 'invariante deve ser validada depois do upsert');
assert.ok(commitAt > invariantAt, 'COMMIT só pode ocorrer depois da validação da escala ativa');
assert.match(save, /activeInvariant\.rows\.length !== 1/, 'deve existir exatamente uma escala ativa');
assert.match(save, /activeRow\?\.roster_key !== key/, 'a escala ativa precisa pertencer ao período recém-sincronizado');
assert.match(save, /activeRow\?\.fingerprint !== fingerprint/, 'a escala ativa precisa ter o fingerprint recém-sincronizado');
assert.match(save, /catch \(error\)[\s\S]*?ROLLBACK/, 'falha da invariante deve provocar rollback da transação');

const active = slice('async function handleRosterActive(', '\nasync function handleStays(');
assert.match(active, /SELECT \* FROM crewcheck_platform_rosters[\s\S]*active=TRUE[\s\S]*LIMIT 1/, 'endpoint platform ativo deve ler o snapshot completo');
assert.match(active, /roster:\s*rosterSummary\(row\)/, 'endpoint platform ativo deve expor a identidade canônica');
assert.match(active, /data:\s*row \? \{ roster: row\.roster, compliance: row\.compliance, gym: row\.gym \|\| \[\] \}/, 'endpoint platform ativo deve devolver o mesmo snapshot operacional');

assert.match(server, /if \(url\.pathname === '\/api\/rosters\/active'\)[\s\S]*?roster:\s*rosterSummary\(row\)[\s\S]*?data:\s*row \? \{ roster: row\.roster, compliance: row\.compliance, gym: row\.gym \|\| \[\] \}/, 'endpoint runtime /api/rosters/active deve preservar summary + data canônicos');
assert.match(server, /function rosterFingerprint\(roster\)\s*\{\s*return sha256\(JSON\.stringify\(\{ year: roster\?\.year, month: roster\?\.month, crewId: roster\?\.crewId, days: roster\?\.days \}\)\);\s*\}/s, 'fingerprint do servidor deve continuar compatível com Web/APK');
assert.match(server, /if \(!Array\.isArray\(roster\.days\) \|\| !roster\.days\.length\)/, 'escala vazia não pode substituir a escala ativa válida');
assert.ok(chain.includes("await import('../p0-active-roster-server/apply.mjs');"), 'hotfix precisa participar da preparação canônica');

console.log('[p0-active-roster-server] OK — importação válida substitui a ativa de forma serializada, verificável e com identidade estável.');
