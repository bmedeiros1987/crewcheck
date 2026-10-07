import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { commitWhatsAppPdf } from '../server/concierge/whatsapp-pdf.mjs';
import { createVisitorCode, completeVisitorCode, findVisitorBinding, claimVisitorMessage, withVisitorPhoneLock, visitorPhoneHash, visitorRevision } from '../server/concierge/whatsapp-visitor.mjs';
import { enqueuePdfJob, runPdfJobs, readDurableSnapshot, seedDurableSnapshot, writeDurableSnapshot } from '../server/concierge/whatsapp-pdf-queue.mjs';

// Deliberately never reads application DB variables. Explicit isolated local test only.
if (process.env.CREWCHECK_TEST_MYSQL_ISOLATED !== 'true') {
  console.error('BLOCKED: set CREWCHECK_TEST_MYSQL_ISOLATED=true only for a disposable local MySQL 8 instance.');
  process.exit(2);
}
const mysql = (await import('mysql2/promise')).default;
const database = `crewcheck_test_whatsapp_${crypto.randomBytes(8).toString('hex')}`;
const config = { host: '127.0.0.1', port: Number(process.env.CREWCHECK_TEST_MYSQL_PORT || 3306), user: 'crewcheck_fixture', password: process.env.CREWCHECK_TEST_MYSQL_PASSWORD || 'fixture-only', connectionLimit: 8 };
assert.ok(Number.isInteger(config.port) && config.port > 0 && config.port <= 65535);
const admin = await mysql.createConnection(config);
let pool;
try {
  const [[version]] = await admin.query('SELECT VERSION() AS version');
  assert.match(version.version, /^8\./, 'requires MySQL 8, not a mock or MariaDB');
  await admin.query(`CREATE DATABASE ${database}`);
  pool = mysql.createPool({ ...config, database });
  await pool.query('CREATE TABLE crewcheck_telegram_state (state_key VARCHAR(191) PRIMARY KEY,payload JSON NOT NULL,updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  await pool.query('CREATE TABLE crewcheck_whatsapp_links (phone_hash VARCHAR(191) PRIMARY KEY,email VARCHAR(191),linked_at VARCHAR(40),revoked_at VARCHAR(40),consent_concierge INT) ENGINE=InnoDB');
  const phone = '5511999990000', receiver = '123456', email = 'fictional-a@example.invalid';
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const link = { email, linked_at: '2026-10-07T00:00:00Z', revoked_at: null, consent_concierge: 1 };
  await pool.query('INSERT INTO crewcheck_whatsapp_links VALUES(?,?,?,?,?)', [hash(phone), email, link.linked_at, null, 1]);
  const buildSnapshot = (previous, input) => ({ ...previous, email, source: 'whatsapp-pdf', durableWhatsAppPdf: true, roster: input.parsed.roster, whatsappPdfImport: { receivedAt: input.receivedAt, sentAt: input.sentAt } });
  const deps = { phoneHash: hash, buildSnapshot, receiver: () => receiver };
  const input = { key: 'fixture-receipt-1', link, phone, receiver, mediaDigest: 'fixture', parsed: { roster: { days: [{ date: '2026-10-07' }] } }, receivedAt: '2026-10-07T10:00:00Z', sentAt: String(Date.parse('2026-10-07T10:00:00Z') / 1000) };
  const concurrent = await Promise.all([commitWhatsAppPdf(pool, input, deps), commitWhatsAppPdf(pool, input, deps)]);
  assert.equal(concurrent.filter(value => value.duplicate).length, 1, 'one atomic receipt under contention');
  await assert.rejects(commitWhatsAppPdf(pool, { ...input, key: 'fixture-rejected' }, { ...deps, buildSnapshot: () => null }), /SNAPSHOT_REJECTED/);
  const [[receipt]] = await pool.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?', ['fixture-rejected']);
  assert.equal(receipt.n, 0, 'failed snapshot rolls receipt back');
  await assert.rejects(commitWhatsAppPdf(pool, { ...input, key: 'fixture-stale', receivedAt: '2026-10-07T09:00:00Z', sentAt: String(Date.parse('2026-10-07T09:00:00Z') / 1000) }, deps), /STALE_DOCUMENT/);
  const seeded = await seedDurableSnapshot(pool, email, { email, updatedAt: '2026-10-08T00:00:00Z', roster: { days: [{ date: 'legacy' }] } });
  assert.equal(seeded.roster.days[0].date, '2026-10-07', 'managed snapshot wins over legacy during rollback planning');
  assert.equal(await seedDurableSnapshot(pool, 'fictional-b@example.invalid', { email, roster: input.parsed.roster }), null, 'cross-account seed rejected');
  await Promise.all([writeDurableSnapshot(pool, email, previous => ({ ...previous, first: true })), writeDurableSnapshot(pool, email, previous => ({ ...previous, second: true }))]);
  const snapshot = await readDurableSnapshot(pool, email);
  assert.equal(snapshot.first, true); assert.equal(snapshot.second, true);
  const now = new Date('2026-10-07T10:01:00Z');
  const message = { id: 'fictional-message', from: phone, phoneNumberId: receiver, type: 'document', timestamp: input.sentAt, document: { id: '123', mime_type: 'application/pdf' } };
  const queueDeps = { receiver: () => receiver, phoneHash: hash, encryptPhone: () => 'fixture-cipher', now: () => now };
  const queued = await Promise.all([enqueuePdfJob(pool, message, queueDeps), enqueuePdfJob(pool, message, queueDeps)]);
  assert.equal(queued.filter(value => value.queued).length, 1);
  let imports = 0, confirmations = 0;
  const worker = { ...queueDeps, enabled: () => true, decryptPhone: () => phone, findLink: async () => link, importPdf: async () => { imports++; return { ok: true }; }, confirm: async () => { confirmations++; } };
  await Promise.all([runPdfJobs(pool, worker), runPdfJobs(pool, worker)]);
  assert.equal(imports, 1, 'real JSON CAS lease admits one worker'); assert.equal(confirmations, 1);
  const [[completed]] = await pool.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?', [queued[0].key]);
  const record = typeof completed.payload === 'string' ? JSON.parse(completed.payload) : completed.payload;
  assert.equal(record.stage, 'completed'); assert.equal(record.phoneCipher, undefined); assert.equal(record.message, undefined);
  // Same existing JSON table, real transaction/row locks for linked visitors.
  process.env.CREWCHECK_WHATSAPP_AUDIT_SALT = 'fictional-mysql-visitor-test';
  await pool.query('CREATE TABLE crewcheck_platform_visitors (id VARCHAR(191) PRIMARY KEY,owner_email VARCHAR(191),status VARCHAR(20)) ENGINE=InnoDB');
  const visitor = { id: 'fictional-visitor', owner_email: email, status: 'active' };
  await pool.query('INSERT INTO crewcheck_platform_visitors VALUES(?,?,?)', [visitor.id, email, 'active']);
  const platform = fs.readFileSync(new URL('../server/platform.mjs', import.meta.url), 'utf8');
  assert.ok(platform.includes('VISITOR_PRIVATE_DELIVERY_V2'), 'prepare canonical sources before isolated MySQL test');
  const section = (a,b) => { const start = platform.indexOf(a); assert.ok(start >= 0); const end = platform.indexOf(b,start); assert.ok(end > start); return platform.slice(start,end).replaceAll('export async function','async function'); };
  // Exact production normalization, placeholder/JSON conversion and connection/release adapter.
  const production = vm.createContext({ crypto, Buffer, Date, Intl, process: { env: {
    CREWCHECK_DATA_ENCRYPTION_KEY: 'fictional-native-test-key',
    CREWCHECK_AUTH_SECRET: 'fictional-native-test-auth',
    CREWCHECK_TRUST_LEGACY_PREMIUM_PROFILE: 'false',
  } } });
  vm.runInContext(section('const DEFAULT_TIMEZONE =', 'const GOOGLE_PLAY_PRODUCTS =') +
    section('const PLAN_CATALOG =', 'function sendJson(') +
    section('function normalizeText(', 'function safeEqual(') +
    section('const MYSQL_JSON_COLUMNS =', 'function mysqlPoolOptions(') +
    section('function normalizeTimezone(', 'function normalizeLocale(') +
    section('function planCatalog(', 'export async function consumePlatformUsage(') +
    section('function authSecret(', 'function verifyJwt(') +
    section('function encryptionKey(', 'function hotelKey(') +
    section('function parseDateOnly(', 'function temporaryPassword('), production);
  const visitorDb = production.mysqlAdapter(pool);
  await pool.query('CREATE TABLE crewcheck_platform_profiles (email VARCHAR(191) PRIMARY KEY,plan VARCHAR(40),timezone VARCHAR(80)) ENGINE=InnoDB');
  await pool.query('CREATE TABLE crewcheck_platform_subscriptions (email VARCHAR(191) PRIMARY KEY,plan VARCHAR(40),status VARCHAR(20),current_period_end DATETIME,cancel_at_period_end INT,provider VARCHAR(40),product_id VARCHAR(80)) ENGINE=InnoDB');
  await pool.query('CREATE TABLE crewcheck_platform_usage (email VARCHAR(191),month_key VARCHAR(7),usage_kind VARCHAR(40),used INT) ENGINE=InnoDB');
  await pool.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?)', [email,'premium_monthly','America/Sao_Paulo']);
  await pool.query('INSERT INTO crewcheck_platform_subscriptions VALUES(?,?,?,?,?,?,?)', [email,'premium_monthly','active','2099-12-31 00:00:00',0,'fictional',null]);
  const authorized = async (database, candidate) => {
    const profile = await database.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [candidate.owner_email]);
    return Boolean(profile.rows[0] && (await production.subscriptionStatus(database, profile.rows[0])).premiumAccess);
  };
  const issued = await createVisitorCode(visitorDb, visitor, receiver);
  const code = issued.code.slice('visitante_'.length);
  const binds = await Promise.all([completeVisitorCode(visitorDb, '5511999990002', code, receiver, { authorized }), completeVisitorCode(visitorDb, '5511999990002', code, receiver, { authorized })]);
  assert.equal(binds.filter(result => result.linked).length, 1);
  const bound = await findVisitorBinding(visitorDb, '5511999990002', receiver);
  assert.equal(bound.visitorId, visitor.id);
  assert.equal(await claimVisitorMessage(visitorDb, '5511999990002', bound, { id: 'fictional-visitor-message', phoneNumberId: receiver }), true);
  assert.equal(await claimVisitorMessage(visitorDb, '5511999990002', bound, { id: 'fictional-visitor-message', phoneNumberId: receiver }), false);
  const retired = await createVisitorCode(visitorDb, visitor, receiver);
  await pool.query("UPDATE crewcheck_platform_visitors SET status='revoked' WHERE id=?", [visitor.id]);
  assert.equal((await completeVisitorCode(visitorDb, '5511999990003', retired.code.slice('visitante_'.length), receiver, { authorized })).linked, false);
  // Actual materialized private delivery guard, with native MySQL locks and fictitious metadata.
  await pool.query('ALTER TABLE crewcheck_platform_visitors ADD permissions JSON');
  await pool.query("UPDATE crewcheck_platform_visitors SET status='active',permissions=? WHERE id=?", [JSON.stringify({ hotels: true, room: true, presentation: true }), visitor.id]);
  await pool.query('CREATE TABLE crewcheck_platform_stays (id VARCHAR(191) PRIMARY KEY,owner_email VARCHAR(191),stay_date DATE,hotel_name VARCHAR(191),room_cipher TEXT,presentation_time VARCHAR(20),share_with_visitors INT,updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),KEY owner_idx(owner_email,stay_date)) ENGINE=InnoDB');
  await pool.query('INSERT INTO crewcheck_platform_stays(id,owner_email,stay_date,hotel_name,room_cipher,presentation_time,share_with_visitors) VALUES(?,?,?, ?,?,?,1)', ['fixture-stay',email,'2099-10-07','Fictional hotel',production.encryptPrivate('fictional-room'),'10:00']);
  const canonical = production;
  Object.assign(canonical, { withVisitorPhoneLock, visitorPhoneHash, visitorRevision, whatsappVisitorEnabled: () => true, pool: async () => visitorDb });
  vm.runInContext(section('function allowedPermissions(', 'function publicProfile(') + section('export async function platformVisitorReadReply(', 'export async function platformWhatsAppVisitorBinding(') + section('function visitorDaySummary(', 'export async function handlePlatformVisitorTelegram('), canonical);
  const liveBinding = await findVisitorBinding(visitorDb,'5511999990002',receiver);
  const context = await canonical.platformWhatsAppVisitorContext(liveBinding);
  const rendered = await canonical.platformWhatsAppVisitorReply(liveBinding,'/hotel');
  let attempts = 0;
  assert.ok(context, 'actual production subscriptionStatus recognizes active fictional subscription');
  await pool.query("UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?", [email]);
  assert.equal((await canonical.platformWhatsAppVisitorContext(liveBinding)).premium, false, 'production Premium helper denies canceled subscription');
  const noPremium = await canonical.platformWhatsAppVisitorDeliver('5511999990002', liveBinding, context.revision, rendered, async () => { attempts++; return { ok: true }; });
  assert.equal(noPremium.code, 'VISITOR_AUTHORIZATION_CHANGED'); assert.equal(attempts, 0);
  await pool.query("UPDATE crewcheck_platform_subscriptions SET status='active' WHERE email=?", [email]);
  await pool.query('UPDATE crewcheck_platform_stays SET share_with_visitors=0 WHERE id=?', ['fixture-stay']);
  const denied = await canonical.platformWhatsAppVisitorDeliver('5511999990002', liveBinding, context.revision, rendered, async () => { attempts++; return { ok: true }; });
  assert.equal(denied.code,'VISITOR_RESOURCE_CHANGED'); assert.equal(attempts,0);
  await pool.query('UPDATE crewcheck_platform_stays SET share_with_visitors=1 WHERE id=?', ['fixture-stay']);
  const fresh = await canonical.platformWhatsAppVisitorReply(liveBinding,'/hotel');
  const held = await canonical.platformWhatsAppVisitorDeliver('5511999990002', liveBinding, context.revision, fresh, async () => {
    const contender = await pool.getConnection();
    try {
      await contender.query('SET SESSION innodb_lock_wait_timeout=1');
      await assert.rejects(contender.query('UPDATE crewcheck_platform_stays SET share_with_visitors=0 WHERE id=?', ['fixture-stay']), error => error.code === 'ER_LOCK_WAIT_TIMEOUT');
    } finally { contender.release(); }
    attempts++; return { ok: true }; // Fake provider acceptance only.
  });
  assert.equal(held.ok,true); assert.equal(attempts,1);
  await pool.query("DELETE FROM crewcheck_telegram_state WHERE state_key=?", ['whatsapp-role:'+visitorPhoneHash('5511999990002')]);
  const unlinked = await canonical.platformWhatsAppVisitorDeliver('5511999990002', liveBinding, context.revision, fresh, async () => { attempts++; return { ok: true }; });
  assert.equal(unlinked.code,'VISITOR_BINDING_CHANGED'); assert.equal(attempts,1);
  console.log('PASS: actual materialized visitor guard rejects committed unshare/unlink; real InnoDB stay lock spans fake outbound attempt; no real provider');
  console.log('PASS: linked visitor MySQL one-use handoff, reservation, receipt and revocation; fictional data only');
  console.log('PASS: MySQL 8 InnoDB atomic receipt/snapshot rollback, contention, staleness, snapshot locks, legacy isolation and JSON queue CAS; fictional data only');
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
}
