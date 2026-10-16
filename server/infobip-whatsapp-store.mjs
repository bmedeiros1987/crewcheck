import { createHash, createHmac, randomUUID } from 'node:crypto';
import { parseJsonColumn } from './v139/common.mjs';
import { sealSubscription as seal, openSubscription as open } from './web-push/installationRegistry.mjs';
import { prepareOfflineInfobipReply, INFOBIP_REPLY_MAX_AGE_MS, INFOBIP_WHATSAPP_RELEASE_ENABLED } from './infobip-whatsapp-candidate.mjs';

// Reuse the existing pool interface and state table. No pool creation, DDL,
// auto-migration, polling worker or runtime registration occurs in this module.
const PREFIX = 'crewcheck-infobip-inbound-v1:';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const phone = value => typeof value === 'string' && /^[1-9]\d{7,14}$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = () => { throw Error('INFOBIP_STATE_UNAVAILABLE'); };
export const infobipGrantKey = (sender, phoneHash) => `crewcheck-infobip-grant-v1:${hash([sender, phoneHash])}`;
const jobKey = key => hex(key) ? PREFIX + key : error();
const aad = key => ['crewcheck-infobip-state-v1', key];
const revision = link => JSON.stringify([String(link.linked_at || ''), String(link.updated_at || '')]);
const fresh = (job, now) => Number.isFinite(job?.receivedAt) && job.receivedAt <= now + 30_000 && now - job.receivedAt <= INFOBIP_REPLY_MAX_AGE_MS;
const stamp = link => link && JSON.stringify([link.accountId, link.revision, link.provider, link.sender, link.recipient]);

export function createInfobipSqlStore({ db, sender, encryptionKey, linkHashKey, now = Date.now }) {
  if (!db?.getConnection || !phone(sender) || !Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32 ||
      typeof linkHashKey !== 'string' || linkHashKey.length < 32) error();
  // Copy key bytes; caller mutation must not switch the cryptographic context.
  const key = Buffer.from(encryptionKey);
  const lockState = async (c, stateKey) => {
    const [rows] = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [stateKey]);
    return parseJsonColumn(rows[0]?.payload, null);
  };
  const save = async (c, stateKey, value) => {
    const [result] = await c.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify(value), stateKey]);
    if (result.affectedRows !== 1) error();
  };
  const loadJob = (state, stateKey) => {
    if (state?.v !== 1 || !state.sealed) error();
    const job = open(state.sealed, key, aad(stateKey));
    if (job.provider !== 'infobip' || job.sender !== sender || jobKey(job.eventKey) !== stateKey ||
        hash(['infobip-inbound-v1', sender, job.messageId]) !== job.eventKey) error();
    return job;
  };
  async function lookupLink(c, event) {
    if (event?.sender !== sender || !phone(event?.recipient)) return null;
    // Matches the existing WhatsApp phone index; never create/modify a link.
    const phoneHash = createHmac('sha256', linkHashKey).update(event.recipient).digest('hex');
    const [links] = await c.query('SELECT email,consent_concierge,revoked_at,linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE', [phoneHash]);
    const link = links[0];
    if (links.length !== 1 || !link.email || link.revoked_at !== null || Number(link.consent_concierge) !== 1 || !link.linked_at || !link.updated_at) return null;
    const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [link.email]);
    if (owners.length !== 1 || !owners[0].public_id) return null;
    const grantKey = infobipGrantKey(sender, phoneHash), grantState = await lockState(c, grantKey);
    if (!grantState?.sealed) return null;
    const grant = open(grantState.sealed, key, aad(grantKey));
    // Existing Meta linkage alone does NOT authorize a provider migration.
    if (grant.provider !== 'infobip' || grant.sender !== sender || grant.phoneHash !== phoneHash ||
        grant.email !== link.email || grant.accountId !== owners[0].public_id || grant.linkRevision !== revision(link) ||
        grant.consentConcierge !== true || grant.active !== true || typeof grant.revision !== 'string' || !grant.revision) return null;
    return { accountId: owners[0].public_id, provider: 'infobip', sender, recipient: event.recipient,
      revision: JSON.stringify([revision(link), grant.revision]), consentConcierge: true, revoked: false };
  }
  async function transaction(run) {
    let c;
    try {
      c = await db.getConnection();
      await c.beginTransaction();
      const result = await run(c);
      await c.commit(); return result;
    } catch {
      try { await c?.rollback(); } catch { /* preserve a fixed, redacted error */ }
      error();
    } finally { try { c?.release(); } catch { error(); } }
  }
  const store = {
    transaction: run => transaction(async c => {
      const claimed = new Set();
      return run({
        lookupLink: event => lookupLink(c, event),
        claim: async (eventKey, digest) => {
          if (!hex(digest)) error();
          const stateKey = jobKey(eventKey), marker = randomUUID();
          await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',
            [stateKey, JSON.stringify({v: 1, digest, marker, status: 'claiming', sealed: null})]);
          const state = await lockState(c, stateKey);
          if (state?.v !== 1 || state.digest !== digest) return 'conflict';
          if (state.marker !== marker) return state.status === 'claiming' ? 'conflict' : 'duplicate';
          claimed.add(eventKey); return 'new';
        },
        enqueue: async job => {
          if (!claimed.has(job.eventKey) || job.sender !== sender || job.provider !== 'infobip') error();
          const stateKey = jobKey(job.eventKey), state = await lockState(c, stateKey);
          const isFresh = fresh(job, now());
          await save(c, stateKey, {...state, marker: null, status: isFresh ? 'held' : 'expired',
            sealed: isFresh ? seal(job, key, aad(stateKey)) : null});
        },
      });
    }),
    // Production dispatch cannot be enabled by configuration or environment.
    dispatch: async () => ({status: INFOBIP_WHATSAPP_RELEASE_ENABLED ? 'blocked' : 'disabled'}),
    // Explicit bounded cleanup of an already selected key, with no timer/scan.
    // Retain the uniqueness tombstone; never make uncertain attempts retryable.
    expirePayload: eventKey => transaction(async c => {
      const stateKey = jobKey(eventKey), state = await lockState(c, stateKey);
      if (!state?.sealed) return {status: state?.status || 'missing'};
      const job = loadJob(state, stateKey);
      if (fresh(job, now())) return {status: state.status};
      const status = state.status === 'dispatching' ? 'uncertain' : 'expired';
      await save(c, stateKey, {...state, status, sealed: null}); return {status};
    }),
    // Executes only with an explicitly injected synthetic transport in tests.
    async exerciseDispatch(eventKey, { concierge, send, clock = now, timeoutMs = 5_000 }) {
      if (typeof concierge !== 'function' || typeof send !== 'function') error();
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) error();
      const stateKey = jobKey(eventKey);
      try {
        const initial = await transaction(c => lockState(c, stateKey));
        if (initial?.status !== 'held') return {status: initial?.status || 'missing'};
        const job = loadJob(initial, stateKey);
        const proposal = await prepareOfflineInfobipReply(job, {
          lookupLink: event => transaction(c => lookupLink(c, event)), concierge, now: clock,
        });
        // Phase one commits a durable no-retry marker BEFORE provider I/O.
        const attemptId = await transaction(async c => {
          const current = await lookupLink(c, job), state = await lockState(c, stateKey);
          if (state?.status !== 'held') return null;
          if (!proposal || stamp(current) !== job.bindingStamp || !fresh(job, clock())) {
            await save(c, stateKey, {...state, status: 'cancelled', sealed: null}); return null;
          }
          const attempt = randomUUID();
          await save(c, stateKey, {...state, status: 'dispatching', attemptId: attempt}); return attempt;
        });
        if (!attemptId) return {status: 'blocked'};
        return await transaction(async c => {
          // Same locks as consent/revocation/account mutation through send.
          const current = await lookupLink(c, job), state = await lockState(c, stateKey);
          if (state?.status !== 'dispatching' || state.attemptId !== attemptId) return {status: 'uncertain'};
          if (stamp(current) !== job.bindingStamp || !fresh(job, clock())) {
            await save(c, stateKey, {...state, status: 'cancelled', sealed: null}); return {status: 'cancelled'};
          }
          let result, timer; const controller = new AbortController();
          try { result = await Promise.race([
            send({...proposal, messageId: `cc-${eventKey}`}, {signal: controller.signal}),
            new Promise(resolve => { timer = setTimeout(() => {controller.abort(); resolve({status: 'uncertain'});}, timeoutMs); }),
          ]); }
          catch { result = {status: 'uncertain'}; }
          finally { clearTimeout(timer); }
          const status = result?.status === 'accepted_unconfirmed' ? 'accepted_unconfirmed' : 'uncertain';
          await save(c, stateKey, {...state, status, sealed: null});
          return {status};
        });
      } catch { return {status: 'uncertain'}; }
    },
  };
  return store;
}
