import { createHash } from 'node:crypto';
import { createPendingGeographicIntent, pendingGeographicIntentState } from '../v14369/pending-geographic-intent.mjs';

const KEY = 'pharmacySearchReference';
const inFlight = new Map();
const STALE = Symbol('superseded search');
const clean = (value, max = 180) => String(value ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const point = value => typeof value?.latitude === 'number' && typeof value?.longitude === 'number' && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
const pharmacy = text => /\bfarm[aá]cias?\b|\bdrogarias?\b/i.test(text);
const prompt = 'Qual hotel ou endereço, com cidade, você quer usar? Escreva “referência: …”. Se preferir, compartilhe sua localização; GPS é opcional.';

function candidate(value) {
  if (!point(value?.location) || !clean(value?.name) || !clean(value?.address)) return null;
  return { name: clean(value.name), address: clean(value.address), city: clean(value.city), location: { latitude: value.location.latitude, longitude: value.location.longitude } };
}

/** Search references are private, short-lived and NEVER written as current GPS or accommodation. */
export async function pharmacyReferenceReply(text, profile, snapshot, deps, now = new Date()) {
  const value = clean(text, 500);
  const owner = clean(profile?.email || (profile?.chatId ? `telegram:${profile.chatId}` : ''), 240).toLowerCase();
  const snapshotOwner = clean(snapshot?.email || snapshot?.key, 240).toLowerCase();
  const command = pharmacy(value);
  const manual = value.match(/^(?:\/referencia\s+|refer[eê]ncia\s*:\s*)(.{3,180})$/i);
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
  if (selection !== null && (!usable || !Array.isArray(previous.options))) return { handled: false };
  const key = createHash('sha256').update(owner).digest('hex');
  const transaction = inFlight.get(key) || { tail: Promise.resolve() };
  const token = Symbol();
  transaction.token = token;
  inFlight.set(key, transaction);
  const expiresAt = usable && !manual ? new Date(previous.request.expiresAt) : new Date(now.getTime() + 600000);
  const guard = async () => {
    const latest = await deps.load(profile);
    const time = clock();
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
  const pending = details => ({ request: createPendingGeographicIntent('farmacias', { ...scope, filters: { binding, purpose: 'search-reference-only' } }), ...details });
  try {
  const respond = async (reference) => {
    await guard();
    const places = await deps.nearby(reference.location);
    await guard();
    const label = `Referência de busca: ${reference.name} · ${reference.address}. Não confirma sua presença neste local.`;
    if (!places.length) return { handled: true, reply: `${label}\nNão encontrei farmácias com dados disponíveis nessa referência. Você pode mudar usando “referência: outro hotel ou endereço, cidade”.` };
    return { handled: true, reply: ['Farmácias próximas da referência', label, deps.placeLines(places), deps.routeLines(places), 'Horário só é exibido quando informado pela fonte. Confirme antes de sair. Para mudar o local, use “referência: hotel ou endereço, cidade”.'].filter(Boolean).join('\n\n') };
  };
  if (selection !== null) {
    if (!usable || !Array.isArray(previous.options)) return { handled: false };
    const chosen = candidate(previous.options[selection - 1]);
    if (!chosen) return { handled: true, reply: `Escolha um número de 1 a ${previous.options.length} ou informe “referência: outro hotel ou endereço, cidade”.` };
    const next = { ...previous, options: undefined, selected: chosen };
    await save(next); // explicit selection; original expiry is not extended
    return await respond(chosen);
  }
  // Voluntary GPS remains supported, and can explicitly override a hotel reference.
  if (command && /minha localiza[cç][aã]o|perto de mim|usar (?:o )?gps/i.test(value)) {
    await save(null);
    return { handled: false };
  }
  if (command && usable && candidate(previous.selected)) return await respond(candidate(previous.selected));
  if (previous && !usable) await save(null);

  const stay = activeStays.length === 1 ? activeStays[0] : null;
  const hotel = clean(stay?.hotel);
  const city = clean(deps.city(stay?.location));
  let query = manual?.[1] || '';
  if (!query && hotel && city) query = `${hotel}, ${city}`;
  if (!query) {
    if (!manual && deps.gpsFresh(snapshot)) return { handled: false };
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
  return { handled: true, reply: ['Qual referência você quer usar para buscar farmácias?', ...options.map((item, index) => `${index + 1}. ${item.name} · ${item.address}`), 'Responda com o número. Isso só define esta busca; não altera o hotel do pernoite.'].join('\n') };
  } catch (error) {
    if (error !== STALE) throw error;
    return { handled: true, reply: 'Esta busca perdeu a validade ou foi substituída. Use a referência mais recente ou envie “farmácias” para consultar novamente.' };
  } finally {
    if (transaction.token === token) inFlight.delete(key);
  }
}
