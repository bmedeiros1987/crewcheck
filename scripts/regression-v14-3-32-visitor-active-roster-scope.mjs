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
const newQuery = "  const staysResult = permissions.hotels && rosterRow?.roster_key ? await db.query('SELECT id,stay_date,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_with_visitors FROM crewcheck_platform_stays WHERE owner_email=$1 AND roster_key=$2 AND share_with_visitors=TRUE ORDER BY stay_date LIMIT 90', [identity.ownerEmail, rosterRow.roster_key]) : { rows: [] };";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14332-'));
const target = path.join(tempDir, 'server/platform.mjs');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `async function handleVisitorData() {\n${oldQuery}\n  return staysResult;\n}\n`, 'utf8');

try {
  const first = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'primeira aplicação v14.3.32 falhou');
  const prepared = fs.readFileSync(target, 'utf8');
  assert.ok(prepared.includes(newQuery), 'consulta deve filtrar pernoites pelo roster_key ativo');
  assert.ok(!prepared.includes(oldQuery), 'consulta ampla sem roster_key não pode permanecer');
  assert.ok(prepared.includes('permissions.hotels && rosterRow?.roster_key'), 'sem escala ativa não deve consultar pernoites antigos');
  assert.ok(prepared.includes('[identity.ownerEmail, rosterRow.roster_key]'), 'parâmetros devem incluir titular e escala ativa');

  const second = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.32 falhou');
  assert.equal(fs.readFileSync(target, 'utf8'), prepared, 'patch v14.3.32 deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const mainEnv = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const mysqlMigration = fs.readFileSync(path.join(root, 'migrations/20260715_003_aiven_mysql_full_platform.sql'), 'utf8');
assert.ok(mainEnv.includes('CREWCHECK_DATABASE_PROVIDER=aiven-mysql'), 'a fundação atual deve permanecer em Aiven MySQL');
assert.ok(mysqlMigration.includes('Banco oficial e exclusivo: Aiven MySQL'), 'migration MySQL atual não pode ser substituída pela migration PostgreSQL antiga');

console.log('v14.3.32 visitor active-roster scope and Aiven MySQL foundation regression: OK');
