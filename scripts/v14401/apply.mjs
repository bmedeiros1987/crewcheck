import fs from 'node:fs';

const path = 'server/v139/auth.mjs';
const source = fs.readFileSync(path, 'utf8');

const alreadyApplied = source.includes("connection: providedConnection = null }) {\n  if (!AUTH_ARTIFACT_PURPOSES.has(purpose)) return { ok: false, reason: 'invalid' };");
if (alreadyApplied) {
  console.log('[crewcheck:prepare] v14.4.01 auth-artifact-canonical reset consumption already applied.');
  process.exit(0);
}

// #399: real production E2E on the pilot account showed requestReset() issuing a
// valid code (mirrored into crewcheck_platform_auth_artifacts via
// issueAuthArtifact() since v14.3.99) while resetPassword() still validated
// exclusively against the OLDER crewcheck_platform_password_resets/resetHash()
// pair - two sources of truth for the same code, with the canonical artifact
// table never actually consumed. This makes crewcheck_platform_auth_artifacts the
// single source of truth: consumeAuthArtifact() gains the same optional
// connection-sharing support issueAuthArtifact() already has, and
// resetPassword() calls it instead of re-deriving resetHash()/reading
// password_resets.code_hash. password_resets is still marked used_at for
// backward-compatible observability only, never consulted for validation again.

function replaceOnce(text, anchor, replacement, label) {
  if (!text.includes(anchor)) throw new Error(`v14.4.01 anchor not found: ${label}`);
  const updated = text.replace(anchor, replacement);
  if (updated === text) throw new Error(`v14.4.01 replacement failed: ${label}`);
  return updated;
}

// consumeAuthArtifact(): add optional connection sharing, mirroring the exact
// ownsConnection pattern issueAuthArtifact() already established. When a caller
// provides its own connection, this function never opens a connection, never
// begins/commits/rolls back/releases on its own - the caller owns the whole
// transaction, so a later failure elsewhere in that transaction correctly
// un-consumes this artifact too.
let next = replaceOnce(
  source,
  `async function consumeAuthArtifact(db, { purpose, token = '', email = '', code = '' }) {
  if (!AUTH_ARTIFACT_PURPOSES.has(purpose)) return { ok: false, reason: 'invalid' };
  const normalizedEmail = safeEmail(email);
  const tokenHash = token ? authArtifactHash(purpose, token) : '';
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const params = tokenHash ? [purpose, tokenHash] : [purpose, normalizedEmail];
    const where = tokenHash ? 'purpose=? AND token_hash=?' : 'purpose=? AND email=?';
    const [rows] = await connection.query(
      \`SELECT * FROM crewcheck_platform_auth_artifacts WHERE \${where} ORDER BY created_at DESC LIMIT 1 FOR UPDATE\`,
      params,
    );
    const artifact = rows[0];
    const expired = !artifact || new Date(artifact.expires_at).getTime() < Date.now();
    const unavailable = !artifact || artifact.used_at || artifact.invalidated_at || expired || Number(artifact.attempts || 0) >= 5;
    if (unavailable) {
      await connection.rollback();
      return { ok: false, reason: 'invalid_or_expired' };
    }
    if (!tokenHash) {
      const candidate = code && normalizedEmail ? authArtifactCodeHash(purpose, normalizedEmail, code) : '';
      if (!candidate || !artifact.code_hash || !secureCompare(candidate, artifact.code_hash)) {
        await connection.query('UPDATE crewcheck_platform_auth_artifacts SET attempts=attempts+1 WHERE id=?', [artifact.id]);
        await connection.commit();
        return { ok: false, reason: 'invalid_or_expired' };
      }
    }
    await connection.query('UPDATE crewcheck_platform_auth_artifacts SET used_at=CURRENT_TIMESTAMP(3) WHERE id=? AND used_at IS NULL AND invalidated_at IS NULL', [artifact.id]);
    await connection.query(
      \`UPDATE crewcheck_platform_auth_artifacts SET invalidated_at=CURRENT_TIMESTAMP(3)
       WHERE email=? AND purpose=? AND id<>? AND used_at IS NULL AND invalidated_at IS NULL\`,
      [artifact.email, purpose, artifact.id],
    );
    await connection.commit();
    return { ok: true, email: artifact.email, artifactId: artifact.id, correlationId: artifact.correlation_id };
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
}`,
  `async function consumeAuthArtifact(db, { purpose, token = '', email = '', code = '', connection: providedConnection = null }) {
  if (!AUTH_ARTIFACT_PURPOSES.has(purpose)) return { ok: false, reason: 'invalid' };
  const normalizedEmail = safeEmail(email);
  const tokenHash = token ? authArtifactHash(purpose, token) : '';
  const ownsConnection = !providedConnection;
  const connection = providedConnection || await db.getConnection();
  try {
    if (ownsConnection) await connection.beginTransaction();
    const params = tokenHash ? [purpose, tokenHash] : [purpose, normalizedEmail];
    const where = tokenHash ? 'purpose=? AND token_hash=?' : 'purpose=? AND email=?';
    const [rows] = await connection.query(
      \`SELECT * FROM crewcheck_platform_auth_artifacts WHERE \${where} ORDER BY created_at DESC LIMIT 1 FOR UPDATE\`,
      params,
    );
    const artifact = rows[0];
    const expired = !artifact || new Date(artifact.expires_at).getTime() < Date.now();
    const unavailable = !artifact || artifact.used_at || artifact.invalidated_at || expired || Number(artifact.attempts || 0) >= 5;
    if (unavailable) {
      if (ownsConnection) await connection.rollback();
      return { ok: false, reason: 'invalid_or_expired' };
    }
    if (!tokenHash) {
      const candidate = code && normalizedEmail ? authArtifactCodeHash(purpose, normalizedEmail, code) : '';
      if (!candidate || !artifact.code_hash || !secureCompare(candidate, artifact.code_hash)) {
        await connection.query('UPDATE crewcheck_platform_auth_artifacts SET attempts=attempts+1 WHERE id=?', [artifact.id]);
        if (ownsConnection) await connection.commit();
        return { ok: false, reason: 'invalid_or_expired' };
      }
    }
    await connection.query('UPDATE crewcheck_platform_auth_artifacts SET used_at=CURRENT_TIMESTAMP(3) WHERE id=? AND used_at IS NULL AND invalidated_at IS NULL', [artifact.id]);
    await connection.query(
      \`UPDATE crewcheck_platform_auth_artifacts SET invalidated_at=CURRENT_TIMESTAMP(3)
       WHERE email=? AND purpose=? AND id<>? AND used_at IS NULL AND invalidated_at IS NULL\`,
      [artifact.email, purpose, artifact.id],
    );
    if (ownsConnection) await connection.commit();
    return { ok: true, email: artifact.email, artifactId: artifact.id, correlationId: artifact.correlation_id };
  } catch (error) {
    if (ownsConnection) { try { await connection.rollback(); } catch {} }
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}`,
  'consumeAuthArtifact connection sharing',
);

// resetPassword(): drop the password_resets/resetHash() validation entirely and
// consume the canonical artifact instead, inside the SAME transaction that
// already locks profiles/accounts and will create the identity. password_resets
// is still marked used_at afterward, for compatibility/observability only - it is
// never read back to decide anything.
next = replaceOnce(
  next,
  `    const [rows] = await connection.query(
      'SELECT * FROM crewcheck_platform_password_resets WHERE email=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [email],
    );
    const reset = rows[0];
    if (!reset || new Date(reset.expires_at).getTime() < Date.now() || Number(reset.attempts || 0) >= 5) {
      await connection.rollback();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }
    if (!secureCompare(reset.code_hash, resetHash(email, code))) {
      await connection.query('UPDATE crewcheck_platform_password_resets SET attempts=attempts+1 WHERE id=?', [reset.id]);
      await connection.commit();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }
    if (!lockedProfiles[0]) {`,
  `    const consumed = await consumeAuthArtifact(db, { purpose: 'password_reset', email, code, connection });
    if (!consumed.ok) {
      await connection.rollback();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }
    if (!lockedProfiles[0]) {`,
  'resetPassword artifact-canonical consumption',
);

fs.writeFileSync(path, next, 'utf8');
console.log('[crewcheck:prepare] v14.4.01 auth-artifact-canonical reset consumption applied.');
