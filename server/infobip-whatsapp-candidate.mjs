import { createHash, timingSafeEqual } from 'node:crypto';

// Review candidate only. No production router imports this module. Environment
// variables cannot enable it; no transport, credentials, DDL or logs live here.
export const INFOBIP_WHATSAPP_RELEASE_ENABLED = false;
export const INFOBIP_INBOUND_MAX_AGE_MS = 48 * 60 * 60_000;
export const INFOBIP_REPLY_MAX_AGE_MS = 15 * 60_000;
export function infobipWhatsAppReleaseResponse() {
  return { status: 503, code: 'INFOBIP_WHATSAPP_DISABLED' };
}

const phone = value => typeof value === 'string' && /^[1-9]\d{7,14}$/.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const equal = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const fail = code => { throw new Error(code); };

// Basic is documented for notification profiles. This is deliberately separate
// from Meta HMAC and outbound API-key authentication. No credential is created.
export function verifyInfobipBasic(rawHeaders, username, password) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 ||
      typeof username !== 'string' || !username || /[:\r\n]/.test(username) ||
      typeof password !== 'string' || password.length < 32 || /[\r\n]/.test(password)) return false;
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (String(rawHeaders[i]).toLowerCase() === 'authorization') values.push(rawHeaders[i + 1]);
  }
  return values.length === 1 && typeof values[0] === 'string' &&
    equal(values[0], `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`);
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return NaN;
  return Date.parse(value.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
}

export function infobipDeliveryState(status) {
  // API acceptance / pending is never evidence of device delivery.
  if (status?.groupId === 3 && status?.groupName === 'DELIVERED' &&
      status?.id === 5 && status?.name === 'DELIVERED_TO_HANDSET') return 'delivered';
  return 'unconfirmed';
}

function parseInbound(rawBody, sender, now) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 65_536) fail('BODY');
  const payload = JSON.parse(rawBody.toString('utf8'));
  if (!payload || !Array.isArray(payload.results) || !payload.results.length || payload.results.length > 20) fail('SHAPE');
  return payload.results.map(item => {
    const at = timestamp(item?.receivedAt);
    if (item?.integrationType !== 'WHATSAPP' || item?.to !== sender ||
        !phone(item?.from) || !id(item?.messageId) || item?.message?.type !== 'TEXT' ||
        typeof item?.message?.text !== 'string' || !item.message.text.trim() ||
        item.message.text.length > 4_000 || !Number.isFinite(at) ||
        at > now + 30_000 || now - at > INFOBIP_INBOUND_MAX_AGE_MS ||
        Object.hasOwn(item, 'status') || Object.hasOwn(item, 'seenAt') ||
        (item.contact?.phoneNumber !== undefined && item.contact.phoneNumber !== item.from)) fail('EVENT');
    // A BSUID is not coerced into a phone number; username/name are never identity.
    return Object.freeze({ provider: 'infobip', sender, recipient: item.from,
      messageId: item.messageId, receivedAt: at, text: item.message.text });
  });
}

function linkStamp(link, event) {
  if (!link || typeof link.accountId !== 'string' || !link.accountId ||
      typeof link.revision !== 'string' || !link.revision ||
      link.provider !== 'infobip' || link.sender !== event.sender ||
      link.recipient !== event.recipient || link.consentConcierge !== true || link.revoked !== false) return '';
  return JSON.stringify([link.accountId, link.revision, link.provider, link.sender, link.recipient]);
}

// OFFLINE entrypoint. The injected store MUST supply serializable transactions:
// claim+enqueue commit together, unique claims survive restarts, failures roll
// back, and lookupLink uses the same transaction. No production store is supplied.
// Candidate retry policy: 48h (general reporting docs describe 41h30; application
// to this inbound profile remains unverified). Reply freshness stays 15m.
export function createOfflineInfobipReceiver({ sender, username, password, store, now = Date.now }) {
  if (!phone(sender) ||
      typeof store?.transaction !== 'function' || typeof now !== 'function') fail('CONFIGURATION');
  // Stable dedup namespace is independent of credential/audit-key rotation.
  // This hash is an internal uniqueness key, NOT a privacy/anonymization claim.
  const eventKey = event => createHash('sha256')
    .update(JSON.stringify(['infobip-inbound-v1', sender, event.messageId])).digest('hex');
  return async ({ method, rawHeaders, rawBody }) => {
    if (method !== 'POST') return { status: 405, code: 'METHOD' };
    if (!verifyInfobipBasic(rawHeaders, username, password)) return { status: 401, code: 'AUTH' };
    let events;
    try { events = parseInbound(rawBody, sender, now()); }
    catch { return { status: 400, code: 'INVALID_EVENT' }; }
    let accepted = 0, duplicates = 0, denied = 0;
    try {
      for (const event of events) {
        const result = await store.transaction(async tx => {
          const stamp = linkStamp(await tx.lookupLink(event), event);
          if (!stamp) return 'denied';
          const digest = createHash('sha256').update(JSON.stringify(event)).digest('hex');
          const claim = await tx.claim(eventKey(event), digest);
          if (claim === 'duplicate') return 'duplicate';
          if (claim !== 'new') fail('CLAIM');
          // A binding change while claiming must roll the transaction back.
          if (linkStamp(await tx.lookupLink(event), event) !== stamp) fail('BINDING_CHANGED');
          await tx.enqueue({ ...event, bindingStamp: stamp, eventKey: eventKey(event) });
          return 'accepted';
        });
        if (result === 'accepted') accepted++;
        else if (result === 'duplicate') duplicates++;
        else if (result === 'denied') denied++;
        else fail('TRANSACTION');
      }
      // ACK only after durable transaction promises resolve successfully.
      return { status: 200, code: 'QUEUED', accepted, duplicates, denied };
    } catch { return { status: 503, code: 'STORE_UNAVAILABLE' }; }
  };
}

// Produces an offline proposal, never sends it. The eventual sender must recheck
// binding+consent under its send lock; this return value is not an authorization
// token and must never be passed directly to Meta's existing transport.
export async function prepareOfflineInfobipReply(job, { lookupLink, concierge, now = Date.now }) {
  try {
    if (!job || job.provider !== 'infobip' || !phone(job.sender) || !phone(job.recipient) ||
        !id(job.messageId) || typeof job.text !== 'string' || !job.text.trim() ||
        !Number.isFinite(job.receivedAt) || now() - job.receivedAt > INFOBIP_REPLY_MAX_AGE_MS ||
        job.receivedAt > now() + 30_000) return null;
    const initial = await lookupLink(job);
    const stamp = linkStamp(initial, job);
    if (!stamp || stamp !== job.bindingStamp) return null;
    const reply = await concierge({ accountId: initial.accountId, text: job.text });
    if (typeof reply !== 'string' || !reply.trim() || reply.length > 4_000 ||
        linkStamp(await lookupLink(job), job) !== stamp || now() - job.receivedAt > INFOBIP_REPLY_MAX_AGE_MS) return null;
    return Object.freeze({ provider: 'infobip', sender: job.sender, recipient: job.recipient,
      replyToMessageId: job.messageId, bindingStamp: stamp, text: reply });
  } catch { return null; }
}
