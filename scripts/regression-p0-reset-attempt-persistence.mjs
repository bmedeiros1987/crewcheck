import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');
const legacyRegression = fs.readFileSync('scripts/regression-p0-legacy-identity-bridge.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const marker = `function ${name}(`;
  let start = auth.indexOf(marker);
  assert.ok(start >= 0, `${name}() not found`);
  if (auth.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const parenOpen = auth.indexOf('(', start);
  let parenDepth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < auth.length; i += 1) {
    if (auth[i] === '(') parenDepth += 1;
    else if (auth[i] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenClose = i; break; }
    }
  }
  const braceOpen = auth.indexOf('{', parenClose);
  let depth = 0;
  for (let i = braceOpen; i < auth.length; i += 1) {
    if (auth[i] === '{') depth += 1;
    else if (auth[i] === '}') {
      depth -= 1;
      if (depth === 0) return auth.slice(start, i + 1);
    }
  }
  throw new Error(`${name}() never closes`);
}

const resetPassword = extractFunction('resetPassword');
const consumeAuthArtifact = extractFunction('consumeAuthArtifact');

assert.ok(
  resetPassword.includes('// cc-p0-399-reset-attempt-persistence:'),
  'materialized resetPassword must contain the #399 attempt-persistence marker',
);
assert.ok(
  resetPassword.includes("if (!consumed.ok) {\n      // cc-p0-399-reset-attempt-persistence:") &&
  resetPassword.includes("await connection.commit();\n      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });"),
  'invalid/expired consume branch must commit security bookkeeping before returning the unchanged public 400',
);
assert.ok(
  !resetPassword.includes("if (!consumed.ok) {\n      await connection.rollback();"),
  'invalid reset attempts must not be erased by rolling back the shared transaction',
);

const invalidBranch = resetPassword.indexOf('if (!consumed.ok) {');
const profileWrite = resetPassword.indexOf('ensureProfile(connection, email)');
const accountWrite = resetPassword.indexOf('INSERT INTO crewcheck_platform_accounts');
assert.ok(invalidBranch >= 0 && profileWrite > invalidBranch && accountWrite > invalidBranch,
  'the invalid-branch commit is safe only because all profile/account/password writes remain after a successful consume');

assert.ok(
  consumeAuthArtifact.includes('UPDATE crewcheck_platform_auth_artifacts SET attempts=attempts+1 WHERE id=?'),
  'wrong-code consume must still increment the canonical artifact attempt counter',
);
assert.ok(
  consumeAuthArtifact.includes('Number(artifact.attempts || 0) >= 5'),
  'canonical artifact consumption must remain fail-closed after five attempts',
);

// The valid-code path still shares the transaction with identity/password writes;
// a failure after successful consumption must therefore be handled by the outer
// catch rollback, preserving the atomicity regression added in #508.
assert.ok(
  resetPassword.includes('} catch (error) {\n    try { await connection.rollback(); } catch {}\n    throw error;'),
  'post-consume failures must still roll back artifact consumption and identity/password writes atomically',
);

assert.ok(
  legacyRegression.includes("db.state.authArtifacts.find((a) => a.email === target).attempts,\n      2,"),
  'materialized #399 E2E regression must prove that a wrong code through resetPassword accumulates attempts instead of losing them',
);

for (const src of [resetPassword, consumeAuthArtifact]) {
  assert.doesNotMatch(src, /crewcheck_rosters|crewcheck_platform_rosters/,
    'auth attempt persistence must remain isolated from every roster table');
}

console.log('P0 #399 reset attempt persistence gate: OK');
