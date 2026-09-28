function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`v14.3.99 anchor not found: ${label}`);
  const next = source.replace(anchor, replacement);
  if (next === source) throw new Error(`v14.3.99 replacement failed: ${label}`);
  return next;
}

export function patchAuthResetArtifactBridge(source) {
  if (source.includes('connection: providedConnection = null') && source.includes("delivery_state='accepted'")) return source;

  const helperStart = source.indexOf('async function issueAuthArtifact(db, {');
  const helperEnd = source.indexOf('\nasync function consumeAuthArtifact', helperStart);
  if (helperStart < 0 || helperEnd < 0) throw new Error('v14.3.99 auth artifact helper boundaries not found');

  let helper = source.slice(helperStart, helperEnd);
  helper = replaceOnce(
    helper,
    'async function issueAuthArtifact(db, { email, purpose, ttlMinutes = 15, includeFallbackCode = true, requestedIpHash = null }) {',
    'async function issueAuthArtifact(db, { email, purpose, ttlMinutes = 15, includeFallbackCode = true, requestedIpHash = null, connection: providedConnection = null }) {',
    'artifact helper signature',
  );
  helper = replaceOnce(
    helper,
    `  const connection = await db.getConnection();\n  try {\n    await connection.beginTransaction();`,
    `  const ownsConnection = !providedConnection;\n  const connection = providedConnection || await db.getConnection();\n  try {\n    if (ownsConnection) await connection.beginTransaction();`,
    'artifact helper connection ownership',
  );
  helper = replaceOnce(helper, '    await connection.commit();\n    return { id, token, code, correlationId, expiresAt };', '    if (ownsConnection) await connection.commit();\n    return { id, token, code, correlationId, expiresAt };', 'artifact helper commit ownership');
  helper = replaceOnce(helper, '    try { await connection.rollback(); } catch {}\n    throw error;\n  } finally {\n    connection.release();', '    if (ownsConnection) { try { await connection.rollback(); } catch {} }\n    throw error;\n  } finally {\n    if (ownsConnection) connection.release();', 'artifact helper cleanup ownership');

  let next = `${source.slice(0, helperStart)}${helper}${source.slice(helperEnd)}`;
  next = replaceOnce(
    next,
    `  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');\n  const resetId = crypto.randomUUID();\n  const expiresAt = new Date(Date.now() + minutes * 60_000);`,
    '  let resetArtifact = null;',
    'legacy reset identifiers',
  );
  next = replaceOnce(
    next,
    `    await connection.query(\n      'UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL',\n      [email],\n    );`,
    `    resetArtifact = await issueAuthArtifact(db, {\n      email,\n      purpose: 'password_reset',\n      ttlMinutes: minutes,\n      includeFallbackCode: true,\n      connection,\n    });\n+    await connection.query(\n      'UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL',\n      [email],\n    );`,
    'artifact issuance in reset transaction',
  );
  next = replaceOnce(
    next,
    '[resetId, email, resetHash(email, code), expiresAt, JSON.stringify({ requested: delivery })],',
    '[resetArtifact.id, email, resetHash(email, resetArtifact.code), resetArtifact.expiresAt, JSON.stringify({ requested: delivery })],',
    'legacy reset shares artifact code',
  );
  next = replaceOnce(
    next,
    `  if (!issued) return sendJson(res, 200, generic);\n\n  const link = await telegramLink(db, email);`,
    `  if (!issued || !resetArtifact) return sendJson(res, 200, generic);\n\n  const code = resetArtifact.code;\n  const resetId = resetArtifact.id;\n  const link = await telegramLink(db, email);`,
    'reset artifact values after commit',
  );
  next = replaceOnce(
    next,
    `    channels.email = mail.ok;`,
    `    const providerAccepted = Boolean(mail.ok && mail.sendPaused !== true);\n    channels.email = providerAccepted;\n    if (providerAccepted) {\n      const deliveryProvider = cleanText(mail.provider || 'unknown', 40).toLowerCase();\n      const deliveryMessageId = cleanText(mail.messageId || '', 160) || null;\n      await db.query(\n        \`UPDATE crewcheck_platform_auth_artifacts\n         SET delivery_state='accepted',delivery_provider=?,delivery_message_id=?\n         WHERE id=? AND purpose='password_reset' AND delivery_state='created'\`,\n        [deliveryProvider, deliveryMessageId, resetArtifact.id],\n      );\n    }`,
    'provider acceptance persistence',
  );
  return next;
}
