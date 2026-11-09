import { createHash } from 'node:crypto';
import { ledgerOwner } from './financial-ledger.mjs';
import { queryUpcomingFinancialForecast } from '../shared/financialUpcoming.mjs';

const categories = ['allowance', 'advance', 'payroll', 'vacation'];
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = reason => ({ state: 'unavailable', reason, events: [] });

// Preparation only: no HTTP route, bot import, consent write or message sender.
// All dependencies are server-owned adapters, never request-supplied callbacks.
// resolveProfile reuses the linked Telegram resolver; authorizeOwner must use
// existing account authority (a profile email alone is never an identity).
export function createFinancialChannelReader({ resolveProfile, authorizeOwner, readConsent, readSnapshot, isCurrent, now = () => new Date(), maxSourceAgeMs } = {}) {
  async function authority(context) {
    if (context?.channel !== 'telegram' || context.chatType !== 'private' || !/^[1-9]\d{0,19}$/.test(context.conversationId || '')) return null;
    const profile = await resolveProfile(context);
    if (profile?.linked !== true || profile.channel !== 'telegram' || profile.chatType !== 'private'
      || String(profile.chatId) !== context.conversationId || !stamp(profile.linkedAt)) return null;
    const identity = await authorizeOwner(profile, context);
    const ownerId = ledgerOwner(identity);
    if (ownerId !== profile.email || identity.active !== true) return null;
    const binding = digest([ownerId, context.channel, context.conversationId, profile.linkedAt, profile.accessKeyHash || '']);
    return { identity, ownerId, binding };
  }
  function consentMatches(consent, auth, context, category, at) {
    return consent?.version === 1 && consent.ownerId === auth.ownerId && consent.channel === context.channel
      && consent.conversationId === context.conversationId && consent.binding === auth.binding
      && Number.isSafeInteger(consent.revision) && consent.revision > 0 && consent.state === 'granted'
      && consent.scope === 'financial_forecast_on_request' && consent.delivery === 'private_text'
      && consent.allowModels === false && consent.allowAutomatic === false
      && Array.isArray(consent.categories) && consent.categories.length > 0
      && new Set(consent.categories).size === consent.categories.length && consent.categories.every(value => categories.includes(value))
      && consent.categories.includes(category) && stamp(consent.grantedAt) && stamp(consent.expiresAt)
      && Date.parse(consent.grantedAt) <= at && Date.parse(consent.expiresAt) > at;
  }
  return async function read(context, { category = 'allowance' } = {}) {
    // Capture caller intent before any await. No supplied owner/email/token is used.
    const target = { channel: context?.channel, chatType: context?.chatType, conversationId: context?.conversationId };
    const clock = now(), at = clock?.getTime();
    if (!Number.isFinite(at) || !Number.isSafeInteger(maxSourceAgeMs) || maxSourceAgeMs <= 0 || maxSourceAgeMs > 86400000
      || !categories.includes(category) || typeof isCurrent !== 'function') return unavailable('policy_unavailable');
    try {
      const auth = await authority(target);
      if (!auth) return unavailable('private_owner_required');
      const consent = await readConsent(auth.ownerId, target), consentCopy = structuredClone(consent);
      if (!consentMatches(consentCopy, auth, target, category, at)) return unavailable('consent_required');
      // The adapter must return persisted records plus trusted source freshness
      // bound to each id/revision. Read time and SQL insert time do not prove
      // that the source roster/document was current.
      const snapshot = await readSnapshot(auth.identity);
      if (snapshot?.source !== 'persisted_financial_ledger' || snapshot.ownerId !== auth.ownerId
        || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.freshness)) return unavailable('source_unavailable');
      const result = queryUpcomingFinancialForecast({ identity: auth.identity, records: snapshot.records, now: clock, category });
      if (result.access !== 'allowed' || !['available', 'no_data', 'incomplete'].includes(result.state)) return unavailable('source_unavailable');
      const projected = [];
      for (const event of result.events) {
        const evidence = snapshot.freshness.filter(item => item?.id === event.id && item.revision === event.revision);
        if (evidence.length !== 1 || !stamp(evidence[0].sourceAsOf) || !stamp(evidence[0].recordedAt)
          || Date.parse(evidence[0].sourceAsOf) > Date.parse(evidence[0].recordedAt) || Date.parse(evidence[0].recordedAt) > at
          || at - Date.parse(evidence[0].sourceAsOf) > maxSourceAgeMs) return unavailable('source_freshness_unproven');
        // Do not forward internal ids, source references, owner or documents.
        const { id, sourceId, ruleVersion, ...publicEvent } = event;
        projected.push({ ...publicEvent, sourceAsOf: evidence[0].sourceAsOf });
      }
      // Re-resolve after the async source read. Revocation/relink/account
      // changes discard all amounts rather than deliver a stale authorization.
      const current = await authority(target);
      if (!current || current.binding !== auth.binding || current.ownerId !== auth.ownerId) return unavailable('binding_changed');
      const latestConsent = await readConsent(current.ownerId, target), currentAt = now().getTime();
      if (!consentMatches(latestConsent, current, target, category, currentAt)
        || digest(latestConsent) !== digest(consentCopy)) return unavailable('consent_changed');
      if (isCurrent({ ownerId: auth.ownerId, binding: auth.binding, consentRevision: consentCopy.revision }) !== true) return unavailable('authority_changed');
      if (!Number.isFinite(currentAt) || projected.some(event => currentAt - Date.parse(event.sourceAsOf) > maxSourceAgeMs)) return unavailable('source_freshness_unproven');
      // isCurrent is a synchronous, host-owned lifecycle fence. A host without
      // such a fence cannot configure this reader. No await follows this check.
      // This is a read result for a future guarded host, not a delivery permit.
      // The host must revalidate immediately before any separately authorized send.
      return { state: result.state, category, horizonDays: 30, hasMore: result.hasMore, events: projected,
        source: 'persisted_financial_ledger', sourceFreshness: projected.length ? 'verified' : 'unknown', readAt: new Date(currentAt).toISOString() };
    } catch { return unavailable('source_or_authority_unavailable'); }
  };
}

// Opaque binding for a consent UI/store prepared by the existing verified host.
// This never resolves an account or grants consent by itself.
export function financialConversationBinding({ ownerId, conversationId, linkedAt, accessKeyHash = '' }) {
  return digest([ownerId, 'telegram', conversationId, linkedAt, accessKeyHash]);
}
