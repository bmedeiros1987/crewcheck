import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'migrations/20260812_015_p1_auth_verification_artifacts.sql';
const sql = fs.readFileSync(path, 'utf8');

for (const marker of [
  'crewcheck_platform_email_identity_state',
  "ENUM('pending_email_verification','verified')",
  'crewcheck_platform_auth_artifacts',
  "ENUM('email_verification','password_reset')",
  'token_hash CHAR(64) NOT NULL',
  'code_hash CHAR(64) NULL',
  'expires_at DATETIME(3) NOT NULL',
  'used_at DATETIME(3) NULL',
  'invalidated_at DATETIME(3) NULL',
  'attempts INT NOT NULL DEFAULT 0',
  'correlation_id VARCHAR(64) NOT NULL',
  "ENUM('created','accepted','sent','delivered','rejected','failed')",
]) {
  assert.equal(sql.includes(marker), true, `missing verification schema marker: ${marker}`);
}

assert.equal(/token\s+VARCHAR/i.test(sql), false, 'raw verification tokens must never be stored');
assert.equal(/code\s+VARCHAR/i.test(sql), false, 'raw fallback codes must never be stored');
assert.equal(sql.includes('password_hash'), false, 'verification schema must not mutate credential storage');
assert.equal(sql.includes('roster'), false, 'verification schema must not touch roster ownership/data');

console.log('P-1 Auth verification schema regression OK');
