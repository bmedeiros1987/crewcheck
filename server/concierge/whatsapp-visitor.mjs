import crypto from 'node:crypto';
export const whatsappVisitorEnabled = (environment = process.env) => environment.CREWCHECK_WHATSAPP_VISITOR_ENABLED === 'true';
const secret = () => ['CREWCHECK_WHATSAPP_AUDIT_SALT','CREWCHECK_DATA_ENCRYPTION_KEY','CREWCHECK_AUTH_SECRET','META_APP_SECRET'].map(key => String(process.env[key] || '').trim()).find(Boolean) || '';
const hash = value => secret() ? crypto.createHmac('sha256', secret()).update(value).digest('hex') : '';
export const visitorPhoneHash = phone => /^\d{8,16}$/.test(String(phone)) ? hash(String(phone)) : '';
export const visitorOwnerHash = email => hash(`visitor-owner|${String(email).trim().toLowerCase()}`);
const codeKey = code => `whatsapp-visitor-code:${hash(`visitor-code|${code}`)}`;
const roleKey = phone => `whatsapp-role:${visitorPhoneHash(phone)}`;
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const failure = code => Object.assign(new Error(code), { code });
export function visitorRevision(visitor, permissions, premium) {
  return JSON.stringify([visitor.id, visitor.owner_email, visitor.status, permissions, Boolean(premium)]);
}
async function transaction(db, work) {
  if (!db?.connect) throw failure('VISITOR_DB_UNAVAILABLE');
  const connection = await db.connect();
  try { await connection.query('START TRANSACTION'); const result = await work(connection); await connection.query('COMMIT'); return result; }
  catch (error) { await connection.query('ROLLBACK').catch(() => {}); throw error; }
  finally { connection.release(); }
}
export async function withVisitorPhoneLock(db, phone, work) {
  if (!visitorPhoneHash(phone)) throw failure('VISITOR_IDENTITY_UNAVAILABLE');
  return transaction(db, async connection => {
    const key = roleKey(phone);
    await connection.query('INSERT IGNORE INTO crewcheck_telegram_state(state_key,payload) VALUES($1,$2)', [key, '{}']);
    const record = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE', [key]);
    return work(connection, parse(record.rows[0]?.payload) || {}, key);
  });
}
export async function createVisitorCode(db, visitor, receiver, { now = () => Date.now() } = {}) {
  if (!receiver || !secret() || visitor?.status !== 'active') throw failure('VISITOR_NOT_AUTHORIZED');
  const code = crypto.randomBytes(32).toString('base64url');
  const payload = { visitorId: visitor.id, ownerEmail: visitor.owner_email, receiver, expiresAt: now() + 600000 };
  // Lock the canonical visitor row; an invitation renewal or revocation cannot create a valid handoff.
  await transaction(db, async connection => {
    const result = await connection.query("SELECT id FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' FOR UPDATE", [visitor.id, visitor.owner_email]);
    if (!result.rows[0]) throw failure('VISITOR_NOT_AUTHORIZED');
    await connection.query("DELETE FROM crewcheck_telegram_state WHERE state_key LIKE 'whatsapp-visitor-code:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.visitorId'))=$1 AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerEmail'))=$2", [visitor.id, visitor.owner_email]);
    await connection.query('INSERT INTO crewcheck_telegram_state(state_key,payload) VALUES($1,$2)', [codeKey(code), JSON.stringify(payload)]);
  });
  return { code: `visitante_${code}`, expiresInMinutes: 10 };
}
export async function findVisitorBinding(db, phone, receiver) {
  if (!visitorPhoneHash(phone) || !db) throw failure('VISITOR_DB_UNAVAILABLE');
  const result = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 LIMIT 1', [roleKey(phone)]);
  const binding = parse(result.rows[0]?.payload);
  if (!binding?.visitorId) return null;
  // Reserve even an inactive binding; never fall through into a full-account identity.
  if (binding.receiver !== receiver) return { ...binding, blocked: true };
  const owner = await db.query('SELECT email FROM crewcheck_whatsapp_links WHERE phone_hash=$1 AND revoked_at IS NULL LIMIT 1', [visitorPhoneHash(phone)]);
  return { ...binding, blocked: Boolean(owner.rows[0]) };
}
export async function completeVisitorCode(db, phone, code, receiver, { now = () => Date.now(), authorized = async () => false } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(code)) || !receiver) return { handled: true, linked: false };
  return withVisitorPhoneLock(db, phone, async (connection, previous, key) => {
    const result = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 LIMIT 1', [codeKey(code)]);
    const pending = parse(result.rows[0]?.payload);
    if (!pending || pending.receiver !== receiver || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= now()) return { handled: true, linked: false };
    // Phone reservation and handoff are locked before validating the canonical visitor.
    const visitors = await connection.query("SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' FOR UPDATE", [pending.visitorId, pending.ownerEmail]);
    const visitor = visitors.rows[0];
    if (!visitor) return { handled: true, linked: false };
    const locked = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE', [codeKey(code)]);
    const currentCode = parse(locked.rows[0]?.payload);
    if (!currentCode || currentCode.visitorId !== visitor.id || currentCode.ownerEmail !== visitor.owner_email || currentCode.receiver !== receiver || currentCode.expiresAt <= now() || !await authorized(connection, visitor)) return { handled: true, linked: false };
    if (previous.visitorId && (previous.visitorId !== visitor.id || previous.ownerEmail !== visitor.owner_email)) return { handled: true, linked: false, conflict: true };
    const owners = await connection.query('SELECT email FROM crewcheck_whatsapp_links WHERE phone_hash=$1 AND revoked_at IS NULL FOR UPDATE', [visitorPhoneHash(phone)]);
    if (owners.rows[0]) return { handled: true, linked: false, conflict: true };
    const binding = { visitorId: visitor.id, ownerEmail: visitor.owner_email, receiver, bindingId: crypto.randomUUID(), linkedAt: new Date(now()).toISOString() };
    await connection.query('UPDATE crewcheck_telegram_state SET payload=$1,updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=$2', [JSON.stringify(binding), key]);
    await connection.query('DELETE FROM crewcheck_telegram_state WHERE state_key=$1', [codeKey(code)]);
    return { handled: true, linked: true, binding };
  });
}
export async function unlinkVisitor(db, identity) {
  // Unlink only records owned by this exact visitor relationship, including stale/revoked ones.
  await db.query("DELETE FROM crewcheck_telegram_state WHERE (state_key LIKE 'whatsapp-role:%' OR state_key LIKE 'whatsapp-visitor-code:%') AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.visitorId'))=$1 AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerEmail'))=$2", [identity.visitorId, identity.ownerEmail]);
}
export async function claimVisitorMessage(db, phone, binding, message) {
  if (!message.id || !binding.bindingId) return false;
  const key = `whatsapp-visitor-message:${hash(JSON.stringify([message.phoneNumberId, message.id]))}`;
  const result = await db.query('INSERT IGNORE INTO crewcheck_telegram_state(state_key,payload) VALUES($1,$2)', [key, JSON.stringify({ role: 'visitor', bindingId: binding.bindingId, subjectHash: visitorPhoneHash(phone), ownerHash: visitorOwnerHash(binding.ownerEmail) })]);
  return result.rowCount === 1;
}
const commandOf = text => {
  const value = String(text || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return new Map([['menu','/ajuda'],['ajuda','/ajuda'],['/menu','/ajuda'],['escala','/escala'],['proxima programacao','/proximo'],['proximo','/proximo'],['hotel','/hotel'],['pernoite','/hotel']]).get(value) || value.split(/\s+/)[0];
};
/** No owner Concierge identity, emergency dispatcher or location provider is accepted. */
export async function handleVisitorMessage(message, deps) {
  const receiver = deps.receiver();
  if (!receiver || message.phoneNumberId !== receiver || !/^\d{8,16}$/.test(String(message.from))) return { handled: true, reason: 'receiver_mismatch' };
  const binding = await deps.findBinding(message.from, receiver);
  if (!binding) return { handled: false };
  if (!deps.enabled() || binding.blocked) return { handled: true, reason: 'binding_blocked' };
  const sentAt = /^\d{10,11}$/.test(String(message.timestamp || '')) ? Number(message.timestamp) * 1000 : NaN;
  const inWindow = () => Number.isFinite(sentAt) && deps.now() >= sentAt && deps.now() - sentAt < 23 * 60 * 60 * 1000;
  if (!inWindow()) return { handled: true, reason: 'window_unknown_or_expired' };
  const context = await deps.context(binding);
  if (!context?.active || !context.premium || context.visitorId !== binding.visitorId || context.ownerEmail !== binding.ownerEmail) return { handled: true, reason: 'not_authorized' };
  if (!await deps.claim(message.from, binding, message)) return { handled: true, reason: 'duplicate' };
  let text;
  const command = commandOf(message.text);
  if (message.type !== 'text') text = 'Neste acesso de visitante, envie apenas texto. Localização, PDF e áudio não acionam consultas ou pedidos de ajuda.';
  else if (['/emergencia','/ajuda_agora','/sos'].includes(command)) text = 'Pedidos de ajuda pelo WhatsApp não estão habilitados nesta fase. Use o canal já autorizado pelo titular.';
  else if (!['/ajuda','/start','/escala','/proximo','/hotel'].includes(command)) text = 'Comando não disponível para visitante. Digite “menu”.';
  else text = await deps.reply(binding, command);
  const currentBinding = await deps.findBinding(message.from, receiver);
  const current = await deps.context(binding);
  if (!deps.enabled() || deps.receiver() !== receiver || currentBinding?.blocked || currentBinding?.bindingId !== binding.bindingId || !current?.active || !current.premium || current.revision !== context.revision || !inWindow()) return { handled: true, reason: 'authorization_changed' };
  const result = await deps.send(message.from, text, { replyToMessageId: message.id, expectedPhoneNumberId: receiver });
  return { handled: true, sent: Boolean(result?.ok) };
}
