const SURFACES = new Set([
  'mobile', 'web', 'wear_os', 'watchos', 'tv', 'google_tv', 'samsung_tv', 'lg_tv',
  'telegram', 'whatsapp', 'car', 'carplay', 'android_auto',
]);

const DISPLAY_MODES = new Set(['preferredName', 'callSign', 'hidden']);
const DESTINATIONS = new Set(['home', 'roster', 'flightdeck', 'finance', 'crewcierge', 'overnight', 'crewlife']);
const RECEIPT_RANK = Object.freeze({ new: 0, delivered: 1, seen: 2, dismissed: 3, acted: 4 });
const PRIVACY_CLASSES = new Set(['public', 'personal', 'sensitive']);
const FRESHNESS = new Set(['current', 'recent', 'stale', 'unknown']);

const CAPABILITIES = Object.freeze({
  mobile: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: true, longFormText: true, handoff: true, sharedEnvironment: false, proactive: true, touch: true, textInput: true }),
  web: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: true, longFormText: true, handoff: true, sharedEnvironment: false, proactive: true, touch: true, textInput: true }),
  wear_os: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: false, longFormText: false, handoff: true, sharedEnvironment: false, proactive: true, touch: true, textInput: false }),
  watchos: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: false, longFormText: false, handoff: true, sharedEnvironment: false, proactive: true, touch: true, textInput: false }),
  tv: freezeCapabilities({ audioInput: false, audioOutput: true, richCards: true, longFormText: false, handoff: true, sharedEnvironment: true, proactive: false, touch: false, textInput: false }),
  google_tv: freezeCapabilities({ audioInput: false, audioOutput: true, richCards: true, longFormText: false, handoff: true, sharedEnvironment: true, proactive: false, touch: false, textInput: false }),
  samsung_tv: freezeCapabilities({ audioInput: false, audioOutput: true, richCards: true, longFormText: false, handoff: true, sharedEnvironment: true, proactive: false, touch: false, textInput: false }),
  lg_tv: freezeCapabilities({ audioInput: false, audioOutput: true, richCards: true, longFormText: false, handoff: true, sharedEnvironment: true, proactive: false, touch: false, textInput: false }),
  telegram: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: true, longFormText: true, handoff: true, sharedEnvironment: false, proactive: true, touch: false, textInput: true }),
  whatsapp: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: true, longFormText: true, handoff: true, sharedEnvironment: false, proactive: true, touch: false, textInput: true }),
  car: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: false, longFormText: false, handoff: true, sharedEnvironment: false, proactive: true, touch: false, textInput: false }),
  carplay: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: false, longFormText: false, handoff: true, sharedEnvironment: false, proactive: true, touch: false, textInput: false }),
  android_auto: freezeCapabilities({ audioInput: true, audioOutput: true, richCards: false, longFormText: false, handoff: true, sharedEnvironment: false, proactive: true, touch: false, textInput: false }),
});

function freezeCapabilities(value) {
  return Object.freeze({ ...value });
}

function text(value, max = 160) {
  return String(value ?? '').replace(/[<>\r\n]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

function id(value, max = 128) {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9._:@/-]+/g, '-').slice(0, max);
}

function requiredId(value, label) {
  const normalized = id(value);
  if (!normalized) throw new Error(`continuity ${label} is required`);
  return normalized;
}

function surface(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!SURFACES.has(normalized)) throw new Error(`continuity unsupported surface: ${normalized || 'missing'}`);
  return normalized;
}

function isoFromMs(value) {
  return new Date(value).toISOString();
}

function nowMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Date.now();
}

function ttl(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), 1_000), 24 * 60 * 60_000);
}

function uniqueId(prefix, userId, at) {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `${prefix}:${random}` : `${prefix}:${id(userId, 48)}:${at}:${Math.random().toString(36).slice(2, 10)}`;
}

function displayMode(value, fallback) {
  return DISPLAY_MODES.has(value) ? value : fallback;
}

function normalizeContextRef(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  const journeyId = id(source.journeyId);
  const flightId = id(source.flightId);
  const stayId = id(source.stayId);
  const conversationId = id(source.conversationId);
  const rosterDate = text(source.rosterDate, 32);
  if (journeyId) result.journeyId = journeyId;
  if (flightId) result.flightId = flightId;
  if (stayId) result.stayId = stayId;
  if (conversationId) result.conversationId = conversationId;
  if (rosterDate) result.rosterDate = rosterDate;
  return Object.freeze(result);
}

export function normalizeUserIdentityProfile(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const userId = requiredId(source.userId ?? source.id, 'userId');
  const preferredName = text(source.preferredName ?? source.name, 48) || 'Tripulante';
  const callSign = text(source.callSign, 48);
  const display = source.display && typeof source.display === 'object' ? source.display : {};
  return Object.freeze({
    userId,
    preferredName,
    ...(callSign ? { callSign } : {}),
    ...(text(source.avatarUrl, 512) ? { avatarUrl: text(source.avatarUrl, 512) } : {}),
    discoverableByCallSign: Boolean(source.discoverableByCallSign),
    display: Object.freeze({
      phone: displayMode(display.phone, 'preferredName'),
      watch: displayMode(display.watch, callSign ? 'callSign' : 'preferredName'),
      tv: displayMode(display.tv, 'preferredName'),
      crewSearch: displayMode(display.crewSearch, callSign ? 'callSign' : 'preferredName'),
    }),
  });
}

export function resolveDisplayName(profile, target = 'mobile') {
  const identity = normalizeUserIdentityProfile(profile);
  const normalizedTarget = String(target || '').toLowerCase();
  const slot = normalizedTarget === 'wear_os' || normalizedTarget === 'watchos' || normalizedTarget === 'watch'
    ? 'watch'
    : normalizedTarget === 'tv' || normalizedTarget.endsWith('_tv')
      ? 'tv'
      : normalizedTarget === 'crew_search'
        ? 'crewSearch'
        : 'phone';
  const mode = identity.display[slot];
  if (mode === 'hidden') return '';
  if (mode === 'callSign' && identity.callSign) return identity.callSign;
  return identity.preferredName;
}

export function createContinuityContext(raw = {}) {
  const userId = requiredId(raw.userId, 'userId');
  const sourceSurface = surface(raw.sourceSurface);
  const at = nowMs(raw.now);
  const duration = ttl(raw.ttlMs, 30 * 60_000);
  const contextRef = normalizeContextRef({
    journeyId: raw.activeJourneyId,
    flightId: raw.activeFlightId,
    stayId: raw.activeStayId,
    conversationId: raw.conversationId,
    rosterDate: raw.rosterDate,
  });
  return Object.freeze({
    contextId: id(raw.contextId) || uniqueId('ccctx', userId, at),
    userId,
    sourceSurface,
    ...('journeyId' in contextRef ? { activeJourneyId: contextRef.journeyId } : {}),
    ...('flightId' in contextRef ? { activeFlightId: contextRef.flightId } : {}),
    ...('stayId' in contextRef ? { activeStayId: contextRef.stayId } : {}),
    ...('conversationId' in contextRef ? { conversationId: contextRef.conversationId } : {}),
    ...(text(raw.lastIntent, 80) ? { lastIntent: text(raw.lastIntent, 80) } : {}),
    ...(id(raw.lastResponseId) ? { lastResponseId: id(raw.lastResponseId) } : {}),
    updatedAt: isoFromMs(at),
    expiresAt: isoFromMs(at + duration),
  });
}

export function canResumeContinuity(context, { userId, now } = {}) {
  if (!context || typeof context !== 'object') return false;
  const expectedUserId = id(userId);
  if (!expectedUserId || id(context.userId) !== expectedUserId) return false;
  if (!SURFACES.has(String(context.sourceSurface || ''))) return false;
  const expiresAt = Date.parse(String(context.expiresAt || ''));
  if (!Number.isFinite(expiresAt)) return false;
  return nowMs(now) < expiresAt;
}

export function createHandoffIntent(raw = {}) {
  const userId = requiredId(raw.userId, 'userId');
  const from = surface(raw.from);
  const target = surface(raw.target);
  const destination = String(raw.destination || '').trim().toLowerCase();
  if (!DESTINATIONS.has(destination)) throw new Error(`continuity unsupported handoff destination: ${destination || 'missing'}`);
  const at = nowMs(raw.now);
  const duration = ttl(raw.ttlMs, 5 * 60_000);
  return Object.freeze({
    handoffId: id(raw.handoffId) || uniqueId('cchandoff', userId, at),
    userId,
    from,
    target,
    destination,
    contextRef: normalizeContextRef(raw.contextRef),
    createdAt: isoFromMs(at),
    expiresAt: isoFromMs(at + duration),
  });
}

export function consumeHandoffIntent(intent, { userId, now } = {}) {
  if (!intent || typeof intent !== 'object') return Object.freeze({ ok: false, reason: 'missing' });
  const expectedUserId = id(userId);
  if (!expectedUserId || id(intent.userId) !== expectedUserId) return Object.freeze({ ok: false, reason: 'identity-mismatch' });
  const expiresAt = Date.parse(String(intent.expiresAt || ''));
  if (!Number.isFinite(expiresAt) || nowMs(now) >= expiresAt) return Object.freeze({ ok: false, reason: 'expired' });
  if (!SURFACES.has(String(intent.from || '')) || !SURFACES.has(String(intent.target || ''))) return Object.freeze({ ok: false, reason: 'invalid-surface' });
  if (!DESTINATIONS.has(String(intent.destination || ''))) return Object.freeze({ ok: false, reason: 'invalid-destination' });
  return Object.freeze({
    ok: true,
    handoffId: id(intent.handoffId),
    destination: intent.destination,
    target: intent.target,
    contextRef: normalizeContextRef(intent.contextRef),
  });
}

function normalizeReceipt(raw = {}) {
  const state = Object.prototype.hasOwnProperty.call(RECEIPT_RANK, raw.state) ? raw.state : 'new';
  return {
    eventId: requiredId(raw.eventId, 'eventId'),
    userId: requiredId(raw.userId, 'userId'),
    state,
    ...(raw.surface ? { surface: surface(raw.surface) } : {}),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : isoFromMs(nowMs(raw.now)),
  };
}

export function mergeNotificationReceipt(left, right) {
  const a = normalizeReceipt(left);
  const b = normalizeReceipt(right);
  if (a.userId !== b.userId) throw new Error('continuity identity mismatch while merging notification receipt');
  if (a.eventId !== b.eventId) throw new Error('continuity event identity mismatch while merging notification receipt');
  const winner = RECEIPT_RANK[b.state] > RECEIPT_RANK[a.state] ? b : a;
  const latestTimestamp = Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b.updatedAt : a.updatedAt;
  return Object.freeze({ ...winner, updatedAt: latestTimestamp });
}

export function advanceNotificationReceipt(current, next = {}) {
  const proposed = normalizeReceipt(next);
  if (!current) return Object.freeze(proposed);
  return mergeNotificationReceipt(current, proposed);
}

export function surfaceCapabilities(value) {
  const normalized = surface(value);
  return CAPABILITIES[normalized];
}

export function normalizeCrewciergeResponse(raw = {}) {
  const responseId = requiredId(raw.responseId, 'responseId');
  const intent = text(raw.intent, 80);
  const headline = text(raw.headline, 160);
  if (!intent) throw new Error('continuity response intent is required');
  if (!headline) throw new Error('continuity response headline is required');

  const facts = Array.isArray(raw.facts) ? raw.facts.slice(0, 8).map((fact) => Object.freeze({
    kind: text(fact?.kind, 64),
    value: text(fact?.value, 160),
    ...(text(fact?.label, 80) ? { label: text(fact?.label, 80) } : {}),
    ...(text(fact?.source, 80) ? { source: text(fact?.source, 80) } : {}),
    ...(FRESHNESS.has(fact?.freshness) ? { freshness: fact.freshness } : {}),
  })).filter((fact) => fact.kind && fact.value) : [];

  const primaryFact = raw.primaryFact && typeof raw.primaryFact === 'object'
    ? Object.freeze({ kind: text(raw.primaryFact.kind, 64), value: text(raw.primaryFact.value, 160) })
    : undefined;

  const actions = Array.isArray(raw.actions) ? raw.actions.slice(0, 3).map((action) => Object.freeze({
    kind: text(action?.kind, 64),
    label: text(action?.label, 80),
    ...(text(action?.deepLink, 512) ? { deepLink: text(action?.deepLink, 512) } : {}),
    confirmationRequired: Boolean(action?.confirmationRequired),
  })).filter((action) => action.kind && action.label) : [];

  const provenance = raw.provenance && typeof raw.provenance === 'object'
    ? Object.freeze({
        source: text(raw.provenance.source, 80),
        ...(text(raw.provenance.observedAt, 64) ? { observedAt: text(raw.provenance.observedAt, 64) } : {}),
        ...(FRESHNESS.has(raw.provenance.freshness) ? { freshness: raw.provenance.freshness } : { freshness: 'unknown' }),
      })
    : Object.freeze({ source: '', freshness: 'unknown' });

  const privacyClass = PRIVACY_CLASSES.has(raw.privacyClass) ? raw.privacyClass : 'personal';

  return Object.freeze({
    responseId,
    intent,
    headline,
    ...(text(raw.shortText, 240) ? { shortText: text(raw.shortText, 240) } : {}),
    ...(text(raw.speechText, 600) ? { speechText: text(raw.speechText, 600) } : {}),
    ...(primaryFact?.kind && primaryFact?.value ? { primaryFact } : {}),
    facts: Object.freeze(facts),
    actions: Object.freeze(actions),
    provenance,
    privacyClass,
  });
}

export const continuityContract = Object.freeze({
  schemaVersion: 1,
  surfaces: Object.freeze([...SURFACES]),
  receiptStates: Object.freeze(Object.keys(RECEIPT_RANK)),
  handoffDestinations: Object.freeze([...DESTINATIONS]),
});
