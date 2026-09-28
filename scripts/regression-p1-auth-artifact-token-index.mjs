import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = 'migrations/20260814_017_p1_auth_artifact_token_lookup_index.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const helper = fs.readFileSync('scripts/v14398/apply.mjs', 'utf8');

assert.match(helper, /tokenHash \? 'purpose=\? AND token_hash=\?'/, 'runtime token consume lookup contract changed');
assert.match(
  migration,
  /ADD KEY crewcheck_auth_artifact_token_lookup_idx\s*\(purpose, token_hash\)/,
  'purpose + token_hash index missing',
);
assert.doesNotMatch(
  migration,
  /password_hash|crewcheck_platform_roster|canonical roster|\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i,
  'index migration must not touch credentials, roster, or existing rows',
);
assert.match(migration, /VALUES \('20260814_017'/, 'migration ledger version must match the migration filename');

console.log('P-1 Auth artifact token lookup index regression OK');
