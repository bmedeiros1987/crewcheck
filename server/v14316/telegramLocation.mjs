import { cleanText, dbPool, env } from '../v139/common.mjs';

function telegramToken() {
  return env('TELEGRAM_BOT_TOKEN', env('CREWCHECK_TELEGRAM_BOT_TOKEN'));
}

async function telegramCall(method, payload) {
  const token = telegramToken();
  if (!token) return { ok: false, configured: false };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && result.ok !== false), configured: true, result };
  } catch {
    return { ok: false, configured: true };
  }
}

async function ensureLocationTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_telegram_locations (
    chat_id VARCHAR(120) NOT NULL PRIMARY KEY,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    accuracy DOUBLE NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'static',
    live_until DATETIME(3) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function saveLocation(message, isEdited = false) {
  const chatId = String(message?.chat?.id || '').trim();
  const latitude = Number(message?.location?.latitude);
  const longitude = Number(message?.location?.longitude);
  if (!chatId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const db = await dbPool();
  if (!db) return false;
  await ensureLocationTable(db);
  const livePeriod = Math.max(0, Number(message?.location?.live_period || 0));
  const source = livePeriod || isEdited ? 'live' : 'static';
  const liveUntil = livePeriod ? new Date((Number(message?.date || Math.floor(Date.now() / 1000)) + livePeriod) * 1000) : null;
  await db.query(`INSERT INTO crewcheck_telegram_locations
    (chat_id,latitude,longitude,accuracy,source,live_until) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE latitude=VALUES(latitude),longitude=VALUES(longitude),accuracy=VALUES(accuracy),source=VALUES(source),live_until=COALESCE(VALUES(live_until),live_until),updated_at=UTC_TIMESTAMP(3)`,
    [chatId, latitude, longitude, Number(message?.location?.horizontal_accuracy || 0) || null, source, liveUntil]);
  const state = { latitude, longitude, source, liveUntil: liveUntil?.toISOString() || '', updatedAt: new Date().toISOString() };
  await db.query(`INSERT INTO crewcheck_telegram_state (state_key,payload) VALUES (?,?)
    ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=UTC_TIMESTAMP(3)`, [`location-chat:${chatId}`, JSON.stringify(state)]).catch(() => undefined);
  return true;
}

async function latestLocation(chatId) {
  const db = await dbPool();
  if (!db) return null;
  await ensureLocationTable(db);
  const [rows] = await db.query(`SELECT latitude,longitude,source,live_until,updated_at,
    TIMESTAMPDIFF(SECOND,updated_at,UTC_TIMESTAMP(3)) age_seconds
    FROM crewcheck_telegram_locations WHERE chat_id=? LIMIT 1`, [String(chatId)]);
  const row = rows?.[0];
  if (!row) return null;
  const ageSeconds = Number(row.age_seconds || 0);
  const liveValid = String(row.source) === 'live' && (row.live_until ? new Date(row.live_until).getTime() > Date.now() : ageSeconds <= 7200);
  const staticValid = String(row.source) !== 'live' && ageSeconds <= 1800;
  if (!liveValid && !staticValid) return null;
  return { latitude: Number(row.latitude), longitude: Number(row.longitude), source: String(row.source), ageSeconds };
}

function distanceMeters(a, b) {
  const rad = (value) => Number(value) * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * earth * Math.asin(Math.sqrt(h)));
}

function distanceLabel(value) {
  const meters = Number(value || 0);
  return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace('.', ',')} km` : `${Math.max(1, Math.round(meters))} m`;
}

function mapsUrl(place) {
  if (place.googleMapsUri) return place.googleMapsUri;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`;
}

function placesKey() {
  return env('GOOGLE_PLACES_API_KEY', env('GOOGLE_PLACES_SERVER_KEY', env('GOOGLE_MAPS_SERVER_KEY', env('GOOGLE_MAPS_API_KEY'))));
}

async function nearbyGyms(location) {
  const key = placesKey();
  if (!key) return { ok: false, configured: false, places: [] };
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow',
      },
      body: JSON.stringify({
        includedTypes: ['gym'],
        maxResultCount: 10,
        rankPreference: 'DISTANCE',
        languageCode: 'pt-BR',
        locationRestriction: { circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: 15_000 } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, configured: true, places: [] };
    const places = (Array.isArray(payload?.places) ? payload.places : []).map((place) => {
      const point = { latitude: Number(place?.location?.latitude), longitude: Number(place?.location?.longitude) };
      return {
        name: cleanText(place?.displayName?.text || 'Academia', 100),
        address: cleanText(place?.formattedAddress, 180),
        googleMapsUri: String(place?.googleMapsUri || ''),
        latitude: point.latitude,
        longitude: point.longitude,
        distanceMeters: Number.isFinite(point.latitude) && Number.isFinite(point.longitude) ? distanceMeters(location, point) : Number.MAX_SAFE_INTEGER,
        rating: Number(place?.rating || 0),
        ratings: Number(place?.userRatingCount || 0),
        openNow: place?.currentOpeningHours?.openNow,
      };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters || Number(b.openNow === true) - Number(a.openNow === true) || b.rating - a.rating).slice(0, 6);
    return { ok: true, configured: true, places };
  } catch {
    return { ok: false, configured: true, places: [] };
  }
}

async function requestLocation(chatId, reason = 'Para ordenar pela distância, envie sua localização atual.') {
  return telegramCall('sendMessage', {
    chat_id: String(chatId),
    text: `${reason}\n\nVocê também pode escolher “Localização em tempo real”. O CrewCheck atualizará silenciosamente e só consultará a posição quando você pedir uma função que precise dela.`,
    reply_markup: {
      keyboard: [[{ text: '📍 Enviar minha localização', request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      selective: true,
    },
  });
}

async function sendGymList(chatId, location) {
  const result = await nearbyGyms(location);
  if (!result.configured) {
    return telegramCall('sendMessage', { chat_id: String(chatId), text: 'A busca de academias aguarda a configuração do serviço de locais no CrewCheck.' });
  }
  if (!result.ok || !result.places.length) {
    return telegramCall('sendMessage', { chat_id: String(chatId), text: 'Não encontrei academias próximas agora. Tente novamente em alguns minutos ou abra o mapa pelo aplicativo.' });
  }
  const lines = ['🏋️ Academias mais próximas', ''];
  const keyboard = [];
  result.places.forEach((place, index) => {
    const status = place.openNow === true ? 'aberta agora' : place.openNow === false ? 'fechada agora' : 'horário não confirmado';
    const rating = place.rating ? ` · ⭐ ${place.rating.toFixed(1).replace('.', ',')}${place.ratings ? ` (${place.ratings})` : ''}` : '';
    lines.push(`${index + 1}. ${place.name}`, `${distanceLabel(place.distanceMeters)} · ${status}${rating}`, place.address || '', '');
    keyboard.push([{ text: `🗺 ${index + 1}. ${place.name.slice(0, 28)}`, url: mapsUrl(place) }]);
  });
  lines.push(location.source === 'live' ? 'Posição em tempo real usada nesta consulta.' : 'Posição recente usada nesta consulta.');
  return telegramCall('sendMessage', { chat_id: String(chatId), text: lines.filter((line, index, all) => line || all[index - 1]).join('\n').slice(0, 3900), disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } });
}

function asksForGyms(text = '') {
  return /^\/(?:academias?|gym|treino)(?:@\S+)?\b/i.test(text) || /\b(?:academias? perto|academias? próximas?|onde treinar|gym perto|wellhub perto|smart fit perto)\b/i.test(text);
}

export async function handleTelegramLocationAndPlaces(update = {}) {
  const edited = update?.edited_message;
  const message = update?.message || edited || update;
  const chatId = message?.chat?.id;
  if (!chatId) return false;
  if (message?.location) {
    const saved = await saveLocation(message, Boolean(edited));
    if (!saved) return false;
    if (edited) return true;
    const live = Number(message.location.live_period || 0) > 0;
    await telegramCall('sendMessage', {
      chat_id: String(chatId),
      text: live
        ? 'Localização em tempo real recebida. As atualizações serão silenciosas; usarei a posição mais recente somente quando você pedir academia, rota ou outra função por localização.'
        : 'Localização recebida. Vou usá-la nas próximas consultas por proximidade durante 30 minutos.',
      reply_markup: { remove_keyboard: true },
    });
    return true;
  }
  const text = String(message?.text || message?.caption || '').trim();
  if (!asksForGyms(text)) return false;
  const location = await latestLocation(chatId);
  if (!location) {
    await requestLocation(chatId, 'Preciso de uma localização recente para mostrar a academia mais próxima primeiro.');
    return true;
  }
  await sendGymList(chatId, location);
  return true;
}
