import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyPath = path.join(root, 'scripts/v14332/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14332/apply.mjs');"), 'v14.3.32 deve estar no fim da preparação canônica');

const oldQuery = "  const staysResult = permissions.hotels ? await db.query('SELECT id,stay_date,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_with_visitors FROM crewcheck_platform_stays WHERE owner_email=$1 AND share_with_visitors=TRUE ORDER BY stay_date LIMIT 90', [identity.ownerEmail]) : { rows: [] };";
const newQueryMarker = "AND (roster_key=$2 OR (roster_key IS NULL AND stay_date BETWEEN $3 AND $4))";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14332-'));
const target = path.join(tempDir, 'server/platform.mjs');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `function parseDateOnly(value) { return value; }\nasync function handleVisitorData() {\n${oldQuery}\n  return staysResult;\n}\n`, 'utf8');

try {
  const first = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'primeira aplicação v14.3.32 falhou');
  const prepared = fs.readFileSync(target, 'utf8');
  assert.ok(prepared.includes(newQueryMarker), 'consulta deve filtrar pela escala ativa e preservar manual do mesmo período');
  assert.ok(!prepared.includes(oldQuery), 'consulta ampla sem roster_key não pode permanecer');
  assert.ok(prepared.includes('permissions.hotels && rosterRow?.roster_key'), 'sem escala ativa não deve consultar pernoites antigos');
  assert.ok(prepared.includes('.map((day) => parseDateOnly(day?.date))'), 'datas publicadas da escala devem limitar registros manuais');
  assert.ok(prepared.includes('[identity.ownerEmail, rosterRow.roster_key, activeRosterStart, activeRosterEnd]'), 'consulta deve receber titular, escala e intervalo ativo');

  const second = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.32 falhou');
  assert.equal(fs.readFileSync(target, 'utf8'), prepared, 'patch v14.3.32 deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function manualStayVisible({ rosterKey, activeRosterKey, stayDate, activeStart, activeEnd }) {
  return rosterKey === activeRosterKey || (!rosterKey && stayDate >= activeStart && stayDate <= activeEnd);
}
assert.equal(manualStayVisible({ rosterKey: '2026-08', activeRosterKey: '2026-08', stayDate: '2026-08-17', activeStart: '2026-08-01', activeEnd: '2026-08-31' }), true, 'pernoite da escala ativa deve aparecer');
assert.equal(manualStayVisible({ rosterKey: null, activeRosterKey: '2026-08', stayDate: '2026-08-17', activeStart: '2026-08-01', activeEnd: '2026-08-31' }), true, 'pernoite manual compartilhado dentro do período ativo deve aparecer');
assert.equal(manualStayVisible({ rosterKey: null, activeRosterKey: '2026-08', stayDate: '2026-07-17', activeStart: '2026-08-01', activeEnd: '2026-08-31' }), false, 'pernoite manual antigo não pode vazar para o visitante');
assert.equal(manualStayVisible({ rosterKey: '2026-07', activeRosterKey: '2026-08', stayDate: '2026-08-17', activeStart: '2026-08-01', activeEnd: '2026-08-31' }), false, 'pernoite vinculado a outra escala não pode aparecer');

const mainEnv = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const mysqlMigration = fs.readFileSync(path.join(root, 'migrations/20260715_003_aiven_mysql_full_platform.sql'), 'utf8');
assert.ok(mainEnv.includes('CREWCHECK_DATABASE_PROVIDER=aiven-mysql'), 'a fundação atual deve permanecer em Aiven MySQL');
assert.ok(mainEnv.includes('GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL='), 'template deve usar a variável RTDN que o servidor realmente lê');
assert.ok(mainEnv.includes('FLIGHTAWARE_AEROAPI_KEY='), 'template deve usar a variável FlightAware principal lida pelo servidor');
assert.ok(mainEnv.includes('AEROAPI_KEY='), 'template deve documentar o alias AEROAPI_KEY aceito pelo servidor');
assert.ok(!/^FLIGHTAWARE_API_KEY=/m.test(mainEnv), 'template não pode anunciar variável FlightAware ignorada pelo backend');
assert.ok(mysqlMigration.includes('Banco oficial e exclusivo: Aiven MySQL'), 'migration MySQL atual não pode ser substituída pela migration PostgreSQL antiga');

console.log('v14.3.32 visitor scope, manual stay boundary, Aiven MySQL and production env regression: OK');
