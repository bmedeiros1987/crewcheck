/** Server-only visitor projection. Accept only host-authenticated, persisted
 * records. This module is NOT an authentication provider or location collector.
 * No legacy `map`/`roster` permission implicitly authorizes a television.
 */
export const GUEST_FIELDS = Object.freeze([
  'displayName', 'status', 'confirmedCity', 'plannedCity', 'nextFlight',
  'returnEstimate', 'stayCity', 'hotel', 'room', 'calendar', 'preciseLocation',
]);
export const GUEST_HEADERS = Object.freeze({
  'Content-Type': 'application/json', 'Cache-Control': 'no-store, private',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
});
const MINUTE = 60000;
const DAY = 86400000;
const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
const enabled = (value, key) => own(value, key) && value[key] === true;
const identity = value => typeof value === 'string' && /^[A-Za-z0-9_@.:-]{1,160}$/.test(value);
function time(value) {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return NaN;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  if (year<1970 || month<1 || month>12 || day<1 || day>new Date(Date.UTC(year,month,0)).getUTCDate()) return NaN;
  return Date.parse(value);
}
const iso = value => new Date(value).toISOString();
function text(value, limit = 100) {
  return typeof value === 'string' && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}
export class GuestError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
function fail(code = 'guest_not_authorized') { throw new GuestError(403, code); }
function active(record, now) {
  return record && record.active === true && record.revoked === false &&
    Number.isSafeInteger(record.revision) && record.revision >= 1 &&
    Number.isFinite(time(record.issuedAt)) && time(record.issuedAt) <= now &&
    time(record.expiresAt) > now;
}
/** Intersect the visitor's explicit TV consent with this specific display grant. */
export function evaluateGuestAccess(context, now = Date.now()) {
  if (!Number.isFinite(now)) fail();
  const { device, visitor, grant } = context || {};
  if (![device, visitor, grant].every(record => active(record, now))) fail();
  if (![device.deviceId, device.ownerId, device.visitorId, device.grantId,
    visitor.id, visitor.ownerId, grant.id, grant.ownerId, grant.visitorId, grant.deviceId].every(identity)) fail();
  if (device.audience !== 'visitor' || !Array.isArray(device.scopes) ||
      device.scopes.length !== 1 || device.scopes[0] !== 'tv:visitor:read' ||
      !['lg-webos', 'samsung-tizen'].includes(device.platform)) fail();
  if (device.ownerId !== visitor.ownerId || device.ownerId !== grant.ownerId ||
      device.visitorId !== visitor.id || device.visitorId !== grant.visitorId ||
      device.deviceId !== grant.deviceId || device.grantId !== grant.id ||
      grant.channel !== 'tv' || visitor.tvAllowed !== true) fail();
  if (time(device.expiresAt) - time(device.issuedAt) > DAY ||
      time(grant.expiresAt) - time(grant.issuedAt) > 30 * DAY) fail();
  const from = time(grant.from), until = time(grant.until);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > 31 * DAY) fail();
  const fields = Object.fromEntries(GUEST_FIELDS.map(key => [key,
    enabled(visitor.tvFields, key) && enabled(grant.fields, key)]));
  // Precise presence and rooms are separate consent choices, never profile defaults.
  fields.room = fields.room && fields.hotel;
  const expires = Math.min(time(device.expiresAt), time(visitor.expiresAt), time(grant.expiresAt));
  return Object.freeze({ ownerId: device.ownerId, deviceId: device.deviceId,
    visitorId: visitor.id, grantId: grant.id, fields: Object.freeze(fields), from, until,
    expires, revision: `${device.revision}:${visitor.revision}:${grant.revision}` });
}
function trustedFact(fact, access, sources, now, maxAge = 30 * MINUTE) {
  const observed = time(fact?.observedAt), expires = time(fact?.expiresAt);
  if (!fact || fact.ownerId !== access.ownerId || !sources.includes(fact.source) ||
      fact.sharedWithVisitors !== true || !Number.isFinite(observed) || observed > now ||
      now - observed > maxAge || !(expires > now) || expires <= observed) return null;
  return { observed, expires: Math.min(expires, observed + maxAge, access.expires), fact };
}
const TITLES = Object.freeze({ displayName:'Pessoa acompanhada',status:'Como está',confirmedCity:'Última cidade confirmada',
  plannedCity:'Destino previsto na escala',nextFlight:'Próximo voo',returnEstimate:'Previsão de retorno',
  stayCity:'Próximo pernoite',hotel:'Hotel compartilhado',room:'Quarto compartilhado',calendar:'Programação compartilhada',preciseLocation:'Localização compartilhada' });
function windowContains(start, end, access) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= access.from && end >= start && end <= access.until;
}
/** Whitelist individual values. Never spread a roster/profile/presence object. */
export function projectVisitorTv(context, facts = {}, now = Date.now()) {
  const access = evaluateGuestAccess(context, now);
  const cards = [];
  function add(key, sources, evidence, value, maxAge) {
    if (!access.fields[key]) return;
    const checked = trustedFact(facts[key], access, sources, now, maxAge);
    if (!checked) return;
    if (['status','confirmedCity','preciseLocation'].includes(key) &&
        (now < access.from || now >= access.until || checked.observed < access.from)) return;
    const clean = value(checked.fact.value);
    if (!clean) return;
    cards.push({ field:key, title:TITLES[key], evidence, value:clean,
      observedAt:iso(checked.observed), expiresAt:iso(checked.expires) });
  }
  add('displayName',['owner-profile'],'Escolhido pelo titular',v => text(v?.name,60) ? { name:text(v.name,60) } : null,DAY);
  add('status',['owner-checkin'],'Confirmado pelo usuário',v =>
    ['working','resting','commuting','available','in_flight'].includes(v?.code) ? { code:v.code } : null);
  add('confirmedCity',['owner-checkin','device-location'],'Última confirmação recebida',v =>
    text(v?.city) && text(v?.country,60) ? { city:text(v.city), country:text(v.country,60) } : null);
  add('plannedCity',['canonical-roster'],'Previsto na escala — não é localização atual',v =>
    text(v?.city) && windowContains(time(v?.startAt),time(v?.endAt),access) ?
      { city:text(v.city), startAt:iso(time(v.startAt)), endAt:iso(time(v.endAt)) } : null);
  add('nextFlight',['canonical-roster'],'Publicado na escala — não confirma decolagem',v =>
    /^[A-Z0-9]{2,3}\s?\d{1,5}$/.test(v?.flight || '') && /^[A-Z]{3}$/.test(v?.origin || '') &&
    /^[A-Z]{3}$/.test(v?.destination || '') && windowContains(time(v?.startAt),time(v?.endAt),access) && time(v.endAt)>now ?
      { flight:v.flight, origin:v.origin, destination:v.destination, startAt:iso(time(v.startAt)), endAt:iso(time(v.endAt)) } : null);
  add('returnEstimate',['canonical-return'],'Estimativa — sujeita a alterações',v =>
    windowContains(time(v?.at),time(v?.at),access) && time(v.at)>now ? { at:iso(time(v.at)) } : null);
  add('stayCity',['canonical-stay'],'Pernoite previsto — não confirma chegada',v =>
    text(v?.city) && windowContains(time(v?.startAt),time(v?.endAt),access) && time(v.endAt)>now ?
      { city:text(v.city), startAt:iso(time(v.startAt)), endAt:iso(time(v.endAt)) } : null);
  for (const key of ['hotel','room']) add(key,['owner-stay'],'Compartilhado pelo titular',v =>
    text(v?.[key],key==='room'?30:120) && windowContains(time(v?.startAt),time(v?.endAt),access) && time(v.endAt)>now ?
      { [key]:text(v[key],key==='room'?30:120), startAt:iso(time(v.startAt)), endAt:iso(time(v.endAt)) } : null);
  add('preciseLocation',['device-location'],'Posição recebida do dispositivo — veja o horário',v =>
    Number.isFinite(v?.latitude) && Math.abs(v.latitude)<=90 && Number.isFinite(v?.longitude) && Math.abs(v.longitude)<=180 &&
    Number.isFinite(v?.accuracyMeters) && v.accuracyMeters>=0 && v.accuracyMeters<=10000 ?
      { latitude:v.latitude, longitude:v.longitude, accuracyMeters:v.accuracyMeters } : null,5*MINUTE);
  add('calendar',['canonical-roster'],'Programação prevista no período autorizado',v => {
    if (!Array.isArray(v?.activities) || v.activities.length>1000) return null;
    const activities=[];
    for (const item of v.activities) {
      if (activities.length>=62) break;
      const start=time(item?.startAt),end=time(item?.endAt);
      if (!['flight','duty','stay','rest','off'].includes(item?.kind) || !windowContains(start,end,access)) continue;
      activities.push({kind:item.kind,startAt:iso(start),endAt:iso(end)});
    }
    return { activities }; // No flight IDs, airport-derived journey IDs, hotel, or raw parser data.
  });
  const expires = Math.min(now+MINUTE,access.expires,...cards.map(card=>time(card.expiresAt)));
  return { schema:'crewcheck.tv.visitor.v1', audience:'visitor', deviceId:access.deviceId,
    consentRevision:access.revision, generatedAt:iso(now), expiresAt:iso(expires),
    offlineAllowed:false, cards,
    emptyMessage:cards.length ? null:'Nenhuma informação disponível dentro do compartilhamento autorizado.' };
}
