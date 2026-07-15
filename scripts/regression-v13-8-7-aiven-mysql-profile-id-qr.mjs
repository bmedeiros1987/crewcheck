import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const platform = readFileSync(new URL('../server/platform.mjs', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20260715_003_aiven_mysql_profile_id_qr.sql', import.meta.url), 'utf8');

const checks = [
  ['aceita URL MySQL', /\^\(\?:postgres[\s\S]*mysql/.test(platform) || platform.includes("(?:postgres(?:ql)?|mysql)")],
  ['mantem PostgreSQL', platform.includes("await import('pg')")],
  ['carrega mysql2 promise', platform.includes("await import('mysql2/promise')")],
  ['adapta placeholders', platform.includes('function mysqlStatement')],
  ['consulta schema atual MySQL', platform.includes('table_schema=DATABASE()')],
  ['gera perfil MySQL', platform.includes('ON DUPLICATE KEY UPDATE')],
  ['sincroniza escala MySQL', platform.includes('saveRosterMysql')],
  ['informa provider no health', platform.includes('provider: databaseDialect()')],
  ['migration cria profiles', migration.includes('CREATE TABLE IF NOT EXISTS crewcheck_platform_profiles')],
  ['migration cria rosters', migration.includes('CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters')],
  ['migration cria shares', migration.includes('CREATE TABLE IF NOT EXISTS crewcheck_platform_shares')],
  ['migration usa InnoDB', migration.includes('ENGINE=InnoDB')],
  ['migration nao usa PostgreSQL', !/\b(?:JSONB|TIMESTAMPTZ|to_regclass|ON CONFLICT)\b/i.test(migration)],
  ['migration nao contem segredo', !new RegExp(['avn', 'admin:|aiven', 'cloud\\.com|mysql://[^<\\s]+:[^<\\s]+@'].join(''), 'i').test(migration)],
];

for (const [label, result] of checks) {
  assert.equal(Boolean(result), true, label);
  console.log(`OK: ${label}`);
}

console.log('OK: compatibilidade Aiven MySQL para perfil, ID e QR validada.');
