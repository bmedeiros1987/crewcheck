import { createHash } from 'node:crypto';
import { createPendingGeographicIntent, pendingGeographicIntentState } from '../v14369/pending-geographic-intent.mjs';

import { pharmacyPlaceResults, pharmacyResultsText, pharmacyRequestKind } from './place-results.mjs';

const KEY = 'pharmacySearchReference';
const inFlight = new Map();
const STALE = Symbol('superseded search');
const clean = (value, max = 180) => String(value ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const point = value => typeof value?.latitude === 'number' && typeof value?.longitude === 'number' && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
const pharmacy = text => /\bfarm[aá]cias?\b|\bdrogarias?\b/i.test(text);
const hospital = text => /\bhospita(?:l|is)\b/i.test(text);
const prompt = 'Qual hotel ou endereço, e em qual cidade? Pode dizer “perto de …”. GPS é opcional.';

function candidate(value) {
  if (!point(value?.location) || !clean(value?.name) || !clean(value?.address)) return null;
  return { name: clean(value.name), address: clean(value.address), city: clean(value.city), location: { latitude: value.location.latitude, longitude: value.location.longitude } };
}

/** Search references are private, short-lived and NEVER written as current GPS or accommodation. */
export async function pharmacyReferenceReply(text, profile, snapshot, deps, now = new Date()) {
  const value = clean(text, 500);
  const owner = clean(profile?.email || (profile?.chatId ? `telegram:${profile.chatId}` : ''), 240).toLowerCase();
  const snapshotOwner = clean(snapshot?.email || snapshot?.key, 240).toLowerCase();
  const command = pharmacy(value) || hospital(value);
  const manual = value.match(/^(?:\/referencia\s+|refer[eê]ncia\s*:\s*)(.{3,180})$/i)
    || (!/perto de mim/i.test(value) && value.match(/^(?:(?:farm[aá]cias?|drogarias?|hospita(?:l|is))\s+)?perto d[aeo]\s+(.{3,180})$/i));
  const selection = /^\d{1,2}$/.test(value) ? Number(value) : null;
  if (!command && !manual && selection === null) return { handled: false };
  if (!owner || owner !== snapshotOwner || (snapshot?.key && clean(snapshot.key, 240).toLowerCase() !== owner)) {
    return command || manual ? { handled: true, reply: 'Não consegui confirmar a conta desta consulta. Vincule sua conta antes de continuar.' } : { handled: false };
  }
  const started = Date.now();
  const clock = deps.now || (() => new Date(now.getTime() + Date.now() - started));
  const active = (data, time) => (deps.stays(data?.roster) || []).filter(stay => {
    const day = stay.day;
    const publishedTime = value => /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
    // Do not use the legacy resolver's all-day fallback as evidence of a stay.
    return day && /^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(String(day.date || '')) &&
      publishedTime(day.layoverStart || day.dutyDebrief || day.legs?.at(-1)?.arrivalTime) &&
      publishedTime(day.layoverEnd || day.nextDutyReport || day.restEnd) &&
      Number.isFinite(new Date(stay.start).getTime()) && Number.isFinite(new Date(stay.end).getTime()) &&
      new Date(stay.start) <= time && new Date(stay.end) > time;
  });
  const fingerprint = (data, time) => createHash('sha256').update(JSON.stringify({ roster: data?.roster || null, stays: active(data, time).map(stay => [stay.hotel, stay.location, stay.start, stay.end]) })).digest('hex');
  // App profiles may carry a linked Telegram chatId. Only the request channel
  // determines its origin; version the scope to reject older ambiguous records.
  const channel = clean(profile.channel || (profile.chatId ? 'telegram' : 'app'), 32).toLowerCase();
  const chatScope = channel === 'telegram' ? `telegram:${clean(profile.chatId, 48)}` : channel;
  const scope = { userId: owner, chatId: `v2:${chatScope}`, now };
  const activeStays = active(snapshot, now);
  const binding = fingerprint(snapshot, now);
  const previous = snapshot?.preferences?.[KEY];
  const state = pendingGeographicIntentState(previous?.request, scope);
  const usable = state.usable && new Date(state.intent.createdAt) <= now && new Date(state.intent.expiresAt) > now && state.intent.filters.binding === binding;
  // Only inherit normalized filters from this validated account/channel/reference.
  // Raw questions can contain medication or symptom details and are never persisted here.
  const searchType = hospital(value) ? 'hospital' : pharmacy(value) ? 'pharmacy' : usable && previous.searchType === 'hospital' ? 'hospital' : 'pharmacy';
  const pharmacyCategory = command ? pharmacyRequestKind(value) : usable && ['ordinary', 'veterinary', 'compounding'].includes(previous.pharmacyCategory) ? previous.pharmacyCategory : 'ordinary';
  const expanded = command ? /\bmais\b/i.test(value) : usable && previous.expanded === true;
  if (selection !== null && (!usable || !Array.isArray(previous.options))) return { handled: false };
  const key = createHash('sha256').update(owner).digest('hex');
  const transaction = inFlight.get(key) || { tail: Promise.resolve() };
  const token = Symbol();
  transaction.token = token;
  inFlight.set(key, transaction);
  const expiresAt = usable && !manual ? new Date(previous.request.expiresAt) : new Date(now.getTime() + 600000);
  let activeGps = null;
  const guard = async () => {
    const latest = await deps.load(profile);
    const time = clock();
    if (activeGps) {
      const currentGps = deps.gps?.(latest);
      if (!currentGps?.fresh || !point(currentGps.location) || currentGps.location.latitude !== activeGps.latitude || currentGps.location.longitude !== activeGps.longitude || currentGps.location.updatedAt !== activeGps.updatedAt) throw STALE;
    }
    if (transaction.token !== token || time >= expiresAt || time < now ||
      clean(latest?.email || latest?.key, 240).toLowerCase() !== owner ||
      (latest?.key && clean(latest.key, 240).toLowerCase() !== owner) || fingerprint(latest, time) !== binding) throw STALE;
  };
  const save = async (details = null) => {
    const write = transaction.tail.then(async () => { await guard(); return deps.save(profile, { [KEY]: details }); });
    transaction.tail = write.catch(() => {});
    await write;
    await guard();
  };
  const pending = details => ({ request: createPendingGeographicIntent(searchType === 'hospital' ? 'hospitais' : 'farmacias', { ...scope, filters: { binding, purpose: 'search-reference-only' } }), searchType, pharmacyCategory, expanded, ...details });
  try {
  const respond = async (reference) => {
    activeGps = reference.gps ? reference.location : null;
    await guard();
    const places = await deps.nearby(reference.location, searchType);
    await guard();
    const label = `${reference.gps ? 'Localização compartilhada' : 'Referência de busca'}: ${reference.name}${reference.city ? ` · ${reference.city}` : ''}`;
    const placeResults = pharmacyPlaceResults(places, { reference: label, searchType, pharmacyCategory, expanded });
    return { handled: true, reply: pharmacyResultsText(placeResults), placeResults };
  };
  if (selection !== null) {
    if (!usable || !Array.isArray(previous.options)) return { handled: false };
    const chosen = candidate(previous.options[selection - 1]);
    if (!chosen) return { handled: true, reply: `Escolha de 1 a ${previous.options.length}, ou diga “perto de outro hotel, cidade”.` };
    const next = { request: previous.request, selected: chosen, searchType, pharmacyCategory, expanded };
    await save(next); // explicit selection; original expiry is not extended
    return await respond(chosen);
  }
  // Voluntary GPS remains supported, and can explicitly override a hotel reference.
  if (command && /minha localiza[cç][aã]o|perto de mim|usar (?:o )?gps/i.test(value)) {
    await save(null);
    const gps = deps.gps?.(snapshot);
    if (gps?.fresh && point(gps.location)) return await respond({ name: clean(gps.label) || 'localização recente', location: gps.location, gps: true });
    return { handled: false };
  }
  if (command && !manual && usable && candidate(previous.selected)) {
    if (previous.searchType !== searchType || previous.pharmacyCategory !== pharmacyCategory || previous.expanded !== expanded) await save({ request: previous.request, selected: candidate(previous.selected), searchType, pharmacyCategory, expanded });
    return await respond(candidate(previous.selected));
  }
  if (previous && !usable) await save(null);

  const stay = activeStays.length === 1 ? activeStays[0] : null;
  const hotel = clean(stay?.hotel);
  const city = clean(deps.city(stay?.location));
  let query = manual?.[1] || '';
  if (!query && hotel && city) query = `${hotel}, ${city}`;
  if (!query) {
    if (!manual && deps.gpsFresh(snapshot)) {
      const gps = deps.gps?.(snapshot);
      if (gps?.fresh && point(gps.location)) return await respond({ name: clean(gps.label) || 'localização recente', location: gps.location, gps: true });
      return { handled: false };
    }
    await save(pending({}));
    return { handled: true, reply: activeStays.length > 1 ? `Há mais de um pernoite possível. ${prompt}` : prompt };
  }
  const results = (await deps.lookup(query)).map(candidate).filter(Boolean);
  await guard();
  // Free-form addresses are not structured city evidence. Offer existing hits
  // for confirmation; never interpret a street name as a municipality.
  const options = results.slice(0, 4);
  const exact = options.filter(item => fold(item.name) === fold(hotel) && item.city && fold(item.city) === fold(city));
  if (!manual && exact.length === 1) {
    await save(pending({ selected: exact[0] }));
    return await respond(exact[0]);
  }
  if (!options.length) {
    await save(pending({}));
    return { handled: true, reply: `Não consegui confirmar esse local. ${prompt}` };
  }
  await save(pending({ options }));
  return { handled: true, reply: [`Qual local você quer usar para buscar ${searchType === 'hospital' ? 'hospitais' : 'farmácias'}?`, ...options.map((item, index) => `${index + 1}. ${item.name} · ${item.address}`), 'Responda com o número. Isso só define esta busca; não altera o hotel do pernoite.'].join('\n') };
  } catch (error) {
    if (error !== STALE) throw error;
    return { handled: true, reply: 'Esta busca perdeu a validade ou foi substituída. Tente novamente usando o hotel ou endereço que você quer consultar.' };
  } finally {
    if (transaction.token === token) inFlight.delete(key);
  }
}

