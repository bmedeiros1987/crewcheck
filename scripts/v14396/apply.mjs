import fs from 'node:fs';

const path = 'server/v139/auth.mjs';
const source = fs.readFileSync(path, 'utf8');

const placeholderBlock = `  if (!accounts[0]) {\n    const placeholder = passwordDigest(crypto.randomBytes(32).toString('base64url'));\n    await ensureProfile(db, email);\n    await db.query(\n      'INSERT IGNORE INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password) VALUES(?,?,?,1)',\n      [email, placeholder.hash, placeholder.salt],\n    );\n  }\n\n`;

const requestLockOld = `    await connection.beginTransaction();\n    await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n`;
const requestLockNew = `    await connection.beginTransaction();\n    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    if (!lockedProfiles[0] && !lockedAccounts[0]) {\n      await connection.rollback();\n      return sendJson(res, 200, generic);\n    }\n`;

const resetLockOld = `    await connection.beginTransaction();\n    await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [rows] = await connection.query(\n`;
const resetLockNew = `    await connection.beginTransaction();\n    const [lockedProfiles] = await connection.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    const [lockedAccounts] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);\n    if (!lockedProfiles[0] && !lockedAccounts[0]) {\n      await connection.rollback();\n      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });\n    }\n    const [rows] = await connection.query(\n`;

const accountUpdateOld = `    await connection.query(\n      'UPDATE crewcheck_platform_accounts SET password_hash=?,password_salt=?,must_change_password=0 WHERE email=?',\n      [digest.hash, digest.salt, email],\n    );\n`;
const accountUpdateNew = `    await connection.query(\n      \`INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password)\n       VALUES(?,?,?,0)\n       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt),must_change_password=0\`,\n      [email, digest.hash, digest.salt],\n    );\n`;

const alreadyApplied = source.includes('const [lockedProfiles] = await connection.query')
  && source.includes('ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)')
  && !source.includes('const placeholder = passwordDigest');

if (alreadyApplied) {
  console.log('[crewcheck:prepare] v14.3.96 auth profile-only recovery already applied.');
  await import('../v14397/apply.mjs');
  process.exit(0);
}

for (const [label, anchor] of [
  ['placeholder credential block', placeholderBlock],
  ['request reset identity lock', requestLockOld],
  ['reset password identity lock', resetLockOld],
  ['reset password account update', accountUpdateOld],
]) {
  if (!source.includes(anchor)) throw new Error(`v14.3.96 anchor not found: ${label}`);
}

const next = source
  .replace(placeholderBlock, '')
  .replace(requestLockOld, requestLockNew)
  .replace(resetLockOld, resetLockNew)
  .replace(accountUpdateOld, accountUpdateNew);

fs.writeFileSync(path, next, 'utf8');
console.log('[crewcheck:prepare] v14.3.96 auth profile-only recovery applied.');
await import('../v14397/apply.mjs');
