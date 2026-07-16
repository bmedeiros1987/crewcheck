import crypto from 'node:crypto';
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
import { sendTelegram, telegramLink } from '../v139/delivery.mjs';

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
  lines.push(type.guidance, 'Responda diretamente ao tripulante e acione o serviço público/local adequado.');
  const message = lines.join('\n');
  const results = [];
  for (const recipient of recipients.values()) {
    const result = await sendTelegram(recipient.chatId, message);
    results.push({ ...recipient, ok: Boolean(result.ok) });
  }
  const successful = results.filter((item) => item.ok);
  if (!successful.length) throw Object.assign(new Error('Os contatos foram encontrados, mas o Telegram não aceitou o alerta agora.'), { status: 502 });
  const alertId = crypto.randomUUID();
  await db.query(
    `INSERT INTO crewcheck_platform_emergency_alerts
     (id,owner_email,emergency_kind,status,message,location_url,recipients,channels)
     VALUES(?,?,?,'active',?,?,?,?,?)`,
    [alertId, identity.email, kind, message, locationUrl || null, JSON.stringify(results.map(({ chatId, name, source, ok }) => ({ chatIdHash: crypto.createHash('sha256').update(chatId).digest('hex'), name, source, ok }))), JSON.stringify({ telegram: successful.length })],
  );
  return { alertId, kind, sent: successful.length, failed: results.length - successful.length, recipients: results.map(({ chatId, ...item }) => item) };
}

async function cancelLastAlert(db, email) {
  const [rows] = await db.query(
    `SELECT id FROM crewcheck_platform_emergency_alerts
     WHERE owner_email=? AND status='active' ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  if (!rows[0]) return false;
  await db.query("UPDATE crewcheck_platform_emergency_alerts SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP(3) WHERE id=? AND owner_email=?", [rows[0].id, email]);
  return true;
}

async function handleProfile(req, res, context) {
  if (req.method === 'POST') {
    const body = await readBody(req, 300_000);
    const data = {
      bloodType: cleanText(body.bloodType, 12),
      allergies: cleanText(body.allergies, 500),
      continuousMedication: cleanText(body.continuousMedication, 500),
      medicalNotes: cleanText(body.medicalNotes, 500),
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
  sendJson(res, 200, { ok: true, profile: medical.data || {}, consentMedicalShare: medical.consent });
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
    sendJson(res, 200, { ok: true, cancelled, message: cancelled ? 'Último alerta marcado como cancelado.' : 'Nenhum alerta ativo encontrado.' });
    return true;
  }
  if (url.pathname === '/api/platform/emergency/send' && req.method === 'POST') {
    const body = await readBody(req, 300_000);
    const result = await sendAlert(context.db, context, body);
    sendJson(res, 200, { ok: true, ...result, message: `Alerta enviado a ${result.sent} contato(s).` });
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

export async function handleEmergencyTelegram(update = {}, sendTelegramMessage) {
  if (!flag('CREWCHECK_EMERGENCY_ENABLED', true)) return false;
  const callback = update?.callback_query;
  const message = callback?.message || update?.message || update?.edited_message || {};
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || message?.caption || '').trim();
  const data = String(callback?.data || '').trim();
  const isCommand = /^\/emergencia(?:@\S+)?\b/i.test(text) || data.startsWith('cc_emergency');
  if (!chatId || !isCommand) return false;
  const db = await dbPool();
  if (!db) {
    await sendTelegramMessage(chatId, 'A Central de Emergência está temporariamente sem conexão com o banco. Acione imediatamente o serviço público/local de emergência.');
    return true;
  }
  const linked = await profileForChat(db, chatId);
  if (!linked?.email) {
    await sendTelegramMessage(chatId, 'Vincule este Telegram ao CrewCheck antes de usar o botão de emergência. Em risco imediato, acione o serviço público/local de emergência.');
    return true;
  }
  if (!data || data === 'cc_emergency_abort') {
    await sendTelegramMessage(chatId, data === 'cc_emergency_abort' ? 'Envio cancelado. Nenhum contato foi notificado.' : 'Escolha a emergência. O CrewCheck pedirá confirmação antes de avisar contatos e colegas de hotel.', { reply_markup: emergencyKeyboard });
    return true;
  }
  if (data === 'cc_emergency:cancel') {
    const cancelled = await cancelLastAlert(db, linked.email);
    await sendTelegramMessage(chatId, cancelled ? 'Alerta cancelado no CrewCheck. Avise diretamente quem já recebeu a mensagem que você está bem.' : 'Nenhum alerta ativo foi encontrado.', { reply_markup: emergencyKeyboard });
    return true;
  }
  if (data.startsWith('cc_emergency:')) {
    const kind = emergencyKind(data.split(':')[1]);
    if (!kind) return true;
    const type = EMERGENCY_TYPES[kind];
    await sendTelegramMessage(chatId, `${type.icon} ${type.label}\n\nAo confirmar, os contatos salvos em Compartilhar e colegas que autorizaram presença no mesmo hotel poderão ser avisados. O quarto não será compartilhado.`, { reply_markup: confirmationKeyboard(kind) });
    return true;
  }
  if (data.startsWith('cc_emergency_confirm:')) {
    const kind = emergencyKind(data.split(':')[1]);
    if (!kind) return true;
    const [profiles] = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [linked.email]);
    try {
      const result = await sendAlert(db, { email: linked.email, profile: profiles[0] || {}, payload: linked.payload }, { kind });
      await sendTelegramMessage(chatId, `🚨 Alerta confirmado e enviado a ${result.sent} contato(s). Em risco imediato, acione também o serviço público/local de emergência.`, { reply_markup: emergencyKeyboard });
    } catch (error) {
      await sendTelegramMessage(chatId, `Não consegui concluir o alerta: ${cleanText(error?.message || 'falha temporária', 220)}\n\nAcione imediatamente o serviço público/local de emergência.`, { reply_markup: emergencyKeyboard });
    }
    return true;
  }
  return false;
}

export const emergencyCatalog = EMERGENCY_TYPES;
