// Callers must pass claims from an already verified JWT. An email alone, or an
// email-derived legacy subject, does not identify an incarnation of an account.
export function accountSessionClaims(claims, now = Date.now()) {
  const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || claims.iss !== 'crewcheck' || claims.aud !== 'crewcheck-web'
    || claims.role === 'visitor' || typeof claims.sub !== 'string' || !claims.sub
    || !Number.isFinite(now) || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000)) return null;
  return { email, publicId: claims.sub };
}

export async function readAccountSessionProfile(client, { email, publicId }, { lock } = {}) {
  const lockClause = lock === 'write' ? ' FOR UPDATE' : lock === 'read' ? ' FOR SHARE' : '';
  const { rows } = await client.query(
    `SELECT * FROM crewcheck_platform_profiles WHERE email=$1 AND public_id=$2 LIMIT 1${lockClause}`,
    [email, publicId],
  );
  const profile = rows[0];
  // SQL collations may compare distinct spellings as equal. Use exact claims.
  return profile?.email === email && profile.public_id === publicId ? profile : null;
}
