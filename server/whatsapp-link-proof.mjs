// Shared completion of the existing authenticated link/start challenge. Caller
// supplies the same existing hashes/cipher and owns the bounded transaction.
export async function completeCanonicalWhatsAppLink(c, {phone, codeHash, phoneHash, phoneCipher}) {
  const [pending] = await c.query('SELECT email FROM crewcheck_whatsapp_link_codes WHERE code_hash=? AND expires_at>UTC_TIMESTAMP(3) LIMIT 1 FOR UPDATE', [codeHash]);
  if (pending.length !== 1 || !pending[0].email) return {linked: false};
  const email = pending[0].email;
  const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [email]);
  if (owners.length !== 1 || !owners[0].public_id) return {linked: false};
  const [existing] = await c.query('SELECT email,revoked_at FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE', [phoneHash]);
  if (existing[0]?.email && existing[0].email.toLowerCase() !== email.toLowerCase()) {
    if (existing[0].revoked_at === null) return {linked: false, conflict: true};
    await c.query('DELETE FROM crewcheck_whatsapp_links WHERE phone_hash=? AND revoked_at IS NOT NULL', [phoneHash]);
  }
  await c.query(`INSERT INTO crewcheck_whatsapp_links
    (email,phone_hash,phone_cipher,phone_last4,consent_concierge,consent_alerts,linked_at,revoked_at)
    VALUES(?,?,?,?,1,0,CURRENT_TIMESTAMP(3),NULL)
    ON DUPLICATE KEY UPDATE phone_hash=VALUES(phone_hash),phone_cipher=VALUES(phone_cipher),phone_last4=VALUES(phone_last4),
    consent_concierge=1,consent_alerts=0,revoked_at=NULL,linked_at=CURRENT_TIMESTAMP(3),updated_at=CURRENT_TIMESTAMP(3)`,
  [email, phoneHash, phoneCipher, phone.slice(-4)]);
  await c.query('DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?', [email]);
  return {linked: true, email};
}
