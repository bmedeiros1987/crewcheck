import { createHash } from 'node:crypto';
import { buildCanonicalRosterEvents, normalizeRosterDays } from './generated/canonicalRoster.mjs';
import { publication, observePublication, readReview } from './generated/rosterPublicationReview.mjs';
import { projectConciergeJourneyPrograms } from './journey-programs.mjs';
import { evaluateCriticalWeatherDelivery } from '../weather/critical-observation.mjs';

// Pure preview only. No DB, route, timer, queue, transport, registration or flag.
// authority must come from an authenticated, fresh read of the active DB row;
// accepting this object from a request body does not establish that authority.
const MINUTE = 60_000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value, max = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const iso = value => new Date(value).toISOString();
const blocked = reason => ({ kind: 'operational-next-duty', status: 'blocked', reason, submissionAllowed: false });

function authorityValid(value, now) {
  if (!object(value) || value.active !== true || !Number.isFinite(now)) return false;
  if (![value.ownerScope, value.rosterId].every(item => typeof item === 'string' && item.length > 0 && item.length <= 160 && clean(item) === item) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.rosterKey || '') || !/^[a-f0-9]{64}$/.test(value.fingerprint || '')) return false;
  const readAt = instant(value.checkedAt), revision = instant(value.activeRevision);
  return Number.isFinite(readAt) && Number.isFinite(revision) && revision <= readAt && readAt <= now && now - readAt <= MINUTE;
}
function authorityReference(value) {
  return { scopeHash: hash(value.ownerScope), rosterId: value.rosterId, rosterKey: value.rosterKey,
    fingerprint: value.fingerprint, activeRevision: value.activeRevision };
}
function sameAuthority(left, right) {
  return ['scopeHash', 'rosterId', 'rosterKey', 'fingerprint', 'activeRevision'].every(key => left?.[key] === right?.[key]);
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && iso(time).slice(0, 10) === value;
}
function publishedInputsValid(roster) {
  const clock = value => {
    const match = typeof value === 'string' && value.match(/^(\d{1,2}):(\d{2})(?:\(\+(\d{1,2})\))?$/);
    return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
  };
  // This first consumer accepts complete parser-normalized civil dates and
  // flight clocks. Missing fields must not borrow engine fallback day/hour.
  return roster.days.every(day => {
    const date = typeof day?.date === 'string' && day.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!date || !validDate(`${date[3]}-${date[2]}-${date[1]}`) || !Array.isArray(day.legs)) return false;
    return day.legs.every(leg => clock(leg?.departureTime) && clock(leg?.arrivalTime));
  });
}

function weatherPreview(airport, observations, stationForAirport, now) {
  const mapping = stationForAirport(airport);
  const station = typeof mapping === 'string' ? mapping.trim().toUpperCase() : '';
  if (!/^[A-Z]{4}$/.test(station)) return { airport, state: 'unavailable', reason: 'station-unconfirmed' };
  const accepted = [];
  for (const item of observations.filter(item => item?.airport === airport)) {
    const report = item.report;
    // Reuse the existing station/provider/observation-age gate. This is not a
    // severity assessment and its shouldSend result is never used by a briefing.
    const decision = evaluateCriticalWeatherDelivery({ report, station, now,
      change: { severity: 0, fingerprint: 'briefing-read-only', critical: false } });
    if (decision.accepted) accepted.push({ airport, station, state: 'available', provider: report.provider,
      observedAt: decision.observedAt, expiresAt: iso(Date.parse(decision.observedAt) + 60 * MINUTE), raw: clean(report.raw, 1200) });
  }
  accepted.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (!accepted.length) return { airport, station, state: 'unavailable', reason: 'no-fresh-official-observation' };
  const latest = accepted.filter(item => item.observedAt === accepted[0].observedAt);
  if (new Set(latest.map(item => item.raw)).size > 1) return { airport, station, state: 'unavailable', reason: 'conflicting-observations' };
  return latest.sort((a, b) => a.provider.localeCompare(b.provider))[0];
}

function publicationPreview(events, authority, previous) {
  const reference = authorityReference(authority);
  const dates = Array.isArray(authority.completeDates) ? authority.completeDates.filter(validDate) : [];
  // Cross-account or cross-month observations establish a fresh baseline. IDs
  // can change on re-import; the existing comparison engine owns correlation.
  const sameScope = previous?.authority?.scopeHash === reference.scopeHash && previous?.authority?.rosterKey === reference.rosterKey;
  const prior = sameScope ? readReview({ getItem: () => JSON.stringify(previous.review) }, reference.scopeHash) : null;
  if (sameScope && !prior) throw new Error('Previous publication is unreadable');
  const observed = publication(events, dates);
  if (prior && instant(previous.authority.activeRevision) === instant(reference.activeRevision) && previous.authority.fingerprint !== reference.fingerprint) throw new Error('Conflicting active revision');
  if (prior && previous.authority.fingerprint === reference.fingerprint && prior.publication.revision !== observed.revision) throw new Error('Unbound publication content');
  const next = observePublication(reference.scopeHash, prior, observed);
  const changes = prior && next.version !== prior.version
    ? next.history.filter(item => item.version === next.version).map(item => ({
      kind: item.kind, before: item.before, after: item.after,
      eventId: hash([reference.scopeHash, reference.rosterKey, next.version, item.id, item.kind, item.before, item.after]),
    })) : [];
  return { authority: reference, review: next, changes, baselineEstablished: !prior, uncertain: next.unknown,
    unconfirmed: next.unconfirmed || [] };
}

export function buildOperationalBriefingPreview({ authority, roster, now, previousPublication = null, leadMinutes = 90,
  weather = [], stationForAirport = () => '' } = {}) {
  if (!authorityValid(authority, now)) return blocked('active-roster-authority-unavailable');
  if (!object(roster) || !Array.isArray(roster.days) || !Number.isInteger(leadMinutes) || leadMinutes < 15 || leadMinutes > 180) return blocked('invalid-input');
  if (String(roster.year) + '-' + String(roster.month).padStart(2, '0') !== authority.rosterKey) return blocked('roster-period-mismatch');
  if (!publishedInputsValid(roster)) return blocked('incomplete-published-dates-or-clocks');
  if (previousPublication?.authority?.scopeHash === hash(authority.ownerScope) &&
      instant(previousPublication.authority.activeRevision) > instant(authority.activeRevision)) return blocked('older-active-revision');
  if (!Array.isArray(weather) || weather.length > 40 || typeof stationForAirport !== 'function') return blocked('invalid-observations');
  try {
    const canonicalRoster = normalizeRosterDays(roster);
    if (String(canonicalRoster.year) + '-' + String(canonicalRoster.month).padStart(2, '0') !== authority.rosterKey) return blocked('canonical-roster-period-mismatch');
    const events = buildCanonicalRosterEvents(roster);
    const review = publicationPreview(events, authority, previousPublication);
    const programs = projectConciergeJourneyPrograms(events, []);
    const program = programs.find(item => item.end.getTime() > now) || null;
    const nonflight = events.find(item => item.kind === 'duty' && Date.parse(item.endDateTime) > now &&
      (!program || Date.parse(item.startDateTime) < program.start.getTime()));
    const base = { kind: 'operational-next-duty', status: 'preview', submissionAllowed: false,
      generatedAt: iso(now), validUntil: iso(Math.min(now + MINUTE, instant(authority.checkedAt) + MINUTE)),
      authority: review.authority, publication: review,
      sourceLabel: 'Escala ativa importada; a leitura do banco não comprova nova publicação da companhia.',
      unsupportedChanges: ['duty-debrief', 'radar', 'transport'],
      unsupportedSources: ['radar', 'transport', 'notam', 'operational-clearance'] };
    if (nonflight) return { ...base, duty: null, window: { state: 'unsupported-duty' }, weather: [] };
    if (!program) return { ...base, duty: null, window: { state: 'no-upcoming-duty' }, weather: [] };
    const selected = events.filter(event => event.kind === 'flight' && event.journeyId === program.journeyId)
      .sort((a, b) => Date.parse(a.startDateTime) - Date.parse(b.startDateTime));
    const first = selected[0];
    // Arrival/departure fallbacks remain visible as planned times, never as a
    // published presentation or confirmed end of duty.
    const presentationConfirmed = first?.sourceConfidence === 'alta' && first.presentation !== first.departure;
    const presentationAt = presentationConfirmed ? program.start.toISOString() : null;
    const duty = { journeyId: program.journeyId, eventIds: [...program.canonicalEventIds], presentationAt,
      plannedEndAt: program.end.toISOString(), endKind: program.endKind,
      legs: selected.map(event => ({ eventId: event.id, flight: clean(event.flightNumber, 32),
        origin: clean(event.origin, 4), destination: clean(event.destination, 4),
        departureAt: event.startDateTime, arrivalAt: event.endDateTime })) };
    const opensAt = presentationAt ? iso(Date.parse(presentationAt) - leadMinutes * MINUTE) : null;
    const window = { opensAt, expiresAt: presentationAt, leadMinutes,
      state: !presentationAt ? 'presentation-unconfirmed' : now >= Date.parse(presentationAt) ? 'in-progress'
        : now >= Date.parse(opensAt) ? 'due' : 'before-window' };
    const airports = [...new Set(duty.legs.flatMap(leg => [leg.origin, leg.destination]))];
    const observations = airports.map(airport => weatherPreview(airport, weather, stationForAirport, now));
    const content = { duty, weather: observations };
    // Diagnostic engine IDs are excluded from semantic deduplication keys.
    const semanticDuty = { presentationAt, plannedEndAt: duty.plannedEndAt, endKind: duty.endKind,
      legs: duty.legs.map(({ eventId, ...leg }) => leg) };
    const validUntil = iso(Math.min(Date.parse(base.validUntil), ...observations.filter(item => item.state === 'available').map(item => Date.parse(item.expiresAt))));
    return { ...base, ...content, window, validUntil,
      dutyKey: hash([review.authority.scopeHash, authority.rosterKey, semanticDuty]),
      previewFingerprint: hash([semanticDuty, observations]) };
  } catch { return blocked('canonical-or-source-preview-unavailable'); }
}

// A candidate is NOT permission to submit. Integration must atomically claim it
// and repeat current roster, consent, binding and expiry checks on a held lease.
// This never imports the legacy scheduler or reuses meteorological consent.
export function planOperationalBriefingCandidate({ preview, authority, consent, bindingRevision,
  deliveryState, now } = {}) {
  const reject = reason => ({ eligible: false, reason, submissionAllowed: false });
  if (preview?.status !== 'preview' || !preview.dutyKey || !authorityValid(authority, now) ||
      !sameAuthority(preview.authority, authorityReference(authority))) return reject('stale-or-unverified-roster');
  if (now < instant(preview.generatedAt) || !Number.isFinite(instant(preview.generatedAt)) || now >= instant(preview.validUntil) || !Number.isFinite(instant(preview.validUntil))) return reject('preview-expired');
  const opensAt = instant(preview.window?.opensAt), expiresAt = instant(preview.window?.expiresAt);
  if (preview.window?.state !== 'due' || !Number.isFinite(opensAt) || !Number.isFinite(expiresAt) || opensAt >= expiresAt || now < opensAt || now >= expiresAt) return reject('outside-briefing-window');
  if (consent?.enabled !== true || consent.topic !== 'operational-next-duty' || consent.scopeHash !== preview.authority.scopeHash ||
      !clean(bindingRevision) || consent.bindingRevision !== bindingRevision || !clean(consent.revision)) return reject('operational-consent-unavailable');
  const grantedAt = instant(consent.grantedAt);
  if (!Number.isFinite(grantedAt) || grantedAt > now || grantedAt > instant(preview.window.opensAt)) return reject('no-consent-at-window-start');
  // An unreadable durable ledger is not an empty ledger. Known absence must be
  // represented explicitly by the future authenticated persistence adapter.
  if (deliveryState?.available !== true || !Array.isArray(deliveryState.seenEventIds) || !deliveryState.seenEventIds.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) return reject('delivery-state-unavailable');
  const eventId = hash(['operational-next-duty', preview.dutyKey, bindingRevision, consent.revision]);
  if (deliveryState.seenEventIds.includes(eventId)) return reject('already-recorded');
  return { eligible: true, submissionAllowed: false, event: { eventId, kind: 'operational-next-duty',
    authority: structuredClone(preview.authority), bindingRevision, consentRevision: consent.revision,
    occurredAt: preview.window.opensAt, expiresAt: iso(Math.min(instant(preview.window.expiresAt), instant(preview.validUntil))), previewFingerprint: preview.previewFingerprint } };
}
