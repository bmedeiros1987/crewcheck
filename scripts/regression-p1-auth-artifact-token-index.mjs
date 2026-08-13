import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('migrations/20260813_016_p1_auth_artifact_token_lookup_index.sql', 'utf8');
const helper = fs.readFileSync('scripts/v14398/apply.mjs', 'utf8');

assert.equal(helper.includes("purpose=? AND token_hash=?"), true, 'runtime token consume lookup contract changed');
assert.equal(
  migration.includes('crewcheck_auth_artifact_token_lookup_idx (purpose, token_hash)'),
  true,
  'purpose + token_hash index missing',
);
assert.equal(/password_hash|crewcheck_platform_roster|canonical roster/i.test(migration), false, 'index migration must not touch credentials or roster');

console.log('P-1 Auth artifact token lookup index regression OK');
