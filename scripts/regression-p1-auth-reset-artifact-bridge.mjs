import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchAuthResetArtifactBridge } from './v14399/patch.mjs';

const raw = fs.readFileSync('server/v139/auth.mjs', 'utf8').replaceAll('\r\n', '\n');
const profileOnlyPrepared = fs.readFileSync('scripts/v14396/apply.mjs', 'utf8');
const artifactPrepared = fs.readFileSync('scripts/v14398/apply.mjs', 'utf8').replaceAll('\r\n', '\n');

assert.match(profileOnlyPrepared, /await import\('\.\.\/v14397\/apply\.mjs'\)/, 'profile-only recovery must remain before the bridge');
assert.match(artifactPrepared, /await import\('\.\.\/v14399\/apply\.mjs'\)/, 'artifact helper must chain the reset bridge');

// Build the relevant prepared fixture without mutating runtime sources.
let prepared = raw
  .replace(/  if \(!accounts\[0\]\) \{[\s\S]*?\n  \}\n\n  const minutes/, '  const minutes')
  .replace(
    "    await connection.beginTransaction();\n    await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);",
    "    await connection.beginTransaction();\n    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    if (!lockedProfiles[0] && !lockedAccounts[0]) { await connection.rollback(); return sendJson(res, 200, generic); }",
  );

const anchorStart = prepared.indexOf('function resetHash(email, code) {');
const anchorEnd = prepared.indexOf('\n}', anchorStart) + 2;
const helperPrefix = 'const helpers = `${anchor}\\n';
const helperStart = artifactPrepared.indexOf(helperPrefix);
const helperEnd = artifactPrepared.indexOf('`;\n\nfs.writeFileSync', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'artifact helper fixture missing');
const resetHashFunction = prepared.slice(anchorStart, anchorEnd);
const helperBody = artifactPrepared
  .slice(helperStart + helperPrefix.length, helperEnd)
  .replaceAll('\\n', '\n')
  .replaceAll('\\`', '`')
  .replaceAll('\\${', '${');
prepared = `${prepared.slice(0, anchorStart)}${resetHashFunction}\n${helperBody}${prepared.slice(anchorEnd)}`;

const bridged = patchAuthResetArtifactBridge(prepared);
assert.equal(patchAuthResetArtifactBridge(bridged), bridged, 'bridge preparation must be idempotent');

const requestReset = bridged.slice(bridged.indexOf('async function requestReset'), bridged.indexOf('async function resetPassword'));
for (const marker of [
  "purpose: 'password_reset'",
  'connection,',
  'resetHash(email, resetArtifact.code)',
  "delivery_state='accepted'",
  'delivery_provider=?',
  'delivery_message_id=?',
  "mail.sendPaused !== true",
]) assert.match(requestReset, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing bridge contract: ${marker}`);

assert.doesNotMatch(requestReset, /console\.(?:log|warn|error).*?(?:code|token|email)/i, 'bridge must not log secrets or email');
assert.doesNotMatch(requestReset, /crewcheck_platform_(?:roster|email_identity_state)/, 'password reset bridge must not touch roster or verification state');
assert.match(bridged, /if \(ownsConnection\) await connection\.commit\(\)/, 'shared transaction helper must not commit caller transaction');
assert.match(bridged, /if \(ownsConnection\) connection\.release\(\)/, 'shared transaction helper must not release caller connection');

console.log('P-1 Auth reset artifact bridge regression OK');
