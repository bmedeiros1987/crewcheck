import { baseTimeZone } from './timezone-choice.mjs';
export function publishedGateDate(value) {
  if (typeof value !== 'string') return '';
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const ms = Date.parse(iso + 'T12:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === iso ? iso : '';
}
export function gateQueryDay(identity, now = Date.now()) {
  const date = publishedGateDate(identity?.departureDate);
  const origin = String(identity?.origin || '').trim().toUpperCase();
  const destination = String(identity?.destination || '').trim().toUpperCase();
  const flight = String(identity?.flight || '').replace(/\s/g, '').toUpperCase();
  const zone = baseTimeZone(origin); // Confirmed existing map; never device/UTC fallback.
  const deny = reason => ({ allowed: false, reason, originTimeZone: zone, departureDate: date });
  if (!date || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(flight)) return deny('occurrence-unverified');
  if (!zone || !Number.isFinite(now)) return deny('origin-timezone-unverified');
  if (identity.scheduledDepartureUtc === undefined) return deny('published-instant-unverified');
  if (identity.scheduledDepartureUtc !== undefined) {
    const stamp = identity.scheduledDepartureUtc;
    if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(stamp) || !Number.isFinite(Date.parse(stamp)) || !publishedGateDate(stamp.slice(0,10))) return deny('published-instant-unverified');
    const values = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Date.parse(stamp));
    const value = k => values.find(x=>x.type===k)?.value;
    if (`${value('year')}-${value('month')}-${value('day')}` !== date) return deny('published-instant-date-mismatch');
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const p = key => parts.find(x => x.type === key)?.value;
  if (`${p('year')}-${p('month')}-${p('day')}` !== date) return deny('outside-published-flight-day');
  return { allowed: true, reason: 'published-flight-day', originTimeZone: zone, departureDate: date };
}
export function originFlightDate(instant, origin) {
  const zone = baseTimeZone(origin);
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!zone || !Number.isFinite(ms)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ms);
  const part = key => parts.find(x=>x.type===key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !publishedGateDate(value.slice(0,10))) return '';
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}
// Events MUST be the existing canonical projection of this authorized roster.
// Published BRT clocks/leg rollover are converted by that engine, never by origin wall-clock matching.
export function findPublishedGateLeg(roster, request, canonicalEvents = []) {
  const normalize = x => String(x || '').replace(/\s/g, '').toUpperCase();
  const date = publishedGateDate(request?.departureDate);
  if (!date) return null;
  const requestedUtc = request.scheduledDepartureUtc === undefined ? undefined : utcInstant(request.scheduledDepartureUtc);
  if (requestedUtc === '') return null;
  const matches = [];
  for (const event of canonicalEvents) {
    if (event.kind !== 'flight' || normalize(event.flightNumber) !== normalize(request.flight) || normalize(event.origin) !== normalize(request.origin) || normalize(event.destination) !== normalize(request.destination)) continue;
    const utc = utcInstant(event.startDateTime), publishedDate = publishedGateDate(event.date);
    if (!utc || !publishedDate || originFlightDate(utc,event.origin) !== date || (requestedUtc !== undefined && requestedUtc !== utc)) continue;
    for (const day of Array.isArray(roster?.days) ? roster.days : []) {
      if (publishedGateDate(day?.date) !== publishedDate) continue;
      const sourceLeg = event.leg;
      if (!sourceLeg || (request.eventId && request.eventId !== event.id)) continue;
      // Stable published tuple, independent of canonical sorting/filtering indexes.
      const key = leg => [leg?.flightNumber,leg?.origin,leg?.destination,leg?.departureTime,leg?.arrivalTime].map(normalize).join('|');
      for (const leg of Array.isArray(day.legs) ? day.legs : []) {
        if (!leg || !/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(String(leg.departureTime || '')) || key(leg) !== key(sourceLeg)) continue;
        matches.push({ day, leg, identity: Object.freeze({flight:normalize(event.flightNumber),origin:normalize(event.origin),destination:normalize(event.destination),departureDate:date,scheduledDepartureUtc:utc,publishedDate,eventId:event.id}) });
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
export function findPublishedGateOccurrence(roster, request, canonicalEvents) { return findPublishedGateLeg(roster, request, canonicalEvents)?.identity || null; }
export function gateQuerySuppressed(decision) {
  return { ok: false, querySuppressed: true, queryReason: decision.reason, configured: false,
    message: 'Consulta sem custo: somente na data publicada do voo, com fuso da origem e ocorrência confirmados.', quality: 0 };
}
