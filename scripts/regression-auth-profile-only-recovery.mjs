import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'server/v139/auth.mjs';
const source = fs.readFileSync(path, 'utf8');

assert.equal(source.includes('const placeholder = passwordDigest'), false, 'requestReset must not create a placeholder credential');
assert.equal(source.includes("SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE"), true, 'profile identity must be locked transactionally');
assert.equal(source.includes("SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE"), true, 'account identity must be locked transactionally');
assert.equal(source.includes('ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt),must_change_password=0'), true, 'verified recovery must upsert current credentials in-place');
assert.equal(source.includes("UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL"), true, 'all outstanding recovery artifacts must be consumed');

const requestReset = source.slice(source.indexOf('async function requestReset'), source.indexOf('async function resetPassword'));
const resetPassword = source.slice(source.indexOf('async function resetPassword'), source.indexOf('async function me'));
assert.equal(requestReset.includes('INSERT IGNORE INTO crewcheck_platform_accounts'), false, 'requestReset must not materialize an account row');
assert.equal(resetPassword.includes('INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password)'), true, 'resetPassword must create the missing credential only after verification');
assert.equal(resetPassword.includes('must_change_password=0'), true, 'recovered credentials must not force an unknown placeholder password');

console.log('auth profile-only recovery regression: ok');
