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

console.log('P-1 Auth artifact runtime helper regression OK');
