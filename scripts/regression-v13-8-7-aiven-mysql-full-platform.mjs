import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const platform = read('server/platform.mjs');
const server = read('server.mjs');
const migration = read('migrations/20260715_003_aiven_mysql_full_platform.sql');
const envExample = read('.env.example');
const pkg = JSON.parse(read('package.json'));
const lock = read('package-lock.json');

const forbiddenSql = /\b(?:JSONB|TIMESTAMPTZ|to_regclass|string_to_array|current_database)\b|ON\s+CONFLICT|::(?:jsonb|text|int|interval)|\bANY\s*\(|RETURNING\s+[a-z*]/i;
const forbiddenProvider = /POSTGRES_URL|PGSSLMODE|SUPABASE_DB_URL|await\s+import\(['"]pg['"]\)/i;

assert.match(platform, /mysql2\/promise/);
assert.match(platform, /function mysqlStatement/);
assert.match(platform, /table_schema=DATABASE\(\)/i);
assert.match(platform, /ON DUPLICATE KEY UPDATE/);
assert.match(platform, /INSERT IGNORE/);
assert.doesNotMatch(platform, forbiddenSql);
assert.doesNotMatch(platform, forbiddenProvider);

assert.match(server, /mysql2\/promise/);
assert.match(server, /crewcheck_telegram_state/);
assert.match(server, /ON DUPLICATE KEY UPDATE/);
assert.doesNotMatch(server, forbiddenSql);
assert.doesNotMatch(server, forbiddenProvider);

for (const table of [
  "crewcheck_schema_migrations",
  "crewcheck_platform_profiles",
  "crewcheck_platform_subscriptions",
  "crewcheck_platform_usage",
  "crewcheck_platform_rosters",
  "crewcheck_platform_hotel_rules",
  "crewcheck_platform_stays",
  "crewcheck_platform_shares",
  "crewcheck_platform_visitors",
  "crewcheck_platform_connections",
  "crewcheck_platform_chat_threads",
  "crewcheck_platform_chat_messages",
  "crewcheck_platform_gym_checkins",
  "crewcheck_platform_webhook_events",
  "crewcheck_platform_emergencies",
  "crewcheck_telegram_state",
  "crewcheck_platform_auth_attempts",
  "crewcheck_platform_addresses",
  "crewcheck_platform_user_hotels",
  "crewcheck_platform_gym_preferences",
  "crewcheck_platform_routine_preferences",
  "crewcheck_platform_parking_positions",
  "crewcheck_platform_finance_configs",
  "crewcheck_platform_flight_follows",
  "crewcheck_platform_swap_analyses",
  "crewcheck_platform_schedule_comparisons"
]) {
  assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS ' + table + '\\b'), 'Tabela MySQL ausente: ' + table);
}
assert.match(migration, /ENGINE=InnoDB/g);
assert.match(migration, /DEFAULT CHARSET=utf8mb4/g);
assert.match(migration, /ON DUPLICATE KEY UPDATE/);
assert.doesNotMatch(migration, forbiddenSql);
assert.doesNotMatch(migration, /postgres|supabase|mysql:\/\/(?!USER:PASSWORD@)[^\s]+:[^\s]+@|AVNS_|aivencloud\.com/i);

assert.match(envExample, /DATABASE_URL=mysql:\/\/USER:PASSWORD@HOST:PORT\/defaultdb\?ssl-mode=REQUIRED/);
assert.match(envExample, /CREWCHECK_DATABASE_PROVIDER=aiven-mysql/);
assert.match(envExample, /ASAAS_ENV=production/);
assert.match(envExample, /ASAAS_API_BASE_URL=https:\/\/api\.asaas\.com\/v3/);
assert.doesNotMatch(envExample, /POSTGRES_URL|PGSSLMODE|SUPABASE_|SMTP_/);

assert.ok(pkg.dependencies.mysql2, 'mysql2 deve permanecer instalado');
assert.equal(pkg.dependencies.pg, undefined, 'pg deve ser removido');
assert.ok(pkg.scripts['regression:v13.8.7:mysql']);
assert.doesNotMatch(lock, /node_modules\/pg(?:-|")|node_modules\/postgres-/);

const secretLike = /AVNS_[A-Za-z0-9_-]{16,}|mysql:\/\/(?!USER:PASSWORD@)[^\s]+:[^\s]+@|ghp_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|cloudinary:\/\/[^:\s]+:[^@\s]+@/i;
for (const [name, source] of Object.entries({ platform, server, migration, envExample })) {
  assert.doesNotMatch(source, secretLike, 'Segredo encontrado em ' + name);
}

console.log('CrewCheck Aiven MySQL full platform regression OK');
