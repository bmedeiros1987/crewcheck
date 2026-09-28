import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// #399 identity-loss investigation: git archaeology confirmed the real cause of
// production accounts showing state: "no_identity" was commit 9cf5fad2 ("Convert
// CrewCheck platform exclusively to Aiven MySQL", 2026-07-15 01:27), which repointed
// DATABASE_URL from PostgreSQL/Supabase to a brand-new "clean install" MySQL schema
// with no export/import step - not a DROP/TRUNCATE/DELETE inside this repository.
// This regression is the guard against that class of incident recurring going
// forward: no migration file may ever bulk-remove rows from, or destroy, the
// identity/ownership tables, and the auto-migrate flags that could turn a routine
// deploy into an unreviewed schema change must stay disabled.

const migrationsDir = 'migrations';
const IDENTITY_AND_OWNERSHIP_TABLES = [
  'crewcheck_platform_accounts',
  'crewcheck_platform_profiles',
  'crewcheck_platform_rosters',
  'crewcheck_platform_subscriptions',
  'crewcheck_platform_usage',
  'crewcheck_platform_stays',
  'crewcheck_platform_routine_preferences',
  'crewcheck_platform_addresses',
];

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
assert.ok(migrationFiles.length > 0, 'nenhum arquivo de migration encontrado - o teste não pode validar nada vazio');

for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  for (const table of IDENTITY_AND_OWNERSHIP_TABLES) {
    const dropPattern = new RegExp(`DROP\\s+TABLE[^;]*\\b${table}\\b`, 'i');
    const truncatePattern = new RegExp(`TRUNCATE[^;]*\\b${table}\\b`, 'i');
    const bulkDeletePattern = new RegExp(`DELETE\\s+FROM\\s+${table}\\b(?!\\s+WHERE)`, 'i');
    assert.doesNotMatch(sql, dropPattern, `${file} não pode conter DROP TABLE em ${table} (tabela de identidade/ownership)`);
    assert.doesNotMatch(sql, truncatePattern, `${file} não pode conter TRUNCATE em ${table} (tabela de identidade/ownership)`);
    assert.doesNotMatch(sql, bulkDeletePattern, `${file} não pode conter DELETE FROM ${table} sem WHERE (apagaria todas as linhas)`);
  }
}

// Fora das migrations: nenhum código de aplicação pode fazer DELETE em massa (sem
// WHERE, ou com WHERE que não restrinja a uma única identidade) nessas tabelas.
// A única DELETE legítima já auditada é a exclusão de conta self-service em
// server/platform.mjs, sempre restrita a WHERE email=$1 (a própria identidade
// autenticada) - nunca um DELETE sem filtro.
const serverFiles = ['server.mjs', 'server/platform.mjs', 'server/v139/auth.mjs', 'server/v139/common.mjs'];
for (const file of serverFiles) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const table of ['crewcheck_platform_accounts', 'crewcheck_platform_profiles']) {
    const bulkDeletePattern = new RegExp(`DELETE\\s+FROM\\s+${table}\\s*['\`]`, 'i');
    assert.doesNotMatch(source, bulkDeletePattern, `${file} não pode conter DELETE FROM ${table} sem filtro de identidade (WHERE) imediatamente após o nome da tabela`);
  }
}

// CREWCHECK_AUTO_MIGRATE precisa continuar desabilitada no build que de fato é
// publicado - isso é o que garante que uma migration nova só roda depois de revisão
// humana explícita, nunca automaticamente a cada deploy. A seed versionada de
// render.yaml declara "value: true" de propósito (é o valor de instalação local /
// desenvolvimento); é a cadeia de patches (scripts/v139/apply-core.mjs) que a
// inverte para "false" antes do build de produção (render.yaml: buildCommand roda
// "npm run build", que por sua vez roda a cadeia de apply antes do build final).
// Se ALGUÉM remover esse patch, o build passaria a publicar auto-migrate LIGADO -
// exatamente o tipo de "rotina de bootstrap que recria/limpa tabelas silenciosamente"
// que a investigação #399 pediu para travar. Por isso este teste verifica o
// MECANISMO que produz o valor final, não o valor bruto da seed isolado.
if (fs.existsSync('render.yaml')) {
  const renderYaml = fs.readFileSync('render.yaml', 'utf8');
  const autoMigrateMatch = renderYaml.match(/CREWCHECK_AUTO_MIGRATE\s*\n\s*value:\s*(\S+)/);
  assert.ok(autoMigrateMatch, 'render.yaml deve declarar CREWCHECK_AUTO_MIGRATE explicitamente');
}
const applyCorePath = path.join('scripts', 'v139', 'apply-core.mjs');
assert.ok(fs.existsSync(applyCorePath), `${applyCorePath} não encontrado - não é possível verificar o mecanismo que desativa auto-migrate em produção`);
const applyCoreSrc = fs.readFileSync(applyCorePath, 'utf8');
assert.match(
  applyCoreSrc,
  /CREWCHECK_AUTO_MIGRATE[\s\S]{0,40}value:\s*true[\s\S]{0,80}CREWCHECK_AUTO_MIGRATE[\s\S]{0,40}value:\s*false/,
  'scripts/v139/apply-core.mjs deve conter o patch que inverte CREWCHECK_AUTO_MIGRATE de true (seed) para false (build de produção) - sem ele, o deploy publicaria auto-migração de schema ligada por padrão',
);
if (fs.existsSync('.env.example')) {
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const dbAutoMigrateMatch = envExample.match(/CREWCHECK_DB_AUTO_MIGRATE\s*=\s*(\S*)/);
  if (dbAutoMigrateMatch) {
    assert.equal(dbAutoMigrateMatch[1], 'false', 'CREWCHECK_DB_AUTO_MIGRATE deve permanecer false por padrão no .env.example');
  }
}

console.log('[p0-identity-tables-fail-closed] OK — nenhuma migration ou rota de aplicação remove em massa as tabelas de identidade/ownership; auto-migração continua desabilitada por padrão.');
