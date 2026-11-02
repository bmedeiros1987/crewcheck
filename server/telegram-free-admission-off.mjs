import { resolvePlatformEntitlement } from './platform-entitlement.mjs';

// Unwired capability. No production importer, environment switch, SQL or transport.
export const TELEGRAM_FREE_ADMISSION_SHIPPING = false;
export const TELEGRAM_FREE_ADMISSION_LIMITS = Object.freeze({
  ownerInFlight: 1, burst: 3, burstMs: 10_000, minute: 6, minuteMs: 60_000,
  owners: 2_000, processInFlight: 2, noticeMs: 10_000, noticeBurst: 3, evidenceMs: 30_000,
});
const limits = TELEGRAM_FREE_ADMISSION_LIMITS;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 190 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const email = value => identifier(value) && value === value.toLowerCase() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const current = authority => {
  try {
    const result = authority.isCurrent();
    // Reject async authority checks, but consume their rejection so a malformed
    // host predicate cannot leave an unhandled rejection after refusal.
    if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
    return result === true;
  } catch { return false; }
};
const refused = (reason, retryAfterMs = 0, noticeAllowed = false) => Object.freeze({ allowed: false, reason, retryAfterMs, noticeAllowed });

// authority is an internal host capability, NEVER a request body or client plan.
// Its owner is canonical across delegates. actor remains separate for ACL/delivery.
// operation must be an already-authorized ordinary read, not sender/medical dispatch.
export function createTelegramFreeAdmission({ enabled = TELEGRAM_FREE_ADMISSION_SHIPPING,
  now = () => performance.now(), wallNow = Date.now } = {}) {
  const owners = new Map();
  let inFlight = 0, lastNow = -Infinity, lastWall = -Infinity, globalNoticeAt = -Infinity;
  let noticeTimes = [];
  function stamp() {
    let value;
    try { value = now(); } catch { return null; }
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - limits.minuteMs || value < lastNow) return null;
    lastNow = value;
    return value;
  }
  function prune(at) {
    for (const [key, entry] of owners) {
      entry.times = entry.times.filter(time => time > at - limits.minuteMs);
      // A completed long read may leave only a recent denial notice to retain.
      if (!entry.active && !entry.times.length && at - entry.noticeAt >= limits.noticeMs) owners.delete(key);
    }
  }
  function deny(reason, at, entry, retryAfterMs = 1_000) {
    noticeTimes = noticeTimes.filter(time => time > at - limits.noticeMs);
    const previous = entry ? entry.noticeAt : globalNoticeAt;
    const noticeAllowed = at - previous >= limits.noticeMs && noticeTimes.length < limits.noticeBurst;
    if (noticeAllowed) {
      noticeTimes.push(at);
      if (entry) entry.noticeAt = at;
      else globalNoticeAt = at;
    }
    return refused(reason, retryAfterMs, noticeAllowed);
  }
  function paid(authority) {
    // No cache is created. Only bounded-age evidence supplied by the canonical
    // host can exempt free limits; absence, clock failure or mismatch is free.
    const evidence = authority.entitlement;
    let at;
    try { at = wallNow(); } catch { return false; }
    if (!Number.isSafeInteger(at) || at < 0 || at < lastWall) return false;
    lastWall = at;
    if (!evidence || !Number.isSafeInteger(evidence.observedAt) || evidence.observedAt < 0
      || evidence.observedAt > at || at - evidence.observedAt >= limits.evidenceMs
      || evidence.profile?.email !== authority.owner.email
      || evidence.profile?.public_id !== authority.owner.publicId
      || evidence.subscription && evidence.subscription.email !== authority.owner.email) return false;
    try {
      return resolvePlatformEntitlement(evidence.profile, evidence.subscription || null, { now: at }).premiumAccess === true;
    } catch { return false; }
  }
  async function run(authority, operation) {
    if (enabled !== true) return refused('disabled');
    if (typeof operation !== 'function' || !authority || authority.channel !== 'telegram'
      || authority.lane !== 'ordinary-read' || authority.authorized !== true
      || !email(authority.owner?.email) || !identifier(authority.owner?.publicId)
      || !['owner', 'visitor'].includes(authority.actor?.kind) || !identifier(authority.actor?.id)
      || typeof authority.isCurrent !== 'function' || !current(authority)) return refused('authority_required');
    // Capture before awaits: relinking or changing actor does not reset owner quota.
    const key = JSON.stringify([authority.owner.email, authority.owner.publicId]);
    const at = stamp();
    if (at === null) return refused('clock_unavailable');
    prune(at);
    const entry = owners.get(key);
    if (entry?.active) return deny('owner_busy', at, entry);
    const premium = paid(authority);
    if (premium) {
      // Only the free lane is metered. This is not a new paid entitlement.
      const value = await operation();
      return current(authority) ? Object.freeze({ allowed: true, policy: 'paid', value }) : refused('authority_changed');
    }
    if (entry) {
      const burst = entry.times.filter(time => time > at - limits.burstMs);
      const burstWait = burst.length >= limits.burst ? burst[0] + limits.burstMs - at : 0;
      const minuteWait = entry.times.length >= limits.minute ? entry.times[0] + limits.minuteMs - at : 0;
      if (burstWait || minuteWait) return deny('cooldown', at, entry, Math.max(burstWait, minuteWait));
    }
    if (inFlight >= limits.processInFlight) return deny('process_busy', at, entry);
    if (!entry && owners.size >= limits.owners) return deny('capacity', at, null);
    const held = entry || { times: [], active: false, noticeAt: -Infinity };
    held.times.push(at);
    held.active = true;
    owners.set(key, held);
    inFlight++;
    try {
      const value = await operation();
      return current(authority) ? Object.freeze({ allowed: true, policy: 'free', value }) : refused('authority_changed');
    } finally {
      // No detached race/deadline releases capacity while work still runs.
      held.active = false;
      inFlight--;
    }
  }
  function statistics() {
    return Object.freeze({ owners: owners.size, inFlight,
      maxRetainedTimestamps: Math.max(0, ...Array.from(owners.values(), entry => entry.times.length)) });
  }
  return Object.freeze({ run, statistics });
}
