import crypto from 'node:crypto';

// Receipt acceptance is separate from entitlement reconciliation. No provider I/O,
// owner inference, subscription creation, timer, automatic retry or runtime DDL.
const PAID = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const STATUS = new Map([
  ['PAYMENT_CONFIRMED', 'active'], ['PAYMENT_RECEIVED', 'active'],
  ['PAYMENT_OVERDUE', 'past_due'], ['PAYMENT_REFUNDED', 'refunded'],
  ['PAYMENT_REFUND_IN_PROGRESS', 'refunded'], ['PAYMENT_DELETED', 'canceled'],
  ['SUBSCRIPTION_DELETED', 'canceled'], ['SUBSCRIPTION_INACTIVATED', 'canceled'],
]);
const INFORMATIONAL = new Set([
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_BANK_SLIP_VIEWED',
  'PAYMENT_CHECKOUT_VIEWED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED',
]);
const FINAL = new Set(['processed', 'ignored', 'stale']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const opaque = (value, max = 180) => typeof value === 'string' && value.length > 0
  && value.length <= max && /^[\x21-\x7e]+$/.test(value) ? value : null;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + 'T12:00:00.000Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}
// Provider-native wall-clock stamp, compared lexically; no host timezone inference.
function stamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  return day(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24
    && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60 ? value : null;
}
export function asaasEnvelope(body) {
  if (!object(body) || !opaque(body.id) || typeof body.event !== 'string'
    || !/^[A-Z][A-Z0-9_]{0,99}$/.test(body.event)) return null;
  const payment = object(body.payment) ? body.payment : {};
  const subscription = object(body.subscription) ? body.subscription.id : body.subscription;
  const paymentRef = opaque(payment.subscription);
  const subscriptionRef = opaque(subscription);
  return {
    eventId: body.id, eventName: body.event, eventTime: stamp(body.dateCreated),
    subscriptionRef: paymentRef || subscriptionRef,
    conflictingRefs: Boolean(paymentRef && subscriptionRef && paymentRef !== subscriptionRef),
    // Only fields needed for a later explicit retry. Never persist the original body,
    // customer, externalReference, email, value, card, token, URLs or credentials.
    paymentId: opaque(payment.id), paymentStatus: opaque(payment.status, 40),
    paidDate: day(payment.confirmedDate) || day(payment.clientPaymentDate) || day(payment.paymentDate),
  };
}
async function settle(client, eventId, disposition, reason, fundedPeriodEnd = null) {
  await client.query('UPDATE crewcheck_asaas_webhook_inbox SET disposition=$2,reason=$3,funded_period_end=$4,attempts=attempts+1,updated_at=NOW(3) WHERE event_id=$1', [eventId, disposition, reason, fundedPeriodEnd]);
  return { disposition, reason };
}
async function lockSubscription(client, ref) {
  if (!ref) return;
  await client.query('INSERT INTO crewcheck_asaas_subscription_locks(subscription_ref) VALUES($1) ON DUPLICATE KEY UPDATE subscription_ref=subscription_ref', [ref]);
  await client.query('SELECT subscription_ref FROM crewcheck_asaas_subscription_locks WHERE subscription_ref=$1 FOR UPDATE', [ref]);
}
async function applyReceipt(client, event, { legacyReceipt = false, now = Date.now } = {}) {
  const end = (state, reason) => settle(client, event.eventId, state, reason);
  if (legacyReceipt) return end('quarantined', 'legacy_receipt_unverified');
  if (INFORMATIONAL.has(event.eventName)) return end('ignored', 'informational_event');
  const status = STATUS.get(event.eventName);
  if (!status) return end('quarantined', event.eventName === 'SUBSCRIPTION_REACTIVATED' ? 'payment_evidence_required' : 'unsupported_event');
  if (event.conflictingRefs) return end('quarantined', 'conflicting_subscription_references');
  if (!event.subscriptionRef) return end('quarantined', 'missing_subscription_reference');
  if (!event.eventTime) return end('quarantined', 'invalid_event_time');
  const found = await client.query("SELECT * FROM crewcheck_platform_subscriptions WHERE provider='asaas' AND provider_ref=$1 LIMIT 2 FOR UPDATE", [event.subscriptionRef]);
  if (!found.rows.length) return end('quarantined', 'subscription_not_reconciled');
  if (found.rows.length !== 1) return end('quarantined', 'ambiguous_subscription');
  const subscription = found.rows[0];
  // Legacy provider_ref uses a case-insensitive MySQL collation; provider ids do not.
  if (subscription.provider_ref !== event.subscriptionRef || subscription.provider !== 'asaas')
    return end('quarantined', 'subscription_reference_mismatch');
  if (!['premium_monthly', 'premium_annual'].includes(subscription.plan)) return end('quarantined', 'unsupported_plan');
  if (subscription.metadata != null && !object(subscription.metadata)) return end('quarantined', 'invalid_subscription_metadata');
  const metadata = subscription.metadata || {};
  const previousTime = stamp(metadata.lastAsaasEventTime);
  if (metadata.lastAsaasEventId && !previousTime) return end('quarantined', 'legacy_order_unverified');
  if (previousTime && event.eventTime < previousTime) return end('stale', 'older_event');
  if (previousTime === event.eventTime) return end('quarantined', 'ambiguous_event_order');
  if (event.eventName.startsWith('PAYMENT_') && !event.paymentId) return end('quarantined', 'missing_payment_reference');
  if (!PAID.has(event.eventName) && event.paymentId && metadata.lastAsaasPaymentId
    && metadata.lastAsaasPaymentId !== event.paymentId) return end('quarantined', 'different_payment_requires_review');
  let periodEnd = subscription.current_period_end;
  if (PAID.has(event.eventName)) {
    // Both ingress and retry hold the same reference lock. A durable later orphan
    // must not be bypassed merely because subscription metadata is still empty.
    const pending = await client.query("SELECT event_id FROM crewcheck_asaas_webhook_inbox WHERE subscription_ref=$1 AND event_id<>$2 AND disposition IN ('received','quarantined') AND (event_time IS NULL OR event_time >= $3) LIMIT 1 FOR UPDATE", [event.subscriptionRef, event.eventId, event.eventTime]);
    if (pending.rows.length) return end('quarantined', 'later_receipt_requires_reconciliation');
    if (!['CONFIRMED', 'RECEIVED'].includes(event.paymentStatus) || !event.paidDate
      || event.paidDate > event.eventTime.slice(0, 10)) return end('quarantined', 'invalid_payment_evidence');
    const reversed = await client.query("SELECT event_id FROM crewcheck_asaas_webhook_inbox WHERE subscription_ref=$1 AND payment_ref=$2 AND event_id<>$3 AND event_name IN ('PAYMENT_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_DELETED') LIMIT 1 FOR UPDATE", [event.subscriptionRef, event.paymentId, event.eventId]);
    if (reversed.rows.length) return end('quarantined', 'terminal_payment_requires_review');
    if (['refunded', 'canceled'].includes(subscription.status) && metadata.lastAsaasPaymentId === event.paymentId)
      return end('quarantined', 'terminal_payment_requires_review');
    if (metadata.lastAsaasPaidDate && event.paidDate < metadata.lastAsaasPaidDate
      && event.paymentId !== metadata.lastAsaasPaidPaymentId) return end('quarantined', 'older_payment_cycle_requires_review');
    const date = new Date(event.paidDate + 'T12:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + (subscription.plan === 'premium_annual' ? 366 : 31));
    const candidate = date.toISOString().slice(0, 23).replace('T', ' ');
    const funding = await client.query("SELECT funded_period_end FROM crewcheck_asaas_webhook_inbox WHERE subscription_ref=$1 AND payment_ref=$2 AND disposition='processed' AND funded_period_end IS NOT NULL ORDER BY funded_period_end DESC LIMIT 1 FOR UPDATE", [event.subscriptionRef, event.paymentId]);
    const samePaymentEnd = funding.rows[0]?.funded_period_end;
    if (samePaymentEnd && candidate > String(samePaymentEnd)) return end('quarantined', 'payment_period_changed_requires_review');
    if (!samePaymentEnd && periodEnd && !metadata.lastAsaasPaidPaymentId) return end('quarantined', 'unverified_existing_period');
    // Preserve only funding proven for THIS payment, never the global maximum of
    // a different/refunded payment. Same-day expiry is conservatively held.
    periodEnd = samePaymentEnd || candidate;
    if (String(periodEnd).slice(0, 10) <= event.eventTime.slice(0, 10)) return end('quarantined', 'expired_payment_period');
    if (Date.parse(String(periodEnd).replace(' ', 'T') + 'Z') <= now()) return end('quarantined', 'expired_payment_period');
  } else {
    // A terminal/debit event cannot leave a spendable paid window to be borrowed.
    periodEnd = null;
  }
  const profile = await client.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [subscription.email]);
  if (profile.rows.length !== 1) return end('quarantined', 'profile_not_reconciled');
  const nextMetadata = { ...metadata, lastAsaasEvent: event.eventName, lastAsaasEventId: event.eventId,
    lastAsaasEventTime: event.eventTime, ...(event.paymentId ? { lastAsaasPaymentId: event.paymentId } : {}),
    ...(PAID.has(event.eventName) ? {lastAsaasPaidPaymentId:event.paymentId,lastAsaasPaidDate:metadata.lastAsaasPaidPaymentId === event.paymentId ? metadata.lastAsaasPaidDate || event.paidDate : event.paidDate} : {}) };
  const changed = await client.query("UPDATE crewcheck_platform_subscriptions SET status=$3,current_period_end=$4,metadata=$5,updated_at=NOW(3) WHERE email=$1 AND provider='asaas' AND provider_ref=$2", [subscription.email, event.subscriptionRef, status, periodEnd, JSON.stringify(nextMetadata)]);
  if (changed.rowCount !== 1) throw new Error('ASAAS_SUBSCRIPTION_CHANGED');
  if (profile.rows[0].plan !== 'premium_unlimited')
    await client.query('UPDATE crewcheck_platform_profiles SET plan=$2,updated_at=NOW(3) WHERE email=$1', [subscription.email, status === 'active' ? subscription.plan : 'free']);
  return settle(client, event.eventId, 'processed', 'matched_existing_subscription', PAID.has(event.eventName) ? periodEnd : null);
}
async function transaction(db, action) {
  const client = await db.connect();
  let began = false;
  try {
    await client.query('BEGIN'); began = true;
    const result = await action(client);
    await client.query('COMMIT'); began = false;
    return result;
  } catch (error) {
    if (began) { try { await client.query('ROLLBACK'); } catch { client.discard?.(); } }
    throw error;
  } finally { client.release(); }
}
export async function receiveAsaasEvent(db, body, { now = Date.now } = {}) {
  const event = asaasEnvelope(body);
  if (!event) return { status: 400, body: { ok: false, code: 'ASAAS_EVENT_INVALID' } };
  const hash = digest(JSON.stringify(canonical(body)));
  return transaction(db, async client => {
    await lockSubscription(client, event.subscriptionRef);
    await client.query(`INSERT INTO crewcheck_asaas_webhook_inbox(event_id,payload_hash,event_name,subscription_ref,payment_ref,event_time,decision_payload,disposition,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,'received','received') ON DUPLICATE KEY UPDATE event_id=event_id`,
    [event.eventId, hash, event.eventName, event.subscriptionRef, event.paymentId, event.eventTime, JSON.stringify(event)]);
    const receipt = (await client.query('SELECT * FROM crewcheck_asaas_webhook_inbox WHERE event_id=$1 FOR UPDATE', [event.eventId])).rows[0];
    if (!receipt || receipt.payload_hash !== hash) return { status: 409, body: { ok: false, code: 'ASAAS_EVENT_ID_CONFLICT' } };
    // Do not infer completion from the old precommitted hash-only dedupe table.
    if (receipt.disposition !== 'received') return { status: 200, body: { ok: true, accepted: true, duplicate: true,
      reconciled: receipt.disposition === 'processed', disposition: receipt.disposition, reason: receipt.reason } };
    const legacy = await client.query("SELECT 1 FROM crewcheck_platform_webhook_events WHERE provider='asaas' AND event_id=$1 LIMIT 1", [event.eventId]);
    const result = await applyReceipt(client, event, { legacyReceipt: Boolean(legacy.rows[0]), now });
    return { status: 200, body: { ok: true, accepted: true, reconciled: result.disposition === 'processed', ...result } };
  });
}
// Explicit operator operation, intentionally not exposed by an HTTP route, timer or
// checkout callback. Retry only after local ownership/correlation evidence is repaired.
// Never creates a subscription, accepts an owner/plan, or calls the provider.
export async function retryAsaasReceipt(db, eventId, { now = Date.now } = {}) {
  if (!opaque(eventId)) throw new Error('ASAAS_EVENT_INVALID');
  const observed = (await db.query('SELECT * FROM crewcheck_asaas_webhook_inbox WHERE event_id=$1', [eventId])).rows[0];
  if (!observed) return { disposition: 'missing', reason: 'receipt_not_found' };
  return transaction(db, async client => {
    await lockSubscription(client, observed.subscription_ref);
    const receipt = (await client.query('SELECT * FROM crewcheck_asaas_webhook_inbox WHERE event_id=$1 FOR UPDATE', [eventId])).rows[0];
    if (!receipt) return { disposition: 'missing', reason: 'receipt_not_found' };
    if (receipt.subscription_ref !== observed.subscription_ref) throw new Error('ASAAS_RECEIPT_CHANGED');
    if (FINAL.has(receipt.disposition)) return { disposition: receipt.disposition, reason: receipt.reason };
    if (!['subscription_not_reconciled', 'profile_not_reconciled', 'later_receipt_requires_reconciliation'].includes(receipt.reason))
      return { disposition: receipt.disposition, reason: receipt.reason };
    const event = typeof receipt.decision_payload === 'string' ? JSON.parse(receipt.decision_payload) : receipt.decision_payload;
    if (!object(event) || event.eventId !== receipt.event_id || event.subscriptionRef !== receipt.subscription_ref
      || event.paymentId !== receipt.payment_ref || event.eventName !== receipt.event_name || event.eventTime !== receipt.event_time) throw new Error('ASAAS_RECEIPT_INVALID');
    return applyReceipt(client, event, { now });
  });
}
// Existing admin authority, aggregate observations only. No event ids, refs or payloads.
export async function asaasInboxSummary(db) {
  const result = await db.query('SELECT disposition,reason,COUNT(*) AS count,MIN(received_at) AS oldestReceivedAt FROM crewcheck_asaas_webhook_inbox GROUP BY disposition,reason ORDER BY disposition,reason');
  return { ok: true, observational: true, automaticReplay: false, groups: result.rows };
}
