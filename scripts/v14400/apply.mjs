import fs from 'node:fs';

const path = 'server/v139/auth.mjs';
const source = fs.readFileSync(path, 'utf8');

const alreadyApplied = source.includes('async function legacyIdentityExists(db, email)');
if (alreadyApplied) {
  console.log('[crewcheck:prepare] v14.4.00 legacy identity bridge already applied.');
  process.exit(0);
}

// #399 legacy identity bridge: a legacy crewcheck_users row with NO current
// crewcheck_platform_profiles/accounts row must never get an account created just
// because its email matches - the modern identity is only ever materialized after
// the user proves possession of that email through the SAME single-use code flow
// already used for every other password reset. requestReset()/resetPassword() are
// extended (never duplicated) to treat "no current identity, but exactly one
// unambiguous legacy row" the same as "identity exists" for the purpose of issuing
// and consuming a code - creation itself only happens inside resetPassword(), and
// only after the code is verified, reusing the exact ensureProfile()/account-upsert
// logic v14.3.96 already established for the profile-only-recovery case.
const helperAnchor = 'function blockedDomains() {';
if (!source.includes(helperAnchor)) throw new Error('v14.4.00 anchor not found: helper insertion point');

const helper = `// Never used to authenticate, never reads password_hash - purely a structural
// existence/ambiguity check to decide whether a password-reset code may be issued
// for an email with no current identity yet. Ambiguous (more than one legacy row
// normalizing to the same email) fails closed exactly like duplicate_identity does
// elsewhere in this file - never silently picks one.
async function legacyIdentityExists(db, email) {
  try {
    const [tableRows] = await db.query(
      "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_users' LIMIT 1",
    );
    if (!tableRows[0]) return false;
    const [columnRows] = await db.query(
      "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_users' AND COLUMN_NAME='email'",
    );
    if (!columnRows[0]) return false;
    const collationReport = await legacyColumnCollationReport(db);
    const commonCollation = resolveCommonCollation(collationReport);
    const [variantRows] = await db.query(
      \`SELECT COUNT(*) AS variantCount FROM crewcheck_users WHERE \${collateEq('LOWER(TRIM(email))', '?', commonCollation)}\`,
      [email],
    );
    return Number(variantRows[0]?.variantCount || 0) === 1;
  } catch {
    return false;
  }
}

${helperAnchor}`;

let next = source.replace(helperAnchor, helper);
if (next === source) throw new Error('v14.4.00 replacement failed: helper insertion');

function replaceOnce(text, anchor, replacement, label) {
  if (!text.includes(anchor)) throw new Error(`v14.4.00 anchor not found: ${label}`);
  const updated = text.replace(anchor, replacement);
  if (updated === text) throw new Error(`v14.4.00 replacement failed: ${label}`);
  return updated;
}

// requestReset(): early non-transactional gate.
next = replaceOnce(
  next,
  `  const [profiles] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);\n  const [accounts] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);\n  if (!profiles[0] && !accounts[0] && !isAdminEmail(email)) return sendJson(res, 200, generic);`,
  `  const [profiles] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);\n  const [accounts] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);\n  const legacyBridgeEligible = !profiles[0] && !accounts[0] && !isAdminEmail(email) && await legacyIdentityExists(db, email);\n  if (!profiles[0] && !accounts[0] && !isAdminEmail(email) && !legacyBridgeEligible) return sendJson(res, 200, generic);`,
  'requestReset early identity gate',
);

// requestReset(): transactional re-check gate (returns the generic 200 response).
next = replaceOnce(
  next,
  `    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    if (!lockedProfiles[0] && !lockedAccounts[0]) {\n      await connection.rollback();\n      return sendJson(res, 200, generic);\n    }`,
  `    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    if (!lockedProfiles[0] && !lockedAccounts[0] && !legacyBridgeEligible) {\n      await connection.rollback();\n      return sendJson(res, 200, generic);\n    }`,
  'requestReset transactional identity gate',
);

// resetPassword(): transactional gate (returns the 400 invalid/expired response).
next = replaceOnce(
  next,
  `    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    if (!lockedProfiles[0] && !lockedAccounts[0]) {\n      await connection.rollback();\n      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });\n    }`,
  `    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const legacyBridgeEligible = !lockedProfiles[0] && !lockedAccounts[0] && await legacyIdentityExists(db, email);\n    if (!lockedProfiles[0] && !lockedAccounts[0] && !legacyBridgeEligible) {\n      await connection.rollback();\n      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });\n    }`,
  'resetPassword transactional identity gate',
);

// resetPassword(): materialize the profile only on valid, verified code consumption.
next = replaceOnce(
  next,
  `    const digest = passwordDigest(password);\n    await connection.query(\n      \`INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password)\n       VALUES(?,?,?,0)\n       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt),must_change_password=0\`,\n      [email, digest.hash, digest.salt],\n    );`,
  `    if (!lockedProfiles[0]) {\n      await ensureProfile(connection, email);\n    }\n    const digest = passwordDigest(password);\n    await connection.query(\n      \`INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password)\n       VALUES(?,?,?,0)\n       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt),must_change_password=0\`,\n      [email, digest.hash, digest.salt],\n    );`,
  'resetPassword profile materialization',
);

fs.writeFileSync(path, next, 'utf8');
console.log('[crewcheck:prepare] v14.4.00 legacy identity bridge applied.');
