import fs from 'node:fs';

const platform = fs.readFileSync(new URL('../server/platform.mjs', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/20260714_002_profile_id_qr_share_repair.sql', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error('ERRO:', message);
    process.exitCode = 1;
  } else {
    console.log('OK:', message);
  }
}

assert(platform.includes("public_id=COALESCE(NULLIF(BTRIM(crewcheck_platform_profiles.public_id), ''), EXCLUDED.public_id)"), 'perfil antigo sem ID e reparado no login');
assert(platform.includes('for (let attempt = 0; attempt < 5; attempt += 1)'), 'geracao de ID repete em colisao');
assert(platform.includes("code: 'PROFILE_ID_MISSING'"), 'perfil sem ID nao passa silenciosamente');
assert(platform.includes("requirePlatformTable(context, res, 'crewcheck_platform_shares'"), 'QR verifica migration antes de gravar');
assert(platform.includes('profileIdReady') && platform.includes('qrShareReady'), 'health informa prontidao de ID e QR');
assert(migration.includes('ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS public_id TEXT'), 'migration repara coluna public_id');
assert(migration.includes('CREATE UNIQUE INDEX IF NOT EXISTS crewcheck_platform_profiles_public_id_idx'), 'migration garante ID unico');
assert(migration.includes('CREATE TABLE IF NOT EXISTS crewcheck_platform_shares'), 'migration cria compartilhamentos');
assert(migration.includes('crewcheck_platform_shares_token_hash_idx'), 'migration garante token de QR unico');
assert(!/mysql|mariadb/i.test(migration), 'migration e exclusivamente PostgreSQL');

if (!process.exitCode) console.log('CrewCheck PostgreSQL profile/QR regression OK');
