import {createHash} from 'node:crypto';
import {assertCanonicalWhatsAppStorage} from './infobip-whatsapp-preflight.mjs';

// mysql2's canonical pool uses dateStrings. Validate the complete DATETIME
// value rather than relying on SQL strict mode to reject zero/overflow dates.
function linkTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match || Number(value.slice(0,4)) < 1000) return NaN;
  const iso = match[1].replace(' ', 'T') + '.' + (match[2] || '').padEnd(3,'0') + 'Z';
  const result = Date.parse(iso);
  return Number.isFinite(result) && new Date(result).toISOString() === iso ? result : NaN;
}
const MAX_LINK_TIMESTAMP = Date.parse('9999-12-31T23:59:59.999Z');

// One bounded, opaque challenge fence per account generation in existing storage.
// It contains no phone, email, plaintext code or new cryptographic secret.
export const canonicalWhatsAppChallengeKey = publicId => 'crewcheck-whatsapp-challenge-v1:' +
  createHash('sha256').update(JSON.stringify(['whatsapp-challenge-owner-v1', publicId])).digest('hex');

export async function lockCanonicalWhatsAppOwner(c, email, publicId) {
  const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [email]);
  if (owners.length !== 1 || !publicId || owners[0].public_id !== publicId) throw Error('WHATSAPP_IDENTITY_CHANGED');
}

export async function startCanonicalWhatsAppChallenge(c, {email, publicId, codeHash}) {
  await assertCanonicalWhatsAppStorage(c);
  await lockCanonicalWhatsAppOwner(c, email, publicId);
  await c.query('DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?', [email]);
  await c.query(`INSERT INTO crewcheck_whatsapp_link_codes (email,code_hash,expires_at)
    VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE))`, [email, codeHash]);
  await c.query(`INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=CURRENT_TIMESTAMP(3)`,
  [canonicalWhatsAppChallengeKey(publicId), JSON.stringify({version: 1, codeHash})]);
}

export async function clearCanonicalWhatsAppChallenge(c, publicId) {
  if (publicId) await c.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?', [canonicalWhatsAppChallengeKey(publicId)]);
}

// Caller owns a bounded transaction. No upsert may update a competing phone's
// owner: full-column unique indexes arbitrate absent-row races at either isolation.
export async function completeCanonicalWhatsAppLink(c, {phone, codeHash, phoneHash, phoneCipher}) {
  await assertCanonicalWhatsAppStorage(c);
  const lookup = 'SELECT email FROM crewcheck_whatsapp_link_codes WHERE code_hash=? AND expires_at>UTC_TIMESTAMP(3) LIMIT 2';
  const [hint] = await c.query(lookup, [codeHash]);
  if (hint.length !== 1 || !hint[0].email) return {linked: false};
  const email = hint[0].email;
  const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [email]);
  if (owners.length !== 1 || !owners[0].public_id) return {linked: false};
  const [pending] = await c.query(lookup + ' FOR UPDATE', [codeHash]);
  if (pending.length !== 1 || pending[0].email !== email) return {linked: false};
  const key = canonicalWhatsAppChallengeKey(owners[0].public_id);
  const [fences] = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
  let fence;
  try { fence = typeof fences[0]?.payload === 'string' ? JSON.parse(fences[0].payload) : fences[0]?.payload; } catch {}
  // Pre-upgrade challenges deliberately expire closed; existing links survive.
  if (fences.length !== 1 || fence?.version !== 1 || fence.codeHash !== codeHash) return {linked: false};
  const [existing] = await c.query('SELECT email,revoked_at FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE', [phoneHash]);
  if (existing.length > 1) throw Error('WHATSAPP_LINK_INVARIANT');
  if (existing[0]?.email && existing[0].email !== email) {
    if (existing[0].revoked_at === null) return {linked: false, conflict: true};
    await c.query('DELETE FROM crewcheck_whatsapp_links WHERE phone_hash=? AND revoked_at IS NOT NULL', [phoneHash]);
  }
  const [owned] = await c.query('SELECT phone_hash,linked_at,updated_at FROM crewcheck_whatsapp_links WHERE email=? FOR UPDATE', [email]);
  if (owned.length > 1) throw Error('WHATSAPP_LINK_INVARIANT');
  const previous = owned.length ? Math.max(linkTimestamp(owned[0].linked_at),linkTimestamp(owned[0].updated_at)) : null;
  if (owned.length && (!Number.isFinite(previous) || previous >= MAX_LINK_TIMESTAMP)) throw Error('WHATSAPP_LINK_GENERATION');
  if (owned.length) {
    // Existing consumers use these fields as the binding generation, not a
    // freshness/credit clock. Advance at least one millisecond even if the DB
    // clock is fixed or moves backward, so same-phone and A->B->A cannot revive
    // an old queued binding. This never refreshes a grant or approval window.
    const [updated] = await c.query(`UPDATE crewcheck_whatsapp_links SET phone_hash=?,phone_cipher=?,phone_last4=?,
      consent_concierge=1,consent_alerts=0,revoked_at=NULL,
      linked_at=GREATEST(CURRENT_TIMESTAMP(3),TIMESTAMPADD(MICROSECOND,1000,linked_at),TIMESTAMPADD(MICROSECOND,1000,updated_at)),updated_at=linked_at
      WHERE email=? AND linked_at >= '1000-01-01 00:00:00.000' AND updated_at >= '1000-01-01 00:00:00.000'
        AND linked_at < '9999-12-31 23:59:59.999' AND updated_at < '9999-12-31 23:59:59.999'`, [phoneHash, phoneCipher, phone.slice(-4), email]);
    if (Number(updated?.affectedRows) !== 1) throw Error('WHATSAPP_LINK_GENERATION');
  } else {
    await c.query(`INSERT INTO crewcheck_whatsapp_links
      (email,phone_hash,phone_cipher,phone_last4,consent_concierge,consent_alerts,linked_at,revoked_at,updated_at)
      VALUES(?,?,?,?,1,0,CURRENT_TIMESTAMP(3),NULL,CURRENT_TIMESTAMP(3))`, [email, phoneHash, phoneCipher, phone.slice(-4)]);
  }
  const [written] = await c.query('SELECT email,phone_hash,revoked_at,linked_at,updated_at FROM crewcheck_whatsapp_links WHERE email=? OR phone_hash=? FOR UPDATE', [email, phoneHash]);
  if (written.length !== 1 || written[0].email !== email || written[0].phone_hash !== phoneHash || written[0].revoked_at !== null) throw Error('WHATSAPP_LINK_INVARIANT');
  const generation = linkTimestamp(written[0].linked_at);
  if (!Number.isFinite(generation) || generation !== linkTimestamp(written[0].updated_at) || (previous !== null && generation <= previous)) throw Error('WHATSAPP_LINK_GENERATION');
  const [unexpired] = await c.query(lookup + ' FOR UPDATE', [codeHash]);
  if (unexpired.length !== 1 || unexpired[0].email !== email) throw Error('WHATSAPP_CHALLENGE_EXPIRED');
  await c.query('DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?', [email]);
  await clearCanonicalWhatsAppChallenge(c, owners[0].public_id);
  return {linked: true, email};
}
