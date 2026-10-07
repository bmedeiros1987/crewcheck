import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createVisitorCode, completeVisitorCode, findVisitorBinding, handleVisitorMessage, claimVisitorMessage, unlinkVisitor, visitorPhoneHash, visitorRevision, whatsappVisitorEnabled, withVisitorPhoneLock } from '../server/concierge/whatsapp-visitor.mjs';
import { extractWhatsAppEvents, extractWhatsAppInboundMessages, extractWhatsAppStatusDiagnostics } from '../server/whatsapp.mjs';
const saved = process.env.CREWCHECK_WHATSAPP_AUDIT_SALT;
process.env.CREWCHECK_WHATSAPP_AUDIT_SALT = 'fictional-visitor-test-secret';
try {
  for (const flag of [undefined, '', 'false','TRUE','1',true]) assert.equal(whatsappVisitorEnabled({ CREWCHECK_WHATSAPP_VISITOR_ENABLED: flag }), false);
  const receiver = '1259259633936048', visitorPhone = '5511000000002', ownerPhone = '5511000000001';
  const visitor = { id: 'visitor-fictional-a', owner_email: 'owner-a@example.invalid', status: 'active', permissions: { roster: true, hotels: true, room: false, presentation: false, emergency: false } };
  const other = { id: 'visitor-fictional-b', owner_email: 'owner-b@example.invalid', status: 'active', permissions: { roster: true } };
  const visitors = new Map([[visitor.id, visitor], [other.id, other]]);
  const owners = new Map();
  let state = new Map(), tail = Promise.resolve(), now = Date.parse('2026-10-07T20:00:00Z'), premium = true, calls = [], sends = [];
  const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
  function query(target, sql, args = []) {
    if (sql.startsWith('SELECT payload')) return { rows: target.has(args[0]) ? [{ payload: structuredClone(target.get(args[0])) }] : [] };
    if (sql.includes('FROM crewcheck_platform_visitors')) {
      const item = sql.includes('telegram_chat_id=$1') ? [...visitors.values()].find(value => value.telegram_chat_id === args[0]) : visitors.get(args[0]);
      if (sql.includes('telegram_chat_id=$1')) return { rows: item && ['invited','active'].includes(item.status) ? [structuredClone(item)] : [] };
      return { rows: item && item.owner_email === args[1] && item.status === 'active' ? [structuredClone(item)] : [] };
    }
    if (sql.includes('FROM crewcheck_whatsapp_links')) return { rows: owners.has(args[0]) ? [{ email: owners.get(args[0]) }] : [] };
    if (sql.includes('FROM crewcheck_platform_profiles')) return { rows: [{ email: args[0], premium }] };
    if (sql.includes('FROM crewcheck_platform_rosters')) {
      assert.equal(args[0], visitor.owner_email, 'canonical read stays in bound owner scope'); calls.push('roster');
      return { rows: [{ roster: { days: [{ date: '2099-10-07', type: 'FICTITIOUS', legs: [{ origin: 'BSB', destination: 'FLN' }], salary: 'PRIVATE-FINANCE' }] } }] };
    }
    if (sql.includes('FROM crewcheck_platform_stays')) {
      assert.match(sql, /share_with_visitors=TRUE/); assert.equal(args[0], visitor.owner_email); calls.push('hotel');
      return { rows: [{ stay_date: '2099-10-07', hotel_name: 'Fictional hotel', room_cipher: 'PRIVATE-ROOM', presentation_time: 'PRIVATE-PRESENTATION' }] };
    }
    if (sql.startsWith('INSERT')) {
      if (target.has(args[0])) return { rows: [], rowCount: 0 };
      target.set(args[0], parse(args[1])); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE')) { target.set(args[1], parse(args[0])); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('DELETE')) {
      if (sql.includes('LIKE')) { for (const [key, value] of target) if (((sql.includes("'whatsapp-role:%'") && key.startsWith('whatsapp-role:')) || (sql.includes("'whatsapp-visitor-code:%'") && key.startsWith('whatsapp-visitor-code:'))) && value.visitorId === args[0] && value.ownerEmail === args[1]) target.delete(key); }
      else target.delete(args[0]); return { rows: [], rowCount: 1 };
    }
    throw Error('Unexpected fictional SQL');
  }
  const db = { async query(sql, args) { await tail; return query(state, sql, args); }, async connect() {
    let local, unlock;
    return { async query(sql, args) {
      if (sql === 'START TRANSACTION') { const previous = tail; tail = new Promise(resolve => { unlock = resolve; }); await previous; local = structuredClone(state); return {}; }
      if (sql === 'COMMIT') { state = local; unlock(); unlock = null; return {}; }
      if (sql === 'ROLLBACK') { if (unlock) unlock(); unlock = null; return {}; }
      return query(local, sql, args);
    }, release() {} };
  } };
  const authorized = async () => premium;
  const issue = item => createVisitorCode(db, item, receiver, { now: () => now });
  const bind = (phone, code) => completeVisitorCode(db, phone, code.replace('visitante_', ''), receiver, { now: () => now, authorized });
  let issued = await issue(visitor);
  assert.doesNotMatch(JSON.stringify([...state]), new RegExp(issued.code.replace('visitante_', '')), 'raw handoff is not persisted');
  const results = await Promise.all([bind(visitorPhone, issued.code), bind(visitorPhone, issued.code)]);
  assert.equal(results.filter(result => result.linked).length, 1, 'one-use code under contention');
  let binding = await findVisitorBinding(db, visitorPhone, receiver);
  assert.equal(binding.visitorId, visitor.id); assert.equal(binding.ownerEmail, visitor.owner_email);
  assert.equal((await findVisitorBinding(db, visitorPhone, 'wrong')).blocked, true);
  const retired = await issue(visitor); issued = await issue(visitor); assert.equal((await bind('5511000000003', retired.code)).linked, false, 'new handoff invalidates prior code');
  issued = await issue(other); assert.equal((await bind(visitorPhone, issued.code)).conflict, true, 'cross-owner relink rejected');
  issued = await issue(visitor); now += 600001; assert.equal((await bind('5511000000003', issued.code)).linked, false); now -= 600001;
  issued = await issue(visitor); visitor.status = 'revoked'; assert.equal((await bind('5511000000003', issued.code)).linked, false); visitor.status = 'active';
  issued = await issue(visitor); premium = false; assert.equal((await bind('5511000000003', issued.code)).linked, false); premium = true;
  owners.set(visitorPhoneHash(ownerPhone), 'owner-a@example.invalid'); issued = await issue(visitor); assert.equal((await bind(ownerPhone, issued.code)).conflict, true);
  const locked = await withVisitorPhoneLock(db, visitorPhone, async (_connection, record) => !record.visitorId);
  assert.equal(locked, false, 'owner path cannot claim a visitor reservation');

  // Execute the shared producers from actual prepared platform source.
  const platform = fs.readFileSync('server/platform.mjs', 'utf8');
  const section = (source, start, end) => { const from = source.indexOf(start); assert.ok(from >= 0); const to = source.indexOf(end, from); assert.ok(to > from); return source.slice(from, to).replaceAll('export async function', 'async function'); };
  const canonical = vm.createContext({ pool: async () => db, subscriptionStatus: async (_db, profile) => ({ premiumAccess: profile.premium }), visitorRevision,
    parseDateOnly: value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '', normalizeText: value => String(value || ''), decryptPrivate: () => 'PRIVATE-ROOM', Date });
  vm.runInContext(section(platform, 'function allowedPermissions(', 'function publicProfile(') + section(platform, 'export async function platformVisitorReadReply(', 'export async function platformWhatsAppVisitorBinding(') + section(platform, 'function visitorDaySummary(', 'export async function handlePlatformVisitorTelegram('), canonical);
  canonical.whatsappVisitorEnabled = () => true; canonical.visitorIdentity = req => req.identity; canonical.readBody = async req => req.body || {};
  canonical.env = (key, fallback = '') => ({ WHATSAPP_PHONE_NUMBER_ID: receiver, WHATSAPP_BUSINESS_NUMBER: '15550000000' })[key] || fallback;
  canonical.sendJson = (res, status, body) => { res.status = status; res.body = body; }; canonical.createVisitorCode = createVisitorCode; canonical.unlinkVisitor = unlinkVisitor;
  vm.runInContext(section(platform, 'async function handlePlatformWhatsAppVisitorLink(', 'function visitorDaySummary('), canonical);
  const route = async (identity, body = { consentConcierge: true }) => { const res = {}; await canonical.handlePlatformWhatsAppVisitorLink({ identity, body }, res, 'start'); return res; };
  assert.equal((await route(null)).status, 401);
  assert.equal((await route({ visitorId: visitor.id, ownerEmail: other.owner_email })).status, 403, 'forged owner relationship denied');
  assert.equal((await route({ visitorId: visitor.id, ownerEmail: visitor.owner_email }, {})).status, 400, 'explicit consent required');
  visitor.status = 'invited'; assert.equal((await route({ visitorId: visitor.id, ownerEmail: visitor.owner_email })).status, 403); visitor.status = 'active';
  premium = false; assert.equal((await route({ visitorId: visitor.id, ownerEmail: visitor.owner_email })).status, 403); premium = true;
  const started = await route({ visitorId: visitor.id, ownerEmail: visitor.owner_email }); assert.equal(started.status, 200); assert.match(started.body.code, /^visitante_/); assert.match(started.body.openUrl, /^https:\/\/wa.me\/15550000000/);
  canonical.whatsappVisitorEnabled = () => false; assert.equal((await route({ visitorId: visitor.id, ownerEmail: visitor.owner_email })).status, 404); canonical.whatsappVisitorEnabled = () => true;
  const contextOf = item => canonical.platformWhatsAppVisitorContext(item);
  const reply = (item, command) => canonical.platformWhatsAppVisitorReply(item, command);
  const deps = { enabled: () => true, receiver: () => receiver, now: () => now, findBinding: (phone, id) => findVisitorBinding(db, phone, id), context: contextOf,
    claim: (phone, item, message) => claimVisitorMessage(db, phone, item, message), reply, send: async (...args) => { sends.push(args); return { ok: true }; } };
  let sequence = 0;
  const message = (text = 'escala', override = {}) => ({ id: 'fictional-message-' + ++sequence, from: visitorPhone, phoneNumberId: receiver, timestamp: String(now / 1000), type: 'text', text, ...override });
  await handleVisitorMessage(message('hotel'), deps);
  assert.match(sends.at(-1)[1], /Fictional hotel/); assert.doesNotMatch(sends.at(-1)[1], /PRIVATE/);
  visitor.permissions.room = true; visitor.permissions.presentation = true;
  await handleVisitorMessage(message('hotel'), deps); assert.match(sends.at(-1)[1], /PRIVATE-ROOM/); assert.match(sends.at(-1)[1], /PRIVATE-PRESENTATION/);
  visitor.permissions.hotels = false;
  await handleVisitorMessage(message('hotel'), deps); assert.match(sends.at(-1)[1], /não compartilhou/);
  visitor.permissions.roster = false;
  const beforeReads = calls.length;
  await handleVisitorMessage(message('escala'), deps); assert.match(sends.at(-1)[1], /não compartilhou/); assert.equal(calls.length, beforeReads);
  visitor.permissions.roster = true; visitor.permissions.hotels = true; visitor.permissions.room = false; visitor.permissions.presentation = false;
  await handleVisitorMessage(message('escala'), deps); assert.match(sends.at(-1)[1], /BSB → FLN/); assert.doesNotMatch(sends.at(-1)[1], /PRIVATE-FINANCE/);
  const queries = calls.length;
  for (const input of [message('financeiro'), message('/diarias'), message('/emergencia'), message('/sos'), message('', { type: 'location', location: { latitude: 0, longitude: 0 } }), message('', { type: 'document' })]) await handleVisitorMessage(input, deps);
  assert.equal(calls.length, queries, 'finance/media/location/SOS never reaches shared private producer');
  const duplicate = message(); await Promise.all([handleVisitorMessage(duplicate, deps), handleVisitorMessage(duplicate, deps)]);
  assert.equal(sends.filter(item => item[2].replyToMessageId === duplicate.id).length, 1);
  for (const change of [() => { visitor.status = 'revoked'; }, () => { visitor.permissions.roster = false; }, () => { premium = false; }, () => { state.delete('whatsapp-role:' + visitorPhoneHash(visitorPhone)); }, () => { owners.set(visitorPhoneHash(visitorPhone), 'other-owner@example.invalid'); }]) {
    visitor.status = 'active'; visitor.permissions.roster = true; premium = true; owners.delete(visitorPhoneHash(visitorPhone)); state.set('whatsapp-role:' + visitorPhoneHash(visitorPhone), binding);
    const count = sends.length;
    await handleVisitorMessage(message(), { ...deps, reply: async (item, command) => { const text = await reply(item, command); change(); return text; } });
    assert.equal(sends.length, count, 'mid-flight binding/permission/revocation changes suppress delivery');
  }
  owners.delete(visitorPhoneHash(visitorPhone)); visitor.status = 'active'; visitor.permissions.roster = true; premium = true; state.set('whatsapp-role:' + visitorPhoneHash(visitorPhone), binding);
  for (const input of [message('', { phoneNumberId: 'wrong' }), message('', { timestamp: '' }), message('', { timestamp: String((now - 24*3600000)/1000) }), message('', { timestamp: String((now + 3600000)/1000) })]) {
    const count = sends.length; await handleVisitorMessage(input, deps); assert.equal(sends.length, count);
  }
  const count = sends.length; const badScope = { ...binding, ownerEmail: other.owner_email };
  await handleVisitorMessage(message(), { ...deps, findBinding: async () => badScope }); assert.equal(sends.length, count);
  await assert.rejects(handleVisitorMessage(message(), { ...deps, claim: async () => { throw Error('mock DB unavailable'); } })); assert.equal(sends.length, count);
  assert.ok(sends.every(item => item[0] === visitorPhone && item[2].expectedPhoneNumberId === receiver && item[2].replyToMessageId));
  visitor.telegram_chat_id = 'fictional-telegram';
  canonical.sha256 = () => 'unused'; canonical.retiredTokenHash = () => 'unused'; canonical.notifyOwnerEmergency = async () => { throw Error('SOS not requested'); }; canonical.sendTelegramDirect = async () => { throw Error('real transport forbidden'); };
  vm.runInContext(section(platform, 'export async function handlePlatformVisitorTelegram(', 'async function handleShares('), canonical);
  for (const command of ['/escala','/proximo','/hotel']) { let telegramReply; await canonical.handlePlatformVisitorTelegram({ chat: { id: visitor.telegram_chat_id } }, command, async (_id, text) => { telegramReply = text; }); assert.equal(telegramReply, await reply(binding, command)); }
  assert.match(platform, /await platformVisitorReadReply\(db, visitor, permissions, command\)/, 'Telegram uses the same producer');

  // Actual prepared dispatch and inbound adapter, including duplicate webhook path and separate owner flow.
  const source = fs.readFileSync('server/whatsapp.mjs', 'utf8');
  let ownerEngine = 0;
  const inbound = vm.createContext({ whatsappVisitorEnabled: () => true, phoneNumberId: () => receiver, normalizePhone: value => String(value),
    platformWhatsAppVisitorBinding: deps.findBinding, platformWhatsAppVisitorContext: deps.context, platformWhatsAppVisitorReply: deps.reply, platformWhatsAppVisitorClaim: deps.claim,
    platformWhatsAppVisitorComplete: (phone, code, id) => completeVisitorCode(db, phone, code, id, { now: () => now, authorized }),
    platformWhatsAppOwnerRoleLock: async (phone, operation) => withVisitorPhoneLock(db, phone, async (_conn, record) => record.visitorId ? { conflict: true } : operation()),
    handleVisitorMessage, sendWhatsAppText: deps.send, Date: class extends Date { static now() { return now; } }, whatsappPdfEnabled: () => false, whatsappPdfConfiguration: null, whatsappMenuEnabled: () => false,
    findActiveLinkByPhone: async phone => phone === ownerPhone ? { email: 'owner-a@example.invalid', linked_at: 'fictional', consent_concierge: 1 } : null,
    tryCompleteLink: async () => ({ linked: false }), whatsappConciergeHandler: async () => { ownerEngine++; return 'own-account-only'; },
    payloadHash: () => 'fictional', extractWhatsAppEvents, extractWhatsAppInboundMessages, extractWhatsAppStatusDiagnostics, claimInMemory: (() => { const seen = new Set(); return id => { if (seen.has(id)) return false; seen.add(id); return true; }; })(), claimPersistentEvent: async () => true, console: { info() {}, warn() {}, error() {} } });
  vm.runInContext(section(source, 'async function dispatchWhatsAppVisitor(', 'function webhookHealth('), inbound);
  const evt = message('escala');
  const payload = { entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: receiver }, messages: [{ id: evt.id, from: evt.from, type: 'text', timestamp: evt.timestamp, text: { body: evt.text } }, { id: evt.id, from: evt.from, type: 'text', timestamp: evt.timestamp, text: { body: evt.text } }] } }] }] };
  await inbound.processWhatsAppPayload(payload, Buffer.from('{}')); await inbound.processWhatsAppPayload(payload, Buffer.from('{}'));
  assert.equal(sends.filter(item => item[2].replyToMessageId === evt.id).length, 1); assert.equal(ownerEngine, 0);
  await inbound.handleInboundMessage(message('hoje', { from: ownerPhone })); assert.equal(ownerEngine, 1); assert.equal(sends.at(-1)[1], 'own-account-only');
  await inbound.handleInboundMessage(message('visitante_malformed', { from: ownerPhone })); assert.equal(ownerEngine, 1, 'handoff never reaches full-account provider');
  inbound.whatsappVisitorEnabled = () => false; await inbound.handleInboundMessage(message('visitante_' + 'A'.repeat(43), { from: ownerPhone })); assert.equal(ownerEngine, 1, 'disabled visitor gate also protects handoff token');
  await unlinkVisitor(db, { visitorId: other.id, ownerEmail: other.owner_email }); assert.ok(await findVisitorBinding(db, visitorPhone, receiver));
  await unlinkVisitor(db, { visitorId: visitor.id, ownerEmail: visitor.owner_email }); assert.equal(await findVisitorBinding(db, visitorPhone, receiver), null);
  console.log('PASS linked visitor code/binding, shared actual Telegram permission producer, account/role separation, invited/revoked/expired/premium/races, duplicate webhook, finance/media/SOS denied, sender/window guard; fictional DB and transport only');
} finally {
  if (saved === undefined) delete process.env.CREWCHECK_WHATSAPP_AUDIT_SALT; else process.env.CREWCHECK_WHATSAPP_AUDIT_SALT = saved;
}
