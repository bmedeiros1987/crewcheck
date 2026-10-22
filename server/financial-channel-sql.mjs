import { createFinancialChannelReader, financialConversationBinding } from './financial-channel-read.mjs';
import { captureReviewedFinancialForecast, prepareReviewedForecastBatch } from './financial-forecast-producer.mjs';
import { FinancialLedgerError, ledgerOwner } from './financial-ledger.mjs';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = (code, status = 409) => { throw new FinancialLedgerError(code, status); };
const chat = value => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const categories = ['allowance', 'advance', 'payroll', 'vacation'];
const unavailable = reason => ({state:'unavailable',reason,events:[]});

// Isolated SQL implementation: no route, bot import, env lookup, DDL or sender.
// db is the existing mysqlAdapter, supplied by a separately reviewed host.
export function createFinancialChannelSqlService(db, { now = () => new Date(), maxSourceAgeMs } = {}) {
  async function transaction(work) {
    const c = await db.connect(); let began = false;
    try {
      // Next transaction only: an unlocked link lookup must not pin an old
      // REPEATABLE READ snapshot while waiting for the owner's writer lock.
      await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await c.query('BEGIN'); began = true;
      const result = await work(c);
      await c.query('COMMIT'); began = false;
      return result;
    } catch (error) {
      if (began) try { await c.query('ROLLBACK'); } catch { c.discard?.(); }
      throw error;
    } finally { c.release(); }
  }
  async function account(c, ownerId) {
    const rows = await c.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [ownerId]);
    if (rows.rows.length !== 1 || rows.rows[0].email !== ownerId) fail('FINANCIAL_OWNER_REQUIRED',403);
  }
  async function binding(c, conversationId, ownerId) {
    // The chat record is only a lookup candidate. Both durable directions must
    // agree; a cached menu profile or request email cannot authorize this read.
    const candidateRows = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1', ['link-chat:'+conversationId]);
    const candidate = candidateRows.rows.length === 1 ? parse(candidateRows.rows[0].payload) : null;
    if (!candidate || typeof candidate.email !== 'string' || (ownerId && candidate.email !== ownerId)) fail('FINANCIAL_PRIVATE_BINDING_REQUIRED',403);
    // Same first lock as ledger writes/account erasure. Candidate was not authority.
    await account(c, candidate.email);
    const rows = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE', ['link-chat:'+conversationId]);
    const byChat = rows.rows.length === 1 ? parse(rows.rows[0].payload) : null;
    if (!byChat || byChat.email !== candidate.email) fail('FINANCIAL_PRIVATE_BINDING_REQUIRED',403);
    const opposite = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE', ['link-email:'+byChat.email]);
    const byEmail = opposite.rows.length === 1 ? parse(opposite.rows[0].payload) : null;
    const same = byEmail && ['email','chatId','linkedAt','accessKeyHash','code'].every(key => (byEmail[key] || '') === (byChat[key] || ''));
    if (!same || String(byChat.chatId) !== conversationId || !stamp(byChat.linkedAt) || Date.parse(byChat.linkedAt) > now().getTime()) fail('FINANCIAL_PRIVATE_BINDING_REQUIRED',403);
    return { email: byChat.email, chatId: conversationId, linkedAt: byChat.linkedAt, accessKeyHash: byChat.accessKeyHash || '', linked:true, channel:'telegram',chatType:'private' };
  }
  async function consent(c, ownerId, conversationId) {
    const result = await c.query('SELECT revision,consent FROM crewcheck_financial_channel_consents WHERE owner_id=$1 AND conversation_id=$2 FOR UPDATE', [ownerId,conversationId]);
    if (!result.rows.length) return null;
    const value = parse(result.rows[0].consent);
    if (value?.revision !== Number(result.rows[0].revision) || value.ownerId !== ownerId || value.conversationId !== conversationId) fail('FINANCIAL_CONSENT_CORRUPT');
    return value;
  }
  async function snapshot(c, ownerId) {
    // One relational snapshot joins immutable freshness to the exact stored
    // revision and fingerprint, never to a selected month or insertion time.
    const result = await c.query('SELECT r.snapshot,o.source_fingerprint,o.source_as_of_ms,o.recorded_at_ms FROM crewcheck_financial_revisions r LEFT JOIN crewcheck_financial_source_observations o ON o.owner_id=r.owner_id AND o.entry_id=r.entry_id AND o.revision=r.revision WHERE r.owner_id=$1 ORDER BY r.entry_id,r.revision LIMIT 10001', [ownerId]);
    if (result.rows.length > 10000) fail('FINANCIAL_HISTORY_LIMIT',503);
    const records = [], freshness = [];
    for (const row of result.rows) {
      const stored = parse(row.snapshot); records.push(stored.record);
      if (row.source_fingerprint !== stored.sourceFingerprint) continue;
      const source = Number(row.source_as_of_ms), recorded = Number(row.recorded_at_ms);
      if (!Number.isSafeInteger(source) || !Number.isSafeInteger(recorded) || source < 0 || recorded < source) continue;
      freshness.push({id:stored.record.id,revision:stored.record.revision,sourceAsOf:new Date(source).toISOString(),recordedAt:new Date(recorded).toISOString()});
    }
    return {source:'persisted_financial_ledger',ownerId,records,freshness};
  }
  const service = {
    // Only the existing owner-authenticated host may call this. It cannot grant
    // by Telegram callback; expected binding and explicit confirmation are required.
    async previewConsent(identity, conversationId) {
      const ownerId = ledgerOwner(identity); if (!chat(conversationId)) fail('FINANCIAL_INVALID_CONVERSATION');
      return transaction(async c => {
        const profile = await binding(c,conversationId,ownerId), existing = await consent(c,ownerId,conversationId);
        return {binding:financialConversationBinding({ownerId,conversationId,...profile}),revision:existing?.revision || 0,consent:existing};
      });
    },
    async inspectConsent(identity, conversationId) {
      const ownerId=ledgerOwner(identity);if(!chat(conversationId))fail('FINANCIAL_INVALID_CONVERSATION');
      return transaction(async c=>{await account(c,ownerId);const existing=await consent(c,ownerId,conversationId);return {revision:existing?.revision||0,consent:existing};});
    },
    async changeConsent(identity, request) {
      const ownerId = ledgerOwner(identity), input = structuredClone(request);
      if (!input || !chat(input.conversationId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2147483647
        || !['grant','revoke'].includes(input.action)) fail('FINANCIAL_INVALID_CONSENT');
      return transaction(async c => {
        // Revoke remains possible after unlink; grant must prove the exact new binding.
        const profile = input.action === 'grant' ? await binding(c,input.conversationId,ownerId) : (await account(c,ownerId), null);
        const previous = await consent(c,ownerId,input.conversationId);
        if ((previous?.revision || 0) !== input.expectedRevision) fail('FINANCIAL_CONSENT_REVISION_CONFLICT');
        if (input.action === 'revoke' && !previous) fail('FINANCIAL_CONSENT_NOT_FOUND');
        const time = now().getTime(); let value;
        if (input.action === 'grant') {
          const currentBinding = financialConversationBinding({ownerId,conversationId:input.conversationId,...profile});
          if (input.confirmed !== true || input.binding !== currentBinding || !stamp(input.expiresAt) || Date.parse(input.expiresAt) <= time
            || !Array.isArray(input.categories) || !input.categories.length || new Set(input.categories).size !== input.categories.length || !input.categories.every(x=>categories.includes(x))) fail('FINANCIAL_EXPLICIT_CONSENT_REQUIRED');
          value = {version:1,ownerId,channel:'telegram',conversationId:input.conversationId,binding:currentBinding,revision:input.expectedRevision+1,state:'granted',scope:'financial_forecast_on_request',delivery:'private_text',allowModels:false,allowAutomatic:false,categories:[...input.categories].sort(),grantedAt:new Date(time).toISOString(),expiresAt:input.expiresAt};
        } else value = {...previous,revision:input.expectedRevision+1,state:'revoked',revokedAt:new Date(time).toISOString()};
        await c.query('INSERT INTO crewcheck_financial_channel_consents(owner_id,conversation_id,revision,consent) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE revision=VALUES(revision),consent=VALUES(consent)',[ownerId,input.conversationId,value.revision,JSON.stringify(value)]);
        return value;
      });
    },
    // Trusted source-ingestion adapter only, never a public timestamp/amount form.
    // Preserves immutable forecast snapshots; old revisions remain unknown.
    async recordSourceObservation(identity, request) {
      const ownerId = ledgerOwner(identity), input = structuredClone(request), recordedAt = now().getTime();
      if (!input || !hex(input.entryId) || !Number.isSafeInteger(input.revision) || input.revision < 1 || !hex(input.sourceFingerprint) || !hex(input.evidenceDigest)
        || input.kind !== 'published_source_timestamp' || !stamp(input.sourceAsOf) || Date.parse(input.sourceAsOf) > recordedAt) fail('FINANCIAL_SOURCE_EVIDENCE_REQUIRED');
      return transaction(async c => {
        await account(c,ownerId);
        const rows = await c.query('SELECT snapshot FROM crewcheck_financial_revisions WHERE owner_id=$1 AND entry_id=$2 AND revision=$3',[ownerId,input.entryId,input.revision]);
        const stored = rows.rows.length === 1 ? parse(rows.rows[0].snapshot) : null;
        if (!stored || stored.record.ownerId !== ownerId || stored.record.revision !== input.revision || stored.sourceFingerprint !== input.sourceFingerprint) fail('FINANCIAL_SOURCE_REVISION_MISMATCH');
        const old = await c.query('SELECT source_fingerprint,source_as_of_ms,evidence_digest FROM crewcheck_financial_source_observations WHERE owner_id=$1 AND entry_id=$2 AND revision=$3 FOR UPDATE',[ownerId,input.entryId,input.revision]);
        if (old.rows.length) {
          const row=old.rows[0];if(row.source_fingerprint!==input.sourceFingerprint||Number(row.source_as_of_ms)!==Date.parse(input.sourceAsOf)||row.evidence_digest!==input.evidenceDigest)fail('FINANCIAL_SOURCE_EVIDENCE_IMMUTABLE');
          return {replayed:true};
        }
        await c.query('INSERT INTO crewcheck_financial_source_observations(owner_id,entry_id,revision,source_fingerprint,source_as_of_ms,recorded_at_ms,evidence_digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[ownerId,input.entryId,input.revision,input.sourceFingerprint,Date.parse(input.sourceAsOf),recordedAt,input.evidenceDigest]);
        return {replayed:false};
      });
    },
    // Composition for an existing trusted source-ingestion host. Browser capture
    // remains unchanged and cannot supply this observation through its HTTP route.
    async captureTrustedSource({identity, source, observation, store}) {
      const ownerId=ledgerOwner(identity), frozen=structuredClone(source), evidence=structuredClone(observation);
      if (!evidence || evidence.kind!=='published_source_timestamp' || !stamp(evidence.sourceAsOf) || Date.parse(evidence.sourceAsOf)>now().getTime()
        || !hex(evidence.evidenceDigest) || evidence.sourceFingerprint!==frozen?.fingerprint) fail('FINANCIAL_SOURCE_EVIDENCE_REQUIRED');
      prepareReviewedForecastBatch({identity,source:frozen});
      const result=await captureReviewedFinancialForecast({identity,source:frozen,store});
      for(const receipt of result.receipts) await service.recordSourceObservation(identity,{entryId:receipt.id,revision:receipt.revision,kind:evidence.kind,sourceAsOf:evidence.sourceAsOf,sourceFingerprint:frozen.fingerprint,evidenceDigest:evidence.evidenceDigest});
      return {...result,ownerId};
    },
    async read(context, options) {
      const target = structuredClone(context), selection = structuredClone(options);
      if (target?.channel !== 'telegram' || target.chatType !== 'private' || !chat(target.conversationId)) return unavailable('private_owner_required');
      try {
        let expiresAt;
        const result = await transaction(async c => {
          // Keep durable link/profile/consent rows locked until this snapshot is
          // finished. Revocation/relink/account erasure must serialize with it.
          let lockedProfile, lockedConsent;
          const reader = createFinancialChannelReader({now,maxSourceAgeMs,
            resolveProfile:async()=>{lockedProfile=await binding(c,target.conversationId);return lockedProfile;},
            authorizeOwner:async profile=>({authenticated:true,role:'owner',active:true,ownerId:profile.email}),
            readConsent:async ownerId=>{lockedConsent=await consent(c,ownerId,target.conversationId);expiresAt=lockedConsent?.expiresAt;return lockedConsent;},
            readSnapshot:identity=>snapshot(c,identity.ownerId),
            isCurrent:({ownerId,binding:expected,consentRevision})=>Boolean(lockedProfile&&lockedConsent&&lockedProfile.email===ownerId&&lockedConsent.state==='granted'&&lockedConsent.revision===consentRevision&&financialConversationBinding({ownerId,conversationId:target.conversationId,...lockedProfile})===expected),
          });
          return reader(target,selection);
        });
        // A slow commit may cross time expiry even though locks prevented changes.
        const time=now().getTime();if(result.state!=='unavailable'&&(!Number.isFinite(time)||Date.parse(expiresAt)<=time||result.events.some(event=>time-Date.parse(event.sourceAsOf)>maxSourceAgeMs)))return unavailable('source_or_consent_expired');
        return result;
      } catch { return unavailable('source_or_authority_unavailable'); }
    },
  };
  return service;
}
