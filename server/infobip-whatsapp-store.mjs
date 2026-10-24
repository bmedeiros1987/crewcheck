import { createHash, createHmac, randomUUID } from 'node:crypto';
import { parseJsonColumn } from './v139/common.mjs';
import { sealSubscription as seal, openSubscription as open } from './web-push/installationRegistry.mjs';
import { prepareInfobipReply, INFOBIP_REPLY_MAX_AGE_MS, INFOBIP_IDENTIFIER_RETENTION_MS, INFOBIP_WHATSAPP_RELEASE_ENABLED } from './infobip-whatsapp-candidate.mjs';
import {createInfobipSqlBudget} from './infobip-whatsapp-sql-budget.mjs';
import {assertInfobipAccountQuiescent,infobipEngineOwner} from './infobip-whatsapp-quiescence.mjs';
import {completeCanonicalWhatsAppLink} from './whatsapp-link-proof.mjs';
import {createCipheriv, randomBytes} from 'node:crypto';

// Reuse the existing pool interface and state table. No pool creation, DDL,
// auto-migration, polling worker or runtime registration occurs in this module.
const PREFIX = 'crewcheck-infobip-inbound-v1:';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const phone = value => typeof value === 'string' && /^[1-9]\d{7,14}$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = () => { throw Error('INFOBIP_STATE_UNAVAILABLE'); };
const jobKey = key => hex(key) ? PREFIX + key : error();
const aad = key => ['crewcheck-infobip-state-v1', key];
const revision = link => JSON.stringify([String(link.linked_at || ''), String(link.updated_at || '')]);
const fresh = (job, now) => Number.isFinite(job?.receivedAt) && job.receivedAt <= now + 30_000 && now - job.receivedAt <= INFOBIP_REPLY_MAX_AGE_MS;
const stamp = link => link && JSON.stringify([link.accountId, link.revision, link.provider, link.sender, link.recipient]);

export function createInfobipSqlStore(options) { return buildStore(options); }

// Explicit production capability; shares the transaction implementation, never
// calls the synthetic exercise API. No pool, env, credential discovery or DDL.
export function createInfobipProductionStore(options, dependencies) {
  if (typeof dependencies?.concierge !== 'function' || typeof dependencies?.send !== 'function' ||
      typeof dependencies?.admission?.allows !== 'function' || typeof dependencies?.admission?.reserve !== 'function') error();
  return buildStore(options, Object.freeze({...dependencies}));
}

function buildStore({ db, sender, encryptionKey, linkHashKey, now = Date.now, sqlBudget }, production) {
  if (!db?.getConnection || !phone(sender) || !Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32 ||
      typeof linkHashKey !== 'string' || linkHashKey.length < 32) error();
  // Copy key bytes; caller mutation must not switch the cryptographic context.
  const key = Buffer.from(encryptionKey),localPreparations=new Map();
  const privateIndex = value => createHmac('sha256', linkHashKey).update(value).digest('hex');
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
    const phoneHash = privateIndex(event.recipient);
    const [links] = await c.query('SELECT email,consent_concierge,revoked_at,linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE', [phoneHash]);
    const link = links[0];
    if (links.length !== 1 || !link.email || link.revoked_at !== null || Number(link.consent_concierge) !== 1 || !link.linked_at || !link.updated_at) return null;
    const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [link.email]);
    if (owners.length !== 1 || !owners[0].public_id ||
        (production?.allowsOwner && !production.allowsOwner(owners[0].public_id))) return null;
    // The existing authenticated link/start consent + channel code proves the
    // same WhatsApp recipient/account. A provider switch alone needs no new opt-in.
    // Sender ownership/routing is separately a deployment contract gate.
    return { accountId: owners[0].public_id, email: link.email, provider: 'infobip', sender, recipient: event.recipient,
      revision: revision(link), consentConcierge: true, revoked: false };
  }
  const transaction = createInfobipSqlBudget(db, sqlBudget);
  const erase = async (c,email) => {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error();
    await assertInfobipAccountQuiescent(c,email,{checkTable:false});
    await c.query('UPDATE crewcheck_whatsapp_links SET revoked_at=UTC_TIMESTAMP(3),consent_concierge=0,consent_alerts=0,updated_at=UTC_TIMESTAMP(3) WHERE email=?',[email]);
    const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
    await c.query('DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?',[email]);
    if (owners[0]?.public_id) await c.query(`UPDATE crewcheck_telegram_state SET payload=JSON_SET(payload,'$.sealed',NULL,'$.ownerHash',NULL,'$.report',NULL,
      '$.status',CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status')) IN ('held','preparing','dispatching') THEN 'cancelled' ELSE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status')) END),updated_at=NOW(3)
      WHERE state_key LIKE 'crewcheck-infobip-inbound-v1:%' AND CAST(state_key AS BINARY)>? AND CAST(state_key AS BINARY)<? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerHash'))=?`,[PREFIX,PREFIX+'~',privateIndex(owners[0].public_id)]);
    return {status:'erased'};
  };
  async function dispatchAttempt(eventKey, {concierge,send,admission,signal,clock=now,timeoutMs=5_000}) {
      if (typeof concierge !== 'function' || typeof send !== 'function') error();
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) error();
      const stateKey = jobKey(eventKey);
      try {
        const initial = await transaction(c => lockState(c, stateKey));
        if (initial?.status !== 'held') return {status: initial?.status || 'missing'};
        const job = loadJob(initial, stateKey);
        if (signal?.aborted || (admission && !admission.allows(job))) {
          await transaction(async c=>{const current=await lockState(c,stateKey);if(current?.status==='held')await save(c,stateKey,{...current,status:'cancelled',sealed:null});});
          return {status:'blocked'};
        }
        // Production admission commits before invoking the canonical engine.
        // The preparing marker and quantity reservation are atomic. A crash or
        // lost ACK cannot cause this conversation/attempt to be retried.
        let preparationId,preparationOwner;
        if(admission){
          preparationId=await transaction(async c=>{
            const current=await lookupLink(c,job),state=await lockState(c,stateKey);
            if(state?.status!=='held')return null;
            if(signal?.aborted||stamp(current)!==job.bindingStamp||!fresh(job,clock())||!await admission.reserve(c,job)){
              await save(c,stateKey,{...state,status:'cancelled',sealed:null});return null;
            }
            preparationOwner=current.email;const token=randomUUID();await save(c,stateKey,{...state,status:'preparing',preparationId:token,engineActive:true,engineOwner:infobipEngineOwner(current.accountId)});return token;
          });
          if(!preparationId)return {status:'blocked'};
        }
        let proposal,finishLocal,localWork;
        if(admission){localWork=new Promise(resolve=>finishLocal=resolve);
          const pending=localPreparations.get(preparationOwner)||new Set();pending.add(localWork);localPreparations.set(preparationOwner,pending);}
        let cleanup;
        const finishEngine=()=>cleanup??=(async()=>{
          try {if(admission)await transaction(async c=>{
            const state=await lockState(c,stateKey);
            if(state?.preparationId!==preparationId||state.engineActive!==true)error();
            await save(c,stateKey,{...state,engineActive:false,engineOwner:null});
          });} finally {
            if(finishLocal){finishLocal();const pending=localPreparations.get(preparationOwner);pending.delete(localWork);if(!pending.size)localPreparations.delete(preparationOwner);}
          }
        })();
        try {proposal = await prepareInfobipReply(job, {
          lookupLink: event => transaction(c => lookupLink(c, event)),
          concierge: async input=>{
            try {return job.kind==='link_confirmation'?job.text:await concierge(input);}
            finally {await finishEngine();}
          },now: clock,signal,
        });} finally {
          // Also clear when validation/abort prevents engine invocation. The
          // wrapper clears at actual settle, before the post-engine SQL lookup,
          // so an account transaction holding its profile lock can progress.
          await finishEngine();
        }
        // Phase one commits a durable no-retry marker BEFORE provider I/O.
        const attemptId = await transaction(async c => {
          const current = await lookupLink(c, job), state = await lockState(c, stateKey);
          if (state?.status !== (admission?'preparing':'held') || (admission&&state.preparationId!==preparationId)) return null;
          if (signal?.aborted || !proposal || stamp(current) !== job.bindingStamp || !fresh(job, clock())) {
            await save(c, stateKey, {...state, status: 'cancelled', sealed: null}); return null;
          }
          const attempt = randomUUID();
          await save(c, stateKey, {...state, status: 'dispatching', attemptId: attempt,
            report: {recipientHash: privateIndex(job.recipient), senderHash: privateIndex(sender), attemptAt: clock()}}); return attempt;
        });
        if (!attemptId) return {status: 'blocked'};
        return await transaction(async c => {
          // Same locks as consent/revocation/account mutation through send.
          const current = await lookupLink(c, job), state = await lockState(c, stateKey);
          if (state?.status !== 'dispatching' || state.attemptId !== attemptId) return {status: 'uncertain'};
          if (signal?.aborted || (admission && !admission.allows(job)) || stamp(current) !== job.bindingStamp || !fresh(job, clock())) {
            await save(c, stateKey, {...state, status: 'cancelled', sealed: null}); return {status: 'cancelled'};
          }
          // Reserve the whole bounded send plus the final SQL operation before
          // starting I/O. Never start a send at the end of a transaction budget.
          if (c.signal.aborted || c.remainingMs() < timeoutMs + 2_000) error();
          let result, timer; const controller = new AbortController();
          try { result = await Promise.race([
            send({...proposal, messageId: `cc-${eventKey}`}, {signal: AbortSignal.any([controller.signal, c.signal,...(signal?[signal]:[])])}),
            new Promise(resolve => { timer = setTimeout(() => {controller.abort(); resolve({status: 'uncertain'});}, timeoutMs); }),
          ]); }
          catch { result = {status: 'uncertain'}; }
          finally { clearTimeout(timer); }
          const status = result?.status === 'accepted_unconfirmed' ? 'accepted_unconfirmed' : 'uncertain';
          await save(c, stateKey, {...state, status, sealed: null});
          return {status};
        });
      } catch { return {status: 'uncertain'}; }
  }
  const store = {
    transaction: run => transaction(async c => {
      const claimed = new Set();
      return run({
        lookupLink: event => lookupLink(c, event),
        completeLink: async event => {
          if (event.sender !== sender || !phone(event.recipient) || !/^\d{6}$/.test(event.text)) return false;
          const stateKey = jobKey(hash(['infobip-link-attempts-v1', sender, privateIndex(event.recipient), Math.floor(now()/600_000)]));
          await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',
            [stateKey, JSON.stringify({v:1,status:'link_rate',attempts:0,sealed:null,retainUntil:now()+72*60*60_000})]);
          const rate = await lockState(c,stateKey);
          if (rate?.status !== 'link_rate' || !Number.isInteger(rate.attempts) || rate.attempts >= 5) return false;
          await save(c,stateKey,{...rate,attempts:rate.attempts+1});
          const phoneHash = privateIndex(event.recipient);
          const codeHash = privateIndex(`crewcheck-whatsapp-link|${event.text}`);
          const phoneKey = createHash('sha256').update(`crewcheck-whatsapp-phone|${linkHashKey}`).digest();
          const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',phoneKey,iv);
          const ciphertext = Buffer.concat([cipher.update(event.recipient,'utf8'),cipher.final()]);
          const phoneCipher = `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
          return (await completeCanonicalWhatsAppLink(c,{phone:event.recipient,codeHash,phoneHash,phoneCipher})).linked;
        },
        finishClaim: async eventKey => {
          if (!claimed.has(eventKey)) error();
          const stateKey = jobKey(eventKey), state = await lockState(c,stateKey);
          await save(c,stateKey,{...state,marker:null,status:'denied',sealed:null});
        },
        claim: async (eventKey, digest) => {
          if (!hex(digest)) error();
          const stateKey = jobKey(eventKey), marker = randomUUID();
          await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',
            [stateKey, JSON.stringify({v: 1, digest, marker, status: 'claiming', sealed: null,
              retainUntil: now() + INFOBIP_IDENTIFIER_RETENTION_MS})]);
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
            ownerHash: privateIndex(JSON.parse(job.bindingStamp)[0]),
            sealed: isFresh ? seal(job, key, aad(stateKey)) : null});
        },
      });
    }),
    // Default candidate stays disabled; the separate production factory supplies
    // explicit send/engine/admission capabilities to this shared core.
    dispatch: production ? (eventKey,{signal}={})=>dispatchAttempt(eventKey,{...production,signal,clock:now}) : async () => ({status: INFOBIP_WHATSAPP_RELEASE_ENABLED ? 'blocked' : 'disabled'}),
    ...(production ? {} : {exerciseDispatch:dispatchAttempt}),
    nextHeld: () => transaction(async c => {
      const [rows] = await c.query("SELECT state_key FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-inbound-v1:%' AND CAST(state_key AS BINARY)>? AND CAST(state_key AS BINARY)<? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status'))='held' ORDER BY CAST(state_key AS BINARY) LIMIT 1 FOR UPDATE",[PREFIX,PREFIX+'~']);
      return rows[0]?.state_key.slice(PREFIX.length) || null;
    }),
    async waitForLocalPreparations(email){while(localPreparations.has(email))await Promise.all([...localPreparations.get(email)]);},
    eraseAccount: (email,{client} = {}) => {
      if (!client) return transaction(c=>erase(c,email));
      // Join the caller's account-deletion transaction; never commit/release it.
      // Timeout discards that connection so late work cannot race deletion.
      if(client.dialect !== 'mysql' || typeof client.discard !== 'function') error();
      const joined = createInfobipSqlBudget({getConnection:async()=>({
        async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy:()=>client.discard(),
        async query(sql,params){let index=0;const result=await client.query(sql.replace(/\?/g,()=>`$${++index}`),params);
          return [/^\s*SELECT/i.test(sql)?result.rows:{affectedRows:result.rowCount}];},
      })},sqlBudget);
      return joined(c=>erase(c,email));
    },
    // No raw recipient or content is retained for DLR correlation. A callback
    // cannot create a job or schedule a send, nor downgrade a delivered state.
    recordDelivery: report => transaction(async c => {
      if (!['delivery','seen'].includes(report?.kind) || !Array.isArray(report.receiptKey) ||
          (report.kind === 'delivery' ? report.receiptKey.length !== 3 || !Number.isInteger(report.statusId) : report.receiptKey.length !== 2)) error();
      const stateKey = jobKey(report.eventKey), state = await lockState(c, stateKey);
      if (!['dispatching','uncertain','accepted_unconfirmed','delivered'].includes(state?.status) ||
          state.report?.recipientHash !== privateIndex(report.recipient) ||
          state.report?.senderHash !== privateIndex(sender) ||
          !Number.isFinite(report.sentAt) || !Number.isFinite(report.doneAt) ||
          report.sentAt < state.report.attemptAt - 30_000 || report.doneAt < report.sentAt ||
          report.doneAt > now() + 30_000 || now() - report.doneAt > 48 * 60 * 60_000) return {status: 'ignored'};
      // Unique per original event, independent of batch/order/counters. Existing
      // row locks serialize callback replay with dispatch and maintenance.
      const receiptKey = jobKey(hash(['infobip-report-v1', sender, report.kind, report.receiptKey]));
      const marker = randomUUID();
      await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',
        [receiptKey, JSON.stringify({v:1,status:'receipt',marker,sealed:null,retainUntil:now()+INFOBIP_IDENTIFIER_RETENTION_MS})]);
      const receipt = await lockState(c,receiptKey);
      if (receipt.marker !== marker) return {status:'duplicate'};
      if (report.kind === 'seen') {
        // Read observation is not delivery evidence and never authorizes a reply.
        await save(c,stateKey,{...state,report:{...state.report,seenAt:Math.max(state.report.seenAt||0,report.doneAt)}});
        return {status:'seen'};
      }
      const delivered = report.deliveryState === 'delivered';
      const previous = state.report.deliveryAt || 0;
      const advance = delivered ? state.status !== 'delivered' || report.doneAt > previous :
        state.status !== 'delivered' && (report.doneAt > previous || (report.doneAt === previous && report.statusId > (state.report.deliveryStatusId || 0)));
      await save(c,stateKey,{...state,
        status:delivered || state.status === 'delivered' ? 'delivered' : state.status,
        sealed:delivered ? null : state.sealed,
        report:{...state.report,...(advance?{deliveryAt:report.doneAt,deliveryStatusId:report.statusId}: {})}});
      return {status:delivered?'delivered':'observed'};
    }),
    // Explicit bounded maintenance, never registered as a timer/worker. Cursor
    // scans only this namespace. Payloads expire after 15m; uniqueness markers
    // live 11 days, beyond the 10-day accepted retry horizon. No content is kept.
    maintain: ({cursor = '', limit = 20, forgetAccountId} = {}) => transaction(async c => {
      if ((cursor && !hex(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 20 ||
          (forgetAccountId !== undefined && (typeof forgetAccountId !== 'string' || !forgetAccountId))) error();
      const [rows] = await c.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-inbound-v1:%' AND CAST(state_key AS BINARY)>? AND CAST(state_key AS BINARY)<? ORDER BY CAST(state_key AS BINARY) LIMIT ? FOR UPDATE",
        [PREFIX + cursor, PREFIX + '~', limit]);
      for (const row of rows) {
        const state = parseJsonColumn(row.payload, null);
        if (state?.v !== 1) error();
        const active=state.engineActive===true||(state.status==='preparing'&&state.engineActive!==false);
        const forgetting = forgetAccountId !== undefined && state.ownerHash === privateIndex(forgetAccountId);
        const expired = state.sealed && !fresh(loadJob(state, row.state_key), now());
        let next = state;
        if (forgetting || expired) next = {...state, sealed: null,
          status: active&&state.engineActive!==true ? 'preparing' : state.status === 'dispatching' ? 'uncertain' : ['held','preparing'].includes(state.status) ? 'expired' : state.status,
          ...(forgetting ? {ownerHash: active?state.ownerHash:null, report: null} : {})};
        if (!active && !next.sealed && Number.isFinite(next.retainUntil) && next.retainUntil <= now()) {
          await c.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?', [row.state_key]);
        } else if (next !== state) await save(c, row.state_key, next);
      }
      return {scanned: rows.length, cursor: rows.length ? rows.at(-1).state_key.slice(PREFIX.length) : null};
    }),
    // Explicit bounded cleanup of an already selected key, with no timer/scan.
    // Retain the uniqueness tombstone; never make uncertain attempts retryable.
    expirePayload: eventKey => transaction(async c => {
      const stateKey = jobKey(eventKey), state = await lockState(c, stateKey);
      if (!state?.sealed) return {status: state?.status || 'missing'};
      const job = loadJob(state, stateKey);
      if (fresh(job, now())) return {status: state.status};
      const status = state.status==='preparing'&&state.engineActive!==false ? 'preparing' : state.status === 'dispatching' ? 'uncertain' : 'expired';
      await save(c, stateKey, {...state, status, sealed: null}); return {status};
    }),

  };
  return store;
}
