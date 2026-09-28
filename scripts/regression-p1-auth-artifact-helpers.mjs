import fs from 'node:fs';

const apply = fs.readFileSync('scripts/v14398/apply.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v14397/apply.mjs', 'utf8');

for (const marker of [
  "AUTH_ARTIFACT_PURPOSES = new Set(['email_verification', 'password_reset'])",
  'crypto.randomBytes(32).toString(\'base64url\')',
  'authArtifactHash(purpose, token)',
  'authArtifactCodeHash(purpose, normalizedEmail, code)',
  'SET invalidated_at=CURRENT_TIMESTAMP(3)',
  'used_at IS NULL AND invalidated_at IS NULL',
  'Number(artifact.attempts || 0) >= 5',
  'attempts=attempts+1',
  'correlationId = crypto.randomUUID()',
]) {
  if (!apply.includes(marker)) throw new Error(`Missing P-1 auth artifact helper contract: ${marker}`);
}

if (!chain.includes("await import('../v14398/apply.mjs');")) throw new Error('v14.3.98 is not chained after v14.3.97');
if (/console\.(log|warn|error)\([^\n]*(token|code|email)/i.test(apply)) throw new Error('Artifact helper must not log token/code/email');
if (apply.includes('crewcheck_platform_roster') || apply.includes('canonical roster')) throw new Error('Artifact helper must not touch roster');
if (!apply.includes("purpose=? AND token_hash=?") || !apply.includes("purpose=? AND email=?")) throw new Error('Purpose-separated consume lookup missing');

// A password_reset issuance must never create/touch crewcheck_platform_email_identity_state.
// Only email_verification may materialize pending_email_verification for an identity.
if (!apply.includes("if (purpose === 'email_verification') {\\n      await connection.query(\\n        \\`INSERT IGNORE INTO crewcheck_platform_email_identity_state")) {
  throw new Error('pending_email_verification mutation must be scoped to purpose === email_verification only');
}
if (apply.includes("await connection.beginTransaction();\\n    await connection.query(\\n      \\`INSERT IGNORE INTO crewcheck_platform_email_identity_state")) {
  throw new Error('email verification state must not be mutated unconditionally for every purpose (would also fire for password_reset)');
}

console.log('P-1 Auth artifact runtime helper regression OK');
