import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  cleanText,
  dbPool,
  env,
  flag,
  parseJsonColumn,
  readBody,
  requireIdentity,
  safeEmail,
  sendJson,
} from '../v139/common.mjs';
import { telegramLink, telegramToken } from '../v139/delivery.mjs';

const AMIL_NETWORK_SNAPSHOT = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../data/amil-network-s450-s750.json', import.meta.url), 'utf8'));
  } catch {
    return { providers: [], missingPublishedStates: ['AM'] };
  }
})();

const emergencySchemaPromises = new WeakMap();

async function ensureEmergencySchema(db) {
  if (emergencySchemaPromises.has(db)) return emergencySchemaPromises.get(db);
  const promise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_profiles (
        owner_email VARCHAR(254) NOT NULL,
        cipher_text LONGTEXT NOT NULL,
        cipher_iv VARCHAR(128) NOT NULL,
        cipher_tag VARCHAR(128) NOT NULL,
        consent_medical_share TINYINT(1) NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_preferences (
        owner_email VARCHAR(254) NOT NULL,
        notify_saved_contacts TINYINT(1) NOT NULL DEFAULT 1,
        notify_hotel_companions TINYINT(1) NOT NULL DEFAULT 1,
        include_location TINYINT(1) NOT NULL DEFAULT 1,
        include_medical_profile TINYINT(1) NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_alerts (
        id VARCHAR(64) NOT NULL,
        owner_email VARCHAR(254) NOT NULL,
        emergency_kind VARCHAR(40) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        message TEXT NOT NULL,
        location_url TEXT NULL,
        recipients JSON NOT NULL,
        channels JSON NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        cancelled_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY crewcheck_emergency_alert_owner_idx (owner_email, created_at),
        KEY crewcheck_emergency_alert_status_idx (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_sessions (
        owner_email VARCHAR(254) NOT NULL,
        pending_kind VARCHAR(40) NULL,
        pending_action VARCHAR(40) NULL,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        location_label VARCHAR(500) NULL,
        location_source VARCHAR(40) NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_responses (
        alert_id VARCHAR(64) NOT NULL,
        responder_chat_hash CHAR(64) NOT NULL,
        responder_name VARCHAR(160) NOT NULL,
        responder_username VARCHAR(160) NULL,
        response_status VARCHAR(30) NOT NULL DEFAULT 'helping',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (alert_id,responder_chat_hash),
        KEY crewcheck_emergency_response_alert_idx (alert_id,created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const statement of statements) await db.query(statement);
    return true;
  })().catch((error) => {
    emergencySchemaPromises.delete(db);
    throw error;
  });
  emergencySchemaPromises.set(db, promise);
  return promise;
}

const EMERGENCY_TYPES = {
  fire: { label: 'Fogo ou fumaça', icon: '🔥', guidance: 'Saia da área de risco e acione o serviço local de emergência.' },
  medical: { label: 'Emergência médica', icon: '🩺', guidance: 'Acione o serviço médico local imediatamente.' },
  security: { label: 'Segurança ou violência', icon: '🛡️', guidance: 'Procure um local seguro e acione a autoridade local.' },
  accident: { label: 'Acidente ou deslocamento', icon: '🚗', guidance: 'Sinalize o local e acione o serviço apropriado.' },
  stranded: { label: 'Desamparado ou sem transporte', icon: '📍', guidance: 'Permaneça em local seguro e aguarde contato.' },
  other: { label: 'Outra emergência', icon: '⚠️', guidance: 'Informe detalhes assim que estiver em segurança.' },
};

function encryptionKey() {
  const secret = env('CREWCHECK_DATA_ENCRYPTION_KEY', env('CREWCHECK_AUTH_SECRET'));
  if (!secret) throw Object.assign(new Error('Chave de proteção do perfil médico não configurada.'), { status: 503 });
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptMedical(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { cipherText: encrypted.toString('base64url'), iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}

function decryptMedical(row) {
  if (!row?.cipher_text || !row?.cipher_iv || !row?.cipher_tag) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(row.cipher_iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(row.cipher_tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(row.cipher_text, 'base64url')), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

function encryptPrivateText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decryptPrivateText(value) {
  try {
    const raw = Buffer.from(String(value || ''), 'base64url');
    if (raw.length < 29) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function mapsKey() {
  return env('GOOGLE_MAPS_SERVER_KEY', env('GOOGLE_MAPS_API_KEY', env('VITE_GOOGLE_MAPS_API_KEY')));
}

function mapsSearchUrl(label = '') {
  return label ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}` : '';
}

function telegramContactUrl(username = '', chatId = '') {
  const cleanUsername = String(username || '').trim().replace(/^@/, '');
  if (/^[A-Za-z0-9_]{5,}$/.test(cleanUsername)) return `https://t.me/${cleanUsername}`;
  return /^-?\d+$/.test(String(chatId || '')) ? `tg://user?id=${String(chatId)}` : '';
}

async function telegramApi(method, payload = {}) {
  const token = telegramToken();
  if (!token) return { ok: false };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && data.ok !== false), data };
  } catch {
    return { ok: false };
  }
}

async function sendTelegramRich(chatId, text, extra = {}) {
  if (!chatId) return { ok: false };
  return telegramApi('sendMessage', {
    chat_id: String(chatId),
    text: String(text || '').slice(0, 3900),
    disable_web_page_preview: true,
    ...extra,
  });
}

async function answerEmergencyCallback(callbackId, text = '') {
  if (!callbackId) return;
  await telegramApi('answerCallbackQuery', { callback_query_id: callbackId, text: cleanText(text, 180) });
}

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function emergencyKind(value) {
  const key = String(value || '').trim().toLowerCase();
  return EMERGENCY_TYPES[key] ? key : '';
}

async function profileForChat(db, chatId) {
  const value = String(chatId || '').trim();
  if (!value) return null;
  const [rows] = await db.query(
    `SELECT state_key,payload FROM crewcheck_telegram_state
     WHERE state_key=? OR JSON_UNQUOTE(JSON_EXTRACT(payload,'$.chatId'))=?
     ORDER BY updated_at DESC LIMIT 8`,
    [`link-chat:${value}`, value],
  );
  for (const row of rows) {
    const payload = parseJsonColumn(row.payload, {}) || {};
    const email = safeEmail(payload.email || payload.ownerEmail || String(row.state_key || '').replace(/^link-email:/, ''));
    if (email) return { email, payload };
  }
  return null;
}

async function currentStay(db, email) {
  const today = localDateKey();
  const [rows] = await db.query(
    `SELECT * FROM crewcheck_platform_stays
     WHERE owner_email=? AND stay_date BETWEEN DATE_SUB(?,INTERVAL 1 DAY) AND DATE_ADD(?,INTERVAL 1 DAY)
     ORDER BY ABS(DATEDIFF(stay_date,?)),updated_at DESC LIMIT 1`,
    [email, today, today, today],
  );
  return rows[0] || null;
}

async function registeredStays(db, email) {
  const [rows] = await db.query(
    `SELECT stay_date,hotel_name,airport,room_cipher,presentation_time,updated_at
     FROM crewcheck_platform_stays
     WHERE owner_email=? AND hotel_name IS NOT NULL AND hotel_name<>''
     ORDER BY ABS(DATEDIFF(stay_date,CURRENT_DATE())),stay_date DESC,updated_at DESC LIMIT 12`,
    [email],
  );
  return rows || [];
}

async function emergencySession(db, email) {
  const [rows] = await db.query('SELECT * FROM crewcheck_platform_emergency_sessions WHERE owner_email=? LIMIT 1', [email]);
  return rows[0] || null;
}

async function saveEmergencySession(db, email, patch = {}) {
  const current = await emergencySession(db, email) || {};
  const next = {
    pendingKind: Object.hasOwn(patch, 'pendingKind') ? cleanText(patch.pendingKind, 40) : cleanText(current.pending_kind, 40),
    pendingAction: Object.hasOwn(patch, 'pendingAction') ? cleanText(patch.pendingAction, 40) : cleanText(current.pending_action, 40),
    latitude: Object.hasOwn(patch, 'latitude') ? (patch.latitude == null ? Number.NaN : Number(patch.latitude)) : (current.latitude == null ? Number.NaN : Number(current.latitude)),
    longitude: Object.hasOwn(patch, 'longitude') ? (patch.longitude == null ? Number.NaN : Number(patch.longitude)) : (current.longitude == null ? Number.NaN : Number(current.longitude)),
    locationLabel: Object.hasOwn(patch, 'locationLabel') ? cleanText(patch.locationLabel, 500) : cleanText(current.location_label, 500),
    locationSource: Object.hasOwn(patch, 'locationSource') ? cleanText(patch.locationSource, 40) : cleanText(current.location_source, 40),
  };
  const latitude = Number.isFinite(next.latitude) && Math.abs(next.latitude) <= 90 ? next.latitude : null;
  const longitude = Number.isFinite(next.longitude) && Math.abs(next.longitude) <= 180 ? next.longitude : null;
  await db.query(
    `INSERT INTO crewcheck_platform_emergency_sessions
     (owner_email,pending_kind,pending_action,latitude,longitude,location_label,location_source)
     VALUES(?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE pending_kind=VALUES(pending_kind),pending_action=VALUES(pending_action),latitude=VALUES(latitude),longitude=VALUES(longitude),location_label=VALUES(location_label),location_source=VALUES(location_source),updated_at=CURRENT_TIMESTAMP(3)`,
    [email, next.pendingKind || null, next.pendingAction || null, latitude, longitude, next.locationLabel || null, next.locationSource || null],
  );
  return { ...next, latitude, longitude };
}

async function snapshotLocation(db, email) {
  const [rows] = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? LIMIT 1', [`snapshot:${String(email).toLowerCase()}`]);
  const payload = parseJsonColumn(rows[0]?.payload, {}) || {};
  const location = payload?.preferences?.location;
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const updatedAt = new Date(location?.updatedAt || payload?.updatedAt || 0).getTime();
  if (!updatedAt || Date.now() - updatedAt > 24 * 60 * 60_000) return null;
  return { latitude, longitude, label: 'Localização compartilhada no Telegram', source: 'telegram-snapshot' };
}

async function googlePlaceForText(text) {
  const key = mapsKey();
  if (!key || !text) return null;
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: text, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 1 }),
    });
    const payload = await response.json().catch(() => ({}));
    const place = response.ok ? payload?.places?.[0] : null;
    if (!place) return null;
    return {
      latitude: Number(place.location?.latitude),
      longitude: Number(place.location?.longitude),
      label: cleanText(place.formattedAddress || place.displayName?.text || text, 500),
      mapsUrl: place.googleMapsUri || mapsSearchUrl(text),
    };
  } catch {
    return null;
  }
}

async function emergencyOrigin(db, email, options = {}) {
  const session = await emergencySession(db, email);
  const sessionUpdatedAt = new Date(session?.updated_at || 0).getTime();
  if (session?.location_source === 'none' && sessionUpdatedAt && Date.now() - sessionUpdatedAt < 6 * 60 * 60_000) return null;
  if (Number.isFinite(Number(session?.latitude)) && Number.isFinite(Number(session?.longitude)) && sessionUpdatedAt && Date.now() - sessionUpdatedAt < 6 * 60 * 60_000) {
    const latitude = Number(session.latitude);
    const longitude = Number(session.longitude);
    return { latitude, longitude, label: session.location_label || 'Localização compartilhada', source: session.location_source || 'session', locationUrl: `https://www.google.com/maps?q=${latitude},${longitude}` };
  }
  const snapshot = await snapshotLocation(db, email);
  if (snapshot) return { ...snapshot, locationUrl: `https://www.google.com/maps?q=${snapshot.latitude},${snapshot.longitude}` };
  if (options.allowHotel !== false) {
    const stay = await currentStay(db, email);
    if (stay?.hotel_name) {
      const label = [stay.hotel_name, stay.airport].filter(Boolean).join(' · ');
      const place = await googlePlaceForText(`${stay.hotel_name} ${stay.airport || ''}`.trim());
      return {
        latitude: Number.isFinite(place?.latitude) ? place.latitude : null,
        longitude: Number.isFinite(place?.longitude) ? place.longitude : null,
        label: place?.label || label,
        source: 'registered-hotel',
        locationUrl: place?.mapsUrl || mapsSearchUrl(label),
        stay,
      };
    }
  }
  return null;
}

async function savedContactRecipients(db, email) {
  const recipients = new Map();
  const [visitors] = await db.query(
    `SELECT display_name,email,telegram_chat_id FROM crewcheck_platform_visitors
     WHERE owner_email=? AND telegram_chat_id IS NOT NULL AND telegram_chat_id<>'' AND status<>'revoked'`,
    [email],
  );
  for (const item of visitors) {
    recipients.set(String(item.telegram_chat_id), {
      chatId: String(item.telegram_chat_id),
      name: cleanText(item.display_name || item.email || 'Contato', 120),
      source: 'saved-contact',
    });
  }
  const [connections] = await db.query(
    `SELECT requester_email,target_email FROM crewcheck_platform_connections
     WHERE status='accepted' AND (requester_email=? OR target_email=?)`,
    [email, email],
  );
  for (const connection of connections) {
    const other = safeEmail(connection.requester_email === email ? connection.target_email : connection.requester_email);
    if (!other) continue;
    const link = await telegramLink(db, other);
    if (link?.chatId) recipients.set(String(link.chatId), { chatId: String(link.chatId), name: other, source: 'connection' });
  }
  return [...recipients.values()];
}

async function hotelCompanionRecipients(db, email) {
  const stay = await currentStay(db, email);
  if (!stay?.hotel_key || !stay?.share_same_hotel) return [];
  const [companions] = await db.query(
    `SELECT DISTINCT owner_email FROM crewcheck_platform_stays
     WHERE hotel_key=? AND stay_date=? AND share_same_hotel=1 AND owner_email<>?`,
    [stay.hotel_key, stay.stay_date, email],
  );
  const recipients = [];
  for (const companion of companions) {
    const companionEmail = safeEmail(companion.owner_email);
    if (!companionEmail) continue;
    const link = await telegramLink(db, companionEmail);
    if (link?.chatId) recipients.push({ chatId: String(link.chatId), name: companionEmail, source: 'same-hotel' });
  }
  return recipients;
}

async function emergencyPreferences(db, email) {
  const [rows] = await db.query('SELECT * FROM crewcheck_platform_emergency_preferences WHERE owner_email=? LIMIT 1', [email]);
  return rows[0] || {
    notify_saved_contacts: 1,
    notify_hotel_companions: 1,
    include_location: 1,
    include_medical_profile: 0,
  };
}

async function emergencyMedical(db, email) {
  const [rows] = await db.query('SELECT * FROM crewcheck_platform_emergency_profiles WHERE owner_email=? LIMIT 1', [email]);
  const row = rows[0];
  return { data: decryptMedical(row), consent: Boolean(row?.consent_medical_share) };
}

function medicalLines(profile) {
  if (!profile) return [];
  const lines = [];
  if (profile.bloodType) lines.push(`Tipo sanguíneo: ${profile.bloodType}`);
  if (profile.allergies) lines.push(`Alergias: ${profile.allergies}`);
  if (profile.continuousMedication) lines.push(`Medicamentos contínuos: ${profile.continuousMedication}`);
  if (profile.medicalNotes) lines.push(`Observações médicas: ${profile.medicalNotes}`);
  return lines;
}

function healthPlan(profile = {}) {
  const provider = cleanText(profile.healthPlanProvider, 60);
  const code = cleanText(profile.healthPlanCode, 40).toUpperCase();
  return {
    provider,
    code,
    amil: /^AMIL$/i.test(provider) && ['S450', 'S750'].includes(code),
  };
}

function coveredAmilProviders(planCode, careKind = 'hospital') {
  const emergencyCodes = new Set(['PA', 'PS', 'PS CARD', 'PSO']);
  const hospitalCodes = new Set(['H', 'H CARD', 'H ORT', 'HD']);
  return (AMIL_NETWORK_SNAPSHOT.providers || []).filter((provider) => {
    const codes = Array.isArray(provider?.plans?.[planCode]) ? provider.plans[planCode] : [];
    if (!codes.length) return false;
    if (careKind === 'clinic') return provider.category === 'diagnostic' || codes.includes('DIAGNOSTICO');
    return codes.some((code) => emergencyCodes.has(code) || hospitalCodes.has(code));
  });
}

function providerNameMatches(placeName, providerName) {
  const ignored = new Set(['HOSPITAL', 'CLINICA', 'CLINICAS', 'CENTRO', 'MEDICO', 'MEDICA', 'PRONTO', 'SOCORRO', 'UNIDADE', 'SA', 'LTDA', 'DA', 'DE', 'DO', 'DAS', 'DOS']);
  const left = normalizeSearch(placeName).split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
  const right = normalizeSearch(providerName).split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
  if (!left.length || !right.length) return normalizeSearch(placeName) === normalizeSearch(providerName);
  const overlap = left.filter((token) => right.includes(token)).length;
  return overlap / Math.min(left.length, right.length) >= 0.66;
}

function amilCoverageMatch(place, providers) {
  return providers.find((provider) => {
    if (!providerNameMatches(place.name, provider.name)) return false;
    const address = normalizeSearch(place.address);
    const addressTokens = address.split(' ');
    return !provider.city || !address || address.includes(normalizeSearch(provider.city)) || addressTokens.includes(normalizeSearch(provider.state));
  }) || null;
}

async function openNearbyPlaces(kind, origin, maxResultCount = 6) {
  const key = mapsKey();
  if (!key || !origin) return [];
  const hospital = kind === 'hospital';
  const textQuery = hospital ? 'hospital pronto atendimento pronto socorro adulto' : 'farmácia drogaria';
  const body = {
    textQuery: origin.latitude != null ? textQuery : `${textQuery} perto de ${origin.label}`,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    openNow: true,
    pageSize: Math.min(10, Math.max(1, maxResultCount * 2)),
    ...(hospital ? {} : { includedType: 'pharmacy', strictTypeFiltering: true }),
  };
  if (origin.latitude != null && origin.longitude != null) {
    body.locationBias = { circle: { center: { latitude: Number(origin.latitude), longitude: Number(origin.longitude) }, radius: 15_000 } };
  }
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.currentOpeningHours.openNow,places.nationalPhoneNumber,places.rating,places.businessStatus',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (payload?.places || []).map((place) => ({
      name: cleanText(place.displayName?.text || (hospital ? 'Hospital' : 'Farmácia'), 180),
      address: cleanText(place.formattedAddress, 500),
      latitude: Number(place.location?.latitude),
      longitude: Number(place.location?.longitude),
      mapsUrl: place.googleMapsUri || '',
      openNow: place.currentOpeningHours?.openNow !== false,
      phone: cleanText(place.nationalPhoneNumber, 40),
      rating: Number(place.rating) || 0,
    })).filter((place) => place.openNow).slice(0, maxResultCount * 2);
  } catch {
    return [];
  }
}

function uberDestinationUrl(place) {
  const clientId = env('UBER_CLIENT_ID');
  if (!clientId || !Number.isFinite(place?.latitude) || !Number.isFinite(place?.longitude)) return '';
  const drop = JSON.stringify({
    latitude: place.latitude,
    longitude: place.longitude,
    addressLine1: cleanText(place.name, 60),
  });
  const url = new URL('https://m.uber.com/looking');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('pickup', 'my_location');
  url.searchParams.set('drop[0]', drop);
  return url.toString();
}

function carePlaceKeyboard(place) {
  const mapsUrl = place.mapsUrl || mapsSearchUrl(`${place.name} ${place.address}`);
  const uberUrl = uberDestinationUrl(place);
  return { inline_keyboard: [[
    ...(mapsUrl ? [{ text: '🗺 Abrir mapa', url: mapsUrl }] : []),
    ...(uberUrl ? [{ text: '🚗 Chamar Uber', url: uberUrl }] : []),
  ]] };
}

async function sendOpenCareResults(db, email, chatId, kind, origin, sendMessage = sendTelegramRich) {
  const medical = await emergencyMedical(db, email);
  const plan = healthPlan(medical.data || {});
  let places = await openNearbyPlaces(kind, origin, 6);
  let coverageLabel = '';
  if (kind === 'hospital' && plan.amil) {
    const covered = coveredAmilProviders(plan.code, 'hospital');
    places = places.map((place) => ({ ...place, coveredProvider: amilCoverageMatch(place, covered) })).filter((place) => place.coveredProvider).slice(0, 6);
    coverageLabel = `Rede publicada Amil ${plan.code}`;
  } else {
    places = places.slice(0, 6);
    if (kind === 'hospital' && plan.provider) coverageLabel = `Plano informado: ${plan.provider} ${plan.code} · rede não importada; cobertura não filtrada`.trim();
  }
  const categoryLabel = kind === 'hospital' ? 'hospitais e pronto-atendimentos' : 'farmácias';
  if (!places.length) {
    const coverageMessage = kind === 'hospital' && plan.amil
      ? `Não encontrei um prestador simultaneamente marcado como aberto agora e compatível com o snapshot ${plan.provider} ${plan.code}.`
      : `Não encontrei ${categoryLabel} marcados como abertos agora nesta região.`;
    await sendMessage(chatId, `${coverageMessage}\n\nEm risco imediato, não adie o atendimento por causa do plano: acione o SAMU 192 ou o serviço local. Confirme horário e cobertura diretamente com o estabelecimento.`);
    return { count: 0, plan };
  }
  await sendMessage(chatId, [
    `📍 ${categoryLabel.charAt(0).toUpperCase()}${categoryLabel.slice(1)} abertos agora`,
    `Origem: ${origin.label || 'localização compartilhada'}`,
    coverageLabel,
    '',
    kind === 'hospital' ? 'A condição “aberto agora” vem do Google Places no horário desta consulta. Confirme atendimento, especialidade e cobertura antes de sair.' : 'Confirme o plantão e a disponibilidade do medicamento antes de sair.',
  ].filter(Boolean).join('\n'));
  for (const place of places) {
    const coveredName = place.coveredProvider?.name && normalizeSearch(place.coveredProvider.name) !== normalizeSearch(place.name)
      ? `\nCobertura publicada como: ${place.coveredProvider.name}` : '';
    await sendMessage(chatId, [
      `${kind === 'hospital' ? '🏥' : '💊'} ${place.name}`,
      '🟢 Aberto agora',
      place.address,
      place.phone ? `Telefone: ${place.phone}` : '',
      place.rating ? `Avaliação: ${place.rating.toFixed(1)}` : '',
      coveredName,
    ].filter(Boolean).join('\n'), { reply_markup: carePlaceKeyboard(place) });
  }
  return { count: places.length, plan };
}

async function registeredHotelsReply(db, email) {
  const stays = await registeredStays(db, email);
  if (!stays.length) return 'Nenhum hotel foi cadastrado nos seus pernoites. O Telegram não mostrará sugestões externas; cadastre o hotel no CrewCheck para ele aparecer aqui.';
  const today = localDateKey();
  return [
    '🏨 Hotéis cadastrados nos seus pernoites',
    '',
    ...stays.map((stay) => {
      const date = String(stay.stay_date || '').slice(0, 10);
      const current = date === today ? ' · PERNOITE ATUAL' : '';
      const room = decryptPrivateText(stay.room_cipher);
      return [`• ${date.split('-').reverse().join('/')} · ${stay.hotel_name}${current}`, stay.airport ? `  Aeroporto: ${stay.airport}` : '', room ? `  Quarto: ${room}` : '  Quarto: não informado', stay.presentation_time ? `  Apresentação/saída: ${stay.presentation_time}` : ''].filter(Boolean).join('\n');
    }),
    '',
    'A lista usa somente hotéis salvos no CrewCheck. O quarto é exibido apenas nesta conversa privada vinculada.',
  ].join('\n');
}

async function sendAlert(db, identity, input) {
  const kind = emergencyKind(input.kind);
  if (!kind) throw Object.assign(new Error('Escolha um tipo de emergência válido.'), { status: 400 });
  const rateSeconds = Math.max(30, Number(env('CREWCHECK_EMERGENCY_RATE_LIMIT_SECONDS', '60')) || 60);
  const [recent] = await db.query(
    `SELECT id FROM crewcheck_platform_emergency_alerts
     WHERE owner_email=? AND status='active' AND created_at>DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? SECOND)
     ORDER BY created_at DESC LIMIT 1`,
    [identity.email, rateSeconds],
  );
  if (recent[0]) throw Object.assign(new Error(`Uma emergência já foi enviada recentemente. Aguarde ${rateSeconds} segundos ou cancele o alerta anterior.`), { status: 429 });

  const preferences = await emergencyPreferences(db, identity.email);
  const recipients = new Map();
  if (preferences.notify_saved_contacts) {
    for (const recipient of await savedContactRecipients(db, identity.email)) recipients.set(recipient.chatId, recipient);
  }
  if (preferences.notify_hotel_companions) {
    for (const recipient of await hotelCompanionRecipients(db, identity.email)) recipients.set(recipient.chatId, recipient);
  }
  if (!recipients.size) throw Object.assign(new Error('Nenhum contato do Compartilhar ou colega de hotel está vinculado ao Telegram.'), { status: 400 });

  const alertId = crypto.randomUUID();
  const requesterLink = await telegramLink(db, identity.email);
  const requesterChatId = String(input.requesterChatId || requesterLink?.chatId || '');
  const requesterUsername = cleanText(input.requesterUsername || requesterLink?.username || '', 160).replace(/^@/, '');
  const requesterContact = telegramContactUrl(requesterUsername, requesterChatId);
  const type = EMERGENCY_TYPES[kind];
  const displayName = cleanText(identity.profile?.display_name || identity.payload?.name || identity.email.split('@')[0], 120);
  const locationUrl = preferences.include_location ? cleanText(input.locationUrl || '', 1000) : '';
  const details = cleanText(input.details || '', 500);
  const lines = [
    `${type.icon} ALERTA CREWCHECK - ${type.label.toUpperCase()}`,
    `Tripulante: ${displayName}`,
    `Horário: ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date())}`,
  ];
  if (locationUrl) lines.push(`Localização: ${locationUrl}`);
  if (details) lines.push(`Informação: ${details}`);
  if (kind === 'medical' && preferences.include_medical_profile) {
    const medical = await emergencyMedical(db, identity.email);
    if (medical.consent) lines.push(...medicalLines(medical.data));
  }
  lines.push(type.guidance, 'Use “Vou ajudar” para confirmar o atendimento e evitar respostas desencontradas.');
  const message = lines.join('\n');
  const results = [];
  for (const recipient of recipients.values()) {
    const replyMarkup = { inline_keyboard: [
      [{ text: '✅ Vou ajudar', callback_data: `cc_emergency_help:${alertId}` }],
      [
        ...(requesterContact ? [{ text: '💬 Contatar tripulante', url: requesterContact }] : []),
        ...(locationUrl ? [{ text: '📍 Ver localização', url: locationUrl }] : []),
      ],
    ].filter((row) => row.length) };
    const result = await sendTelegramRich(recipient.chatId, message, { reply_markup: replyMarkup });
    results.push({ ...recipient, ok: Boolean(result.ok) });
  }
  const successful = results.filter((item) => item.ok);
  if (!successful.length) throw Object.assign(new Error('Os contatos foram encontrados, mas o Telegram não aceitou o alerta agora.'), { status: 502 });
  const persistedRecipients = results.map(({ chatId, name, source, ok }) => ({
    chatIdHash: crypto.createHash('sha256').update(String(chatId)).digest('hex'),
    chatIdCipher: encryptPrivateText(String(chatId)),
    name,
    source,
    ok,
  }));
  await db.query(
    `INSERT INTO crewcheck_platform_emergency_alerts
     (id,owner_email,emergency_kind,status,message,location_url,recipients,channels)
     VALUES(?,?,?,'active',?,?,?,?)`,
    [alertId, identity.email, kind, message, locationUrl || null, JSON.stringify(persistedRecipients), JSON.stringify({ telegram: successful.length })],
  );
  return { alertId, kind, sent: successful.length, failed: results.length - successful.length, recipients: results.map(({ chatId, ...item }) => item) };
}

async function alertRecipients(db, alertId) {
  const [rows] = await db.query('SELECT recipients FROM crewcheck_platform_emergency_alerts WHERE id=? LIMIT 1', [alertId]);
  const recipients = parseJsonColumn(rows[0]?.recipients, []) || [];
  return recipients.map((recipient) => ({ ...recipient, chatId: decryptPrivateText(recipient.chatIdCipher) })).filter((recipient) => recipient.chatId);
}

async function notifyAlertClosed(db, alertId, message) {
  const recipients = await alertRecipients(db, alertId);
  await Promise.all(recipients.filter((recipient) => recipient.ok).map((recipient) => sendTelegramRich(recipient.chatId, message)));
}

async function closeAlert(db, email, status = 'cancelled', alertId = '') {
  const [rows] = await db.query(
    `SELECT id FROM crewcheck_platform_emergency_alerts
     WHERE owner_email=? AND status='active' ${alertId ? 'AND id=?' : ''} ORDER BY created_at DESC LIMIT 1`,
    alertId ? [email, alertId] : [email],
  );
  const selected = rows[0]?.id;
  if (!selected) return { changed: false, alertId: '' };
  await db.query('UPDATE crewcheck_platform_emergency_alerts SET status=?,cancelled_at=CURRENT_TIMESTAMP(3) WHERE id=? AND owner_email=?', [status, selected, email]);
  const message = status === 'assisted'
    ? '✅ O tripulante informou que já está sendo assistido. Não se desloque, salvo se ele pedir novamente.'
    : '✅ O tripulante cancelou o alerta e informou que não precisa mais de deslocamento.';
  await notifyAlertClosed(db, selected, message);
  return { changed: true, alertId: selected };
}

async function cancelLastAlert(db, email) {
  return closeAlert(db, email, 'cancelled');
}

async function acknowledgeEmergencyHelp(db, alertId, callback = {}) {
  const chatId = String(callback?.message?.chat?.id || callback?.from?.id || '');
  const chatHash = crypto.createHash('sha256').update(chatId).digest('hex');
  const [rows] = await db.query('SELECT owner_email,status,recipients FROM crewcheck_platform_emergency_alerts WHERE id=? LIMIT 1', [alertId]);
  const alert = rows[0];
  if (!alert) return { ok: false, message: 'Alerta não encontrado.' };
  if (alert.status !== 'active') return { ok: false, message: alert.status === 'assisted' ? 'O tripulante já está sendo assistido.' : 'Este alerta já foi encerrado.' };
  const recipients = parseJsonColumn(alert.recipients, []) || [];
  if (!recipients.some((recipient) => recipient.chatIdHash === chatHash && recipient.ok)) return { ok: false, message: 'Este botão não pertence a um alerta enviado para você.' };
  const responderName = cleanText([callback?.from?.first_name, callback?.from?.last_name].filter(Boolean).join(' ') || callback?.from?.username || 'Contato', 160);
  const responderUsername = cleanText(callback?.from?.username || '', 160).replace(/^@/, '');
  await db.query(
    `INSERT INTO crewcheck_platform_emergency_responses
     (alert_id,responder_chat_hash,responder_name,responder_username,response_status)
     VALUES(?,?,?,?,'helping')
     ON DUPLICATE KEY UPDATE responder_name=VALUES(responder_name),responder_username=VALUES(responder_username),response_status='helping',updated_at=CURRENT_TIMESTAMP(3)`,
    [alertId, chatHash, responderName, responderUsername || null],
  );
  const requester = await telegramLink(db, alert.owner_email);
  const responderContact = telegramContactUrl(responderUsername, chatId);
  if (requester?.chatId) {
    await sendTelegramRich(requester.chatId, `✅ ${responderName} confirmou que vai ajudar no seu alerta.`, responderContact ? { reply_markup: { inline_keyboard: [[{ text: '💬 Falar com quem respondeu', url: responderContact }], [{ text: '✅ Já estou sendo assistido', callback_data: `cc_emergency_ok:${alertId}` }]] } } : { reply_markup: { inline_keyboard: [[{ text: '✅ Já estou sendo assistido', callback_data: `cc_emergency_ok:${alertId}` }]] } });
  }
  return { ok: true, message: 'Sua confirmação foi enviada ao tripulante. Entre em contato e confirme a necessidade antes de se deslocar.', requesterContact: telegramContactUrl(requester?.username, requester?.chatId) };
}

async function updateHealthPlan(db, email, provider, code) {
  const current = await emergencyMedical(db, email);
  const data = {
    ...(current.data || {}),
    healthPlanProvider: cleanText(provider, 60),
    healthPlanCode: cleanText(code, 40).toUpperCase(),
  };
  const encrypted = encryptMedical(data);
  await db.query(
    `INSERT INTO crewcheck_platform_emergency_profiles(owner_email,cipher_text,cipher_iv,cipher_tag,consent_medical_share)
     VALUES(?,?,?,?,?)
     ON DUPLICATE KEY UPDATE cipher_text=VALUES(cipher_text),cipher_iv=VALUES(cipher_iv),cipher_tag=VALUES(cipher_tag),updated_at=CURRENT_TIMESTAMP(3)`,
    [email, encrypted.cipherText, encrypted.iv, encrypted.tag, current.consent ? 1 : 0],
  );
  return healthPlan(data);
}

async function handleProfile(req, res, context) {
  if (req.method === 'POST') {
    const body = await readBody(req, 300_000);
    const data = {
      bloodType: cleanText(body.bloodType, 12),
      allergies: cleanText(body.allergies, 500),
      continuousMedication: cleanText(body.continuousMedication, 500),
      medicalNotes: cleanText(body.medicalNotes, 500),
      healthPlanProvider: cleanText(body.healthPlanProvider, 60),
      healthPlanCode: cleanText(body.healthPlanCode, 40).toUpperCase(),
    };
    const encrypted = encryptMedical(data);
    await context.db.query(
      `INSERT INTO crewcheck_platform_emergency_profiles(owner_email,cipher_text,cipher_iv,cipher_tag,consent_medical_share)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE cipher_text=VALUES(cipher_text),cipher_iv=VALUES(cipher_iv),cipher_tag=VALUES(cipher_tag),consent_medical_share=VALUES(consent_medical_share),updated_at=CURRENT_TIMESTAMP(3)`,
      [context.email, encrypted.cipherText, encrypted.iv, encrypted.tag, body.consentMedicalShare ? 1 : 0],
    );
  }
  const medical = await emergencyMedical(context.db, context.email);
  sendJson(res, 200, { ok: true, saved: req.method === 'POST', profile: medical.data || {}, consentMedicalShare: medical.consent, encryptionConfigured: true, message: req.method === 'POST' ? 'Perfil médico e plano de saúde salvos com criptografia.' : 'Perfil médico carregado.' });
}

async function handlePreferences(req, res, context) {
  if (req.method === 'POST') {
    const body = await readBody(req, 200_000);
    await context.db.query(
      `INSERT INTO crewcheck_platform_emergency_preferences
       (owner_email,notify_saved_contacts,notify_hotel_companions,include_location,include_medical_profile)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE notify_saved_contacts=VALUES(notify_saved_contacts),notify_hotel_companions=VALUES(notify_hotel_companions),include_location=VALUES(include_location),include_medical_profile=VALUES(include_medical_profile),updated_at=CURRENT_TIMESTAMP(3)`,
      [context.email, body.notifySavedContacts === false ? 0 : 1, body.notifyHotelCompanions === false ? 0 : 1, body.includeLocation === false ? 0 : 1, body.includeMedicalProfile ? 1 : 0],
    );
  }
  const row = await emergencyPreferences(context.db, context.email);
  sendJson(res, 200, { ok: true, preferences: {
    notifySavedContacts: Boolean(row.notify_saved_contacts),
    notifyHotelCompanions: Boolean(row.notify_hotel_companions),
    includeLocation: Boolean(row.include_location),
    includeMedicalProfile: Boolean(row.include_medical_profile),
  } });
}

export async function handleEmergencyRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/platform/emergency')) return false;
  if (!flag('CREWCHECK_EMERGENCY_ENABLED', true)) {
    sendJson(res, 404, { ok: false, message: 'Central de emergência desativada.' });
    return true;
  }
  const context = await requireIdentity(req, res);
  if (!context) return true;
  await ensureEmergencySchema(context.db);
  if (url.pathname === '/api/platform/emergency/profile') {
    await handleProfile(req, res, context);
    return true;
  }
  if (url.pathname === '/api/platform/emergency/preferences') {
    await handlePreferences(req, res, context);
    return true;
  }
  if (url.pathname === '/api/platform/emergency/cancel' && req.method === 'POST') {
    const cancelled = await cancelLastAlert(context.db, context.email);
    sendJson(res, 200, { ok: true, cancelled: cancelled.changed, alertId: cancelled.alertId, message: cancelled.changed ? 'Último alerta cancelado; os destinatários foram avisados.' : 'Nenhum alerta ativo encontrado.' });
    return true;
  }
  if (url.pathname === '/api/platform/emergency/assisted' && req.method === 'POST') {
    const body = await readBody(req, 100_000);
    const assisted = await closeAlert(context.db, context.email, 'assisted', cleanText(body.alertId, 64));
    sendJson(res, 200, { ok: true, assisted: assisted.changed, alertId: assisted.alertId, message: assisted.changed ? 'Situação marcada como assistida; todos os destinatários foram avisados para não se deslocarem.' : 'Nenhum alerta ativo encontrado.' });
    return true;
  }
  if (url.pathname === '/api/platform/emergency/send' && req.method === 'POST') {
    const body = await readBody(req, 300_000);
    const result = await sendAlert(context.db, context, body);
    sendJson(res, 200, { ok: true, ...result, message: `Alerta enviado a ${result.sent} contato(s): ${result.recipients.filter((recipient) => recipient.ok).map((recipient) => recipient.name).join(', ')}.` });
    return true;
  }
  sendJson(res, 404, { ok: false, message: 'Recurso de emergência não localizado.' });
  return true;
}

const emergencyKeyboard = {
  inline_keyboard: [
    [{ text: '🔥 Fogo/fumaça', callback_data: 'cc_emergency:fire' }, { text: '🩺 Médica', callback_data: 'cc_emergency:medical' }],
    [{ text: '🛡️ Segurança', callback_data: 'cc_emergency:security' }, { text: '🚗 Acidente', callback_data: 'cc_emergency:accident' }],
    [{ text: '📍 Sem transporte', callback_data: 'cc_emergency:stranded' }, { text: '⚠️ Outra', callback_data: 'cc_emergency:other' }],
    [{ text: '✅ Estou bem / cancelar alerta', callback_data: 'cc_emergency:cancel' }],
  ],
};

function confirmationKeyboard(kind) {
  return { inline_keyboard: [[
    { text: '🚨 CONFIRMAR ENVIO', callback_data: `cc_emergency_confirm:${kind}` },
    { text: 'Cancelar', callback_data: 'cc_emergency_abort' },
  ]] };
}

function locationRequestKeyboard() {
  return {
    keyboard: [
      [{ text: '📍 Compartilhar localização atual', request_location: true }],
      [{ text: '🏨 Usar hotel/pernoite' }, { text: 'Continuar sem localização' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
    input_field_placeholder: 'Escolha como localizar o atendimento…',
  };
}

function alertStatusKeyboard(alertId) {
  return { inline_keyboard: [[
    { text: '✅ Já estou sendo assistido', callback_data: `cc_emergency_ok:${alertId}` },
    { text: 'Cancelar alerta', callback_data: 'cc_emergency:cancel' },
  ]] };
}

async function sendEmergencyConfirmation(sendMessage, chatId, kind, origin) {
  const type = EMERGENCY_TYPES[kind];
  await sendMessage(chatId, [
    `${type.icon} ${type.label}`,
    '',
    `Localização: ${origin?.label || 'não informada'}`,
    'Ao confirmar, o CrewCheck avisará os contatos habilitados. O quarto não será compartilhado.',
  ].join('\n'), { reply_markup: confirmationKeyboard(kind) });
  await sendMessage(chatId, 'Você pode atualizar a origem antes de confirmar:', { reply_markup: locationRequestKeyboard() });
}

async function registeredHotelOrigin(db, email) {
  const stay = await currentStay(db, email);
  if (!stay?.hotel_name) return null;
  const label = [stay.hotel_name, stay.airport].filter(Boolean).join(' · ');
  const place = await googlePlaceForText(`${stay.hotel_name} ${stay.airport || ''}`.trim());
  return {
    latitude: Number.isFinite(place?.latitude) ? place.latitude : null,
    longitude: Number.isFinite(place?.longitude) ? place.longitude : null,
    label: place?.label || label,
    source: 'registered-hotel',
    locationUrl: place?.mapsUrl || mapsSearchUrl(label),
  };
}

export async function handleEmergencyTelegram(update = {}, sendTelegramMessage) {
  if (!flag('CREWCHECK_EMERGENCY_ENABLED', true)) return false;
  const callback = update?.callback_query;
  const message = callback?.message || update?.message || update?.edited_message || {};
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || message?.caption || '').trim();
  const data = String(callback?.data || '').trim();
  const emergencyCommand = /^\/emergencia(?:@\S+)?\b/i.test(text) || /^🚨?\s*emerg[êe]ncia\b/i.test(text);
  const hospitalCommand = /^\/(?:hospitais?|prontoatendimento)(?:@\S+)?\b/i.test(text) || /^(?:🏥\s*)?(?:hospitais?|pronto[- ]?(?:socorro|atendimento))$/i.test(text);
  const pharmacyCommand = /^\/farmacias?(?:@\S+)?\b/i.test(text) || /^(?:💊\s*)?farm[aá]cias?$/i.test(text);
  const hotelCommand = /^\/(?:hoteis|hotéis|hotel)(?:@\S+)?\b/i.test(text) || /^(?:🏨\s*)?hot[eé]is$/i.test(text);
  const planCommand = /^\/plano(?:@\S+)?\b/i.test(text);
  const hotelLocationCommand = /usar hotel|hotel\/pernoite/i.test(text);
  const noLocationCommand = /continuar sem localiza[cç][aã]o/i.test(text);
  const hasLocation = Boolean(message?.location);
  const relevant = emergencyCommand || hospitalCommand || pharmacyCommand || hotelCommand || planCommand || hotelLocationCommand || noLocationCommand || hasLocation || data.startsWith('cc_emergency');
  if (!chatId || !relevant) return false;

  const db = await dbPool();
  if (!db) {
    await sendTelegramMessage(chatId, 'A Central de Emergência está temporariamente sem conexão com o banco. Acione imediatamente o serviço público/local de emergência.');
    return true;
  }
  await ensureEmergencySchema(db);

  if (data.startsWith('cc_emergency_help:')) {
    const alertId = cleanText(data.split(':')[1], 64);
    const result = await acknowledgeEmergencyHelp(db, alertId, callback);
    await answerEmergencyCallback(callback?.id, result.message);
    await sendTelegramMessage(chatId, result.message, result.requesterContact ? { reply_markup: { inline_keyboard: [[{ text: '💬 Contatar tripulante', url: result.requesterContact }]] } } : {});
    return true;
  }

  const linked = await profileForChat(db, chatId);
  if (hasLocation) {
    if (!linked?.email) return false;
    const session = await emergencySession(db, linked.email);
    if (!session?.pending_kind && !session?.pending_action) return false;
    const latitude = Number(message.location.latitude);
    const longitude = Number(message.location.longitude);
    const origin = { latitude, longitude, label: 'Localização atual compartilhada', source: 'telegram-live', locationUrl: `https://www.google.com/maps?q=${latitude},${longitude}` };
    await saveEmergencySession(db, linked.email, { latitude, longitude, locationLabel: origin.label, locationSource: origin.source });
    if (session.pending_action === 'hospital' || session.pending_action === 'pharmacy') {
      await saveEmergencySession(db, linked.email, { pendingAction: '' });
      await sendOpenCareResults(db, linked.email, chatId, session.pending_action, origin, sendTelegramMessage);
    }
    if (session.pending_kind) await sendEmergencyConfirmation(sendTelegramMessage, chatId, session.pending_kind, origin);
    return true;
  }

  if (!linked?.email) {
    await sendTelegramMessage(chatId, 'Vincule este Telegram ao CrewCheck antes de usar emergência, hotéis ou locais próximos. Em risco imediato, acione o serviço público/local de emergência.');
    return true;
  }

  if (hotelCommand) {
    await sendTelegramMessage(chatId, await registeredHotelsReply(db, linked.email));
    return true;
  }

  if (planCommand) {
    const match = text.toUpperCase().match(/S\s*(450|750)/);
    if (match) {
      const plan = await updateHealthPlan(db, linked.email, 'Amil', `S${match[1]}`);
      await sendTelegramMessage(chatId, `Plano salvo com criptografia: ${plan.provider} ${plan.code}. As buscas de hospitais passam a exibir somente correspondências da rede publicada para esse plano.`);
    } else if (/nenhum|remover|limpar/i.test(text)) {
      await updateHealthPlan(db, linked.email, '', '');
      await sendTelegramMessage(chatId, 'Preferência de plano removida. As buscas voltarão a mostrar locais abertos sem filtro de cobertura.');
    } else {
      const medical = await emergencyMedical(db, linked.email);
      const plan = healthPlan(medical.data || {});
      await sendTelegramMessage(chatId, plan.provider ? `Plano atual: ${plan.provider} ${plan.code}.\n\nPara alterar, use /plano S450 ou /plano S750.` : 'Nenhum plano definido. Use /plano S450 ou /plano S750; também é possível alterar no Perfil médico do CrewCheck.');
    }
    return true;
  }

  if (hospitalCommand || pharmacyCommand) {
    const kind = hospitalCommand ? 'hospital' : 'pharmacy';
    const origin = await emergencyOrigin(db, linked.email);
    if (!origin) {
      await saveEmergencySession(db, linked.email, { pendingAction: kind });
      await sendTelegramMessage(chatId, `Para localizar ${kind === 'hospital' ? 'hospitais e pronto-atendimentos' : 'farmácias'} abertos agora, compartilhe sua localização. Se houver pernoite cadastrado, você também pode usar o hotel.`, { reply_markup: locationRequestKeyboard() });
    } else {
      await saveEmergencySession(db, linked.email, { pendingAction: '' });
      await sendOpenCareResults(db, linked.email, chatId, kind, origin, sendTelegramMessage);
    }
    return true;
  }

  if (hotelLocationCommand) {
    const origin = await registeredHotelOrigin(db, linked.email);
    if (!origin) {
      await sendTelegramMessage(chatId, 'Não existe um hotel cadastrado para o pernoite atual. Compartilhe sua localização ou cadastre o hotel no CrewCheck.', { reply_markup: locationRequestKeyboard() });
      return true;
    }
    const session = await saveEmergencySession(db, linked.email, { latitude: origin.latitude, longitude: origin.longitude, locationLabel: origin.label, locationSource: origin.source });
    if (session.pendingAction === 'hospital' || session.pendingAction === 'pharmacy') {
      await saveEmergencySession(db, linked.email, { pendingAction: '' });
      await sendOpenCareResults(db, linked.email, chatId, session.pendingAction, origin, sendTelegramMessage);
    }
    if (session.pendingKind) await sendEmergencyConfirmation(sendTelegramMessage, chatId, session.pendingKind, origin);
    return true;
  }

  if (noLocationCommand) {
    const session = await saveEmergencySession(db, linked.email, { latitude: null, longitude: null, locationLabel: '', locationSource: 'none' });
    if (session.pendingKind) await sendEmergencyConfirmation(sendTelegramMessage, chatId, session.pendingKind, null);
    else await sendTelegramMessage(chatId, 'Tudo bem. A próxima ação será executada sem localização; alguns resultados próximos podem ficar indisponíveis.');
    return true;
  }

  if (data.startsWith('cc_emergency_ok:')) {
    const alertId = cleanText(data.split(':')[1], 64);
    const assisted = await closeAlert(db, linked.email, 'assisted', alertId);
    await answerEmergencyCallback(callback?.id, assisted.changed ? 'Destinatários avisados.' : 'Alerta já encerrado.');
    await sendTelegramMessage(chatId, assisted.changed ? '✅ Você informou que já está sendo assistido. Todos que receberam o alerta foram orientados a não se deslocar.' : 'Este alerta já estava encerrado.', { reply_markup: emergencyKeyboard });
    return true;
  }

  if (data === 'cc_emergency_abort') {
    await saveEmergencySession(db, linked.email, { pendingKind: '', pendingAction: '' });
    await answerEmergencyCallback(callback?.id, 'Envio cancelado.');
    await sendTelegramMessage(chatId, 'Envio cancelado. Nenhum contato foi notificado.', { reply_markup: emergencyKeyboard });
    return true;
  }

  if (emergencyCommand) {
    await sendTelegramMessage(chatId, 'Escolha a emergência. O CrewCheck pedirá localização e confirmação antes de avisar contatos e colegas de hotel.', { reply_markup: emergencyKeyboard });
    return true;
  }

  if (data === 'cc_emergency:cancel') {
    const cancelled = await cancelLastAlert(db, linked.email);
    await answerEmergencyCallback(callback?.id, cancelled.changed ? 'Alerta cancelado.' : 'Nenhum alerta ativo.');
    await sendTelegramMessage(chatId, cancelled.changed ? 'Alerta cancelado. Os destinatários foram avisados automaticamente.' : 'Nenhum alerta ativo foi encontrado.', { reply_markup: emergencyKeyboard });
    return true;
  }

  if (data.startsWith('cc_emergency:')) {
    const kind = emergencyKind(data.split(':')[1]);
    if (!kind) return true;
    await answerEmergencyCallback(callback?.id, 'Tipo selecionado.');
    await saveEmergencySession(db, linked.email, { pendingKind: kind });
    const origin = await emergencyOrigin(db, linked.email);
    await sendEmergencyConfirmation(sendTelegramMessage, chatId, kind, origin);
    return true;
  }

  if (data.startsWith('cc_emergency_confirm:')) {
    const kind = emergencyKind(data.split(':')[1]);
    if (!kind) return true;
    const [profiles] = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [linked.email]);
    try {
      await answerEmergencyCallback(callback?.id, 'Enviando alerta…');
      const origin = await emergencyOrigin(db, linked.email);
      const result = await sendAlert(db, { email: linked.email, profile: profiles[0] || {}, payload: linked.payload }, { kind, locationUrl: origin?.locationUrl || '', requesterChatId: chatId, requesterUsername: callback?.from?.username || linked.payload?.username || '' });
      const delivered = result.recipients.filter((recipient) => recipient.ok).map((recipient) => `• ${recipient.name}`).join('\n');
      await saveEmergencySession(db, linked.email, { pendingKind: '', pendingAction: kind === 'medical' && !origin ? 'hospital' : '' });
      await sendTelegramMessage(chatId, [`🚨 Alerta confirmado e entregue a ${result.sent} contato(s):`, delivered, '', 'Você receberá uma confirmação quando alguém tocar em “Vou ajudar”.', 'Quando houver assistência, toque no botão abaixo para evitar deslocamentos duplicados.', '', 'Em risco imediato, acione também o serviço público/local de emergência.'].join('\n'), { reply_markup: alertStatusKeyboard(result.alertId) });
      if (kind === 'medical') {
        if (origin) await sendOpenCareResults(db, linked.email, chatId, 'hospital', origin, sendTelegramMessage);
        else await sendTelegramMessage(chatId, 'Compartilhe a localização para eu procurar hospitais e pronto-atendimentos abertos agora, filtrados pelo seu plano quando disponível.', { reply_markup: locationRequestKeyboard() });
      }
    } catch (error) {
      await sendTelegramMessage(chatId, `Não consegui concluir o alerta: ${cleanText(error?.message || 'falha temporária', 220)}\n\nAcione imediatamente o serviço público/local de emergência.`, { reply_markup: emergencyKeyboard });
    }
    return true;
  }
  return false;
}

export const emergencyCatalog = EMERGENCY_TYPES;
