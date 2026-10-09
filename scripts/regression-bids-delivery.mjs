import assert from 'node:assert/strict';
import { dueKind, notifyBidRows } from '../server/v139/bidsNotify.mjs';
import { buildBidsCalendar } from '../server/v139/bidsCalendar.mjs';
import { sendTelegram } from '../server/v139/delivery.mjs';

// No credentials, provider, database or recipient: all delivery is injected.
globalThis.fetch = () => { throw new Error('Real network forbidden in this test'); };
const now = new Date('2026-10-11T12:00:00Z');
const row = { id: 'fixture', owner_email: 'fixture@example.invalid', title: 'Fixture', target_month: '2026-10', opens_at: '2026-10-11T10:00:00Z', closes_at: '2026-10-15T20:00:00Z', notify_open: 1, notify_last_day: 1 };
assert.equal(dueKind(row, now), 'open');
assert.equal(dueKind({ ...row, opens_at: '2026-10-15T19:00:00Z' }, new Date('2026-10-15T12:00:00Z')), '');
assert.equal(dueKind(row, new Date(row.closes_at)), '');
assert.equal(dueKind({ ...row, opens_at: row.closes_at }, now), '');
assert.equal(dueKind({ ...row, notify_open: 0, notify_last_day: 0 }, now), '');
// UTC is already next day, but Sao Paulo is still the closing day.
assert.equal(dueKind({ ...row, closes_at: '2026-10-16T02:00:00Z' }, new Date('2026-10-16T01:00:00Z')), 'last-day');

const writes = []; const states = new Map(); let current = { ...row };
const db = { query: async (sql, args) => {
  writes.push([sql,args]);
  if (sql.startsWith('SELECT *,ROUND')) return [[current]];
  if (sql.startsWith('SELECT p.public_id')) return [[{public_id:'fictional-owner'}]];
  if (sql.startsWith('INSERT INTO crewcheck_telegram_state')) { if (!states.has(args[0])) states.set(args[0],JSON.parse(args[1])); return [{affectedRows:1}]; }
  if (sql.startsWith('SELECT payload')) return [[{payload:states.get(args[0])}]];
  if (sql.startsWith('UPDATE crewcheck_telegram_state')) { states.set(args[1],JSON.parse(args[0])); return [{affectedRows:1}]; }
  if (sql.startsWith('UPDATE crewcheck_platform_bid_windows')) current.open_notified_at=now;
  return [{affectedRows:1}];
} };
db.getConnection=async()=>({query:db.query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
const findLink = async (_db, email) => { assert.equal(email,row.owner_email); return {chatId:'fake-recipient'}; };
assert.deepEqual(await notifyBidRows(db,[row],{now,findLink,send:async()=>({ok:false,uncertain:false})}),[]);
assert.equal(current.open_notified_at,undefined,'explicit rejection cannot acknowledge');
let recipients=[];
const accepted=await notifyBidRows(db,[row],{now,findLink,send:async recipient=>{recipients.push(recipient);return {ok:true}}});
assert.deepEqual(recipients,['fake-recipient']); assert.equal(accepted[0].status,'accepted'); assert.equal(accepted[0].delivered,null);
await notifyBidRows(db,[row],{now,findLink,send:async()=>{throw new Error('duplicate send')}});
assert.equal(recipients.length,1);
await notifyBidRows(db,[row],{now,findLink:async()=>null,send:async()=>{throw new Error('unlinked send')}});
assert.equal(dueKind({ ...row, owner_email: 'another@example.invalid', open_notified_at: now }, now), '');

const calendar = buildBidsCalendar([row], now);
assert.ok(calendar.includes('TRIGGER;RELATED=END:-P1D'));
assert.ok(calendar.includes('DTSTART:20261011T100000Z'));
assert.ok(calendar.includes('DTEND:20261015T200000Z'));
assert.ok(!buildBidsCalendar([{ ...row, notify_open: 0, notify_last_day: 0 }], now).includes('VALARM'));
assert.ok(buildBidsCalendar([{ ...row, title: 'Text\nURL:injected' }], now).includes('Text\\nURL:injected'));
// Synthetic credentials in this disposable test process; fetch is always fake.
process.env.TELEGRAM_BOT_TOKEN = 'fake-token-never-sent';
for (const payload of [{}, { ok: false }, { ok: true }]) {
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  assert.equal((await sendTelegram('fake-recipient', 'fixture')).ok, payload.ok === true);
}
globalThis.fetch = () => { throw new Error('Real network forbidden in this test'); };
console.log('BIDS delivery regression passed: failures/reconnection, expiry, preferences, owner, dedup, timezone and calendar.');
