import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.fetch = () => { throw Error('REAL_NETWORK_FORBIDDEN'); };
const { createTelegramFreeAdmission, TELEGRAM_FREE_ADMISSION_LIMITS: limits, TELEGRAM_FREE_ADMISSION_SHIPPING } = await import('../server/telegram-free-admission-off.mjs');
let passed = 0;
async function test(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
function fixture() {
  let mono = 0, wall = 2_000_000, live = true;
  const limiter = createTelegramFreeAdmission({ enabled: true, now: () => mono, wallNow: () => wall });
  const authority = (n = 1, extra = {}) => ({ channel: 'telegram', lane: 'ordinary-read', authorized: true,
    owner: { email: `u${n}@example.invalid`, publicId: `owner${n}` }, actor: { kind: 'owner', id: `actor${n}` },
    isCurrent: () => live, ...extra });
  const evidence = (n = 1, extra = {}) => ({ observedAt: wall,
    profile: { email: `u${n}@example.invalid`, public_id: `owner${n}`, plan: 'free' }, subscription: null, ...extra });
  return { limiter, authority, evidence, setMono: value => { mono = value; }, setWall: value => { wall = value; }, setLive: value => { live = value; } };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const read = async () => 'synthetic';

await test('shipping disabled performs no clock, authority or operation work', async () => {
  assert.equal(TELEGRAM_FREE_ADMISSION_SHIPPING, false);
  const limiter = createTelegramFreeAdmission({ now() { assert.fail(); }, wallNow() { assert.fail(); } });
  assert.equal((await limiter.run(null, () => assert.fail())).reason, 'disabled');
  assert.deepEqual(limiter.statistics(), { owners: 0, inFlight: 0, maxRetainedTimestamps: 0 });
});
await test('configuration is fixed and immutable', async () => {
  assert(Object.isFrozen(limits)); assert.equal(limits.owners, 2_000); assert.equal(limits.minute, 6);
  assert.throws(() => { limits.minute = 99; });
});
await test('invalid identities lanes channels or asynchronous current predicates fail closed', async () => {
  const h = fixture();
  const cases = [null, {}, h.authority(1, { channel: 'whatsapp' }), h.authority(1, { lane: 'medical' }),
    h.authority(1, { authorized: false }), h.authority(1, { owner: { email: 'U1@example.invalid', publicId: 'owner1' } }),
    h.authority(1, { owner: { email: 'u1@example.invalid', publicId: '' } }), h.authority(1, { actor: { kind: 'other', id: 'actor' } }),
    h.authority(1, { isCurrent: async () => true }), h.authority(1, { isCurrent: () => { throw Error('gone'); } })];
  for (const value of cases) assert.equal((await h.limiter.run(value, () => assert.fail())).reason, 'authority_required');
  assert.equal(h.limiter.statistics().owners, 0);
});
await test('three admissions per sliding ten seconds with exact retry boundary', async () => {
  const h = fixture(), a = h.authority();
  for (let i = 0; i < 3; i++) assert((await h.limiter.run(a, read)).allowed);
  let result = await h.limiter.run(a, () => assert.fail()); assert.equal(result.reason, 'cooldown'); assert.equal(result.retryAfterMs, 10_000);
  h.setMono(9_999); result = await h.limiter.run(a, () => assert.fail()); assert.equal(result.retryAfterMs, 1);
  h.setMono(10_000); assert((await h.limiter.run(a, read)).allowed);
});
await test('six admissions per sliding minute without a daily quota', async () => {
  const h = fixture(), a = h.authority();
  for (let batch = 0; batch < 2; batch++) { h.setMono(batch * 10_000); for (let i = 0; i < 3; i++) assert((await h.limiter.run(a, read)).allowed); }
  h.setMono(20_000); assert.equal((await h.limiter.run(a, () => assert.fail())).retryAfterMs, 40_000);
  h.setMono(59_999); assert.equal((await h.limiter.run(a, () => assert.fail())).retryAfterMs, 1);
  h.setMono(60_000); assert((await h.limiter.run(a, read)).allowed);
  h.setMono(86_400_000); assert((await h.limiter.run(a, read)).allowed);
});
await test('sliding windows do not reset at fixed calendar boundaries', async () => {
  const h = fixture(), a = h.authority(); h.setMono(9_999);
  for (let i = 0; i < 3; i++) await h.limiter.run(a, read);
  h.setMono(10_000); assert.equal((await h.limiter.run(a, () => assert.fail())).retryAfterMs, 9_999);
});
await test('owner slot is claimed synchronously and shared across delegates and relinking', async () => {
  const h = fixture(), d = deferred(), a = h.authority(); let calls = 0;
  const running = h.limiter.run(a, () => { calls++; return d.promise; });
  for (const actor of [{ kind: 'owner', id: 'new-link' }, { kind: 'visitor', id: 'family' }, { kind: 'visitor', id: 'colleague' }])
    assert.equal((await h.limiter.run(h.authority(1, { actor }), () => assert.fail())).reason, 'owner_busy');
  assert.equal(calls, 1); d.resolve('done'); await running; assert.equal(h.limiter.statistics().inFlight, 0);
});
await test('two free producers globally per capability with no queue', async () => {
  const h = fixture(), first = deferred(), second = deferred();
  const a = h.limiter.run(h.authority(1), () => first.promise), b = h.limiter.run(h.authority(2), () => second.promise);
  assert.equal((await h.limiter.run(h.authority(3), () => assert.fail())).reason, 'process_busy');
  assert.equal(h.limiter.statistics().owners, 2);
  first.resolve(); await a; assert((await h.limiter.run(h.authority(3), read)).allowed);
  second.resolve(); await b;
});
await test('an external timeout does not release a still-running operation', async () => {
  const h = fixture(), d = deferred(), a = h.authority(); const running = h.limiter.run(a, () => d.promise);
  assert.equal(await Promise.race([running, Promise.resolve('caller-timeout')]), 'caller-timeout');
  h.setMono(120_000); assert.equal((await h.limiter.run(a, () => assert.fail())).reason, 'owner_busy');
  assert.equal(h.limiter.statistics().inFlight, 1); d.resolve(); await running;
  assert((await h.limiter.run(a, read)).allowed);
});
await test('real rejection releases slot but does not refund admitted work', async () => {
  const h = fixture(), a = h.authority(); await assert.rejects(h.limiter.run(a, async () => { throw Error('synthetic_failure'); }), /synthetic_failure/);
  assert.equal(h.limiter.statistics().inFlight, 0);
  await h.limiter.run(a, read); await h.limiter.run(a, read);
  assert.equal((await h.limiter.run(a, () => assert.fail())).reason, 'cooldown');
});
await test('denial notices are bounded per owner and unknown-owner saturation', async () => {
  const h = fixture(), d = deferred(), e = deferred(), a = h.authority();
  const one = h.limiter.run(a, () => d.promise), two = h.limiter.run(h.authority(2), () => e.promise);
  assert.equal((await h.limiter.run(a, read)).noticeAllowed, true);
  assert.equal((await h.limiter.run(a, read)).noticeAllowed, false);
  assert.equal((await h.limiter.run(h.authority(3), read)).noticeAllowed, true);
  for (let i = 4; i < 104; i++) assert.equal((await h.limiter.run(h.authority(i), read)).noticeAllowed, false);
  h.setMono(10_000); assert.equal((await h.limiter.run(a, read)).noticeAllowed, true);
  assert.equal(h.limiter.statistics().owners, 2); d.resolve(); e.resolve(); await Promise.all([one, two]);
});
await test('capacity refuses rather than evicting live windows and idle windows expire', async () => {
  const h = fixture(); for (let i = 0; i < 2_000; i++) assert((await h.limiter.run(h.authority(i), read)).allowed);
  for (let i = 2_000; i < 2_100; i++) assert.equal((await h.limiter.run(h.authority(i), () => assert.fail())).reason, 'capacity');
  assert.deepEqual(h.limiter.statistics(), { owners: 2_000, inFlight: 0, maxRetainedTimestamps: 1 });
  await h.limiter.run(h.authority(0), read); await h.limiter.run(h.authority(0), read);
  assert.equal((await h.limiter.run(h.authority(0), () => assert.fail())).reason, 'cooldown');
  h.setMono(60_000); assert((await h.limiter.run(h.authority(2_001), read)).allowed); assert.equal(h.limiter.statistics().owners, 1);
});
await test('timestamps remain bounded to six under denied flood', async () => {
  const h = fixture(), a = h.authority(); for (let i = 0; i < 3; i++) await h.limiter.run(a, read);
  h.setMono(10_000); for (let i = 0; i < 3; i++) await h.limiter.run(a, read);
  for (let i = 0; i < 1_000; i++) assert.equal((await h.limiter.run(a, () => assert.fail())).allowed, false);
  assert.equal(h.limiter.statistics().maxRetainedTimestamps, 6);
});
await test('failed and reversed clocks cannot reset windows', async () => {
  const h = fixture(), a = h.authority(); h.setMono(100); await h.limiter.run(a, read);
  for (const value of [99, NaN, Infinity, -1]) { h.setMono(value); assert.equal((await h.limiter.run(a, () => assert.fail())).reason, 'clock_unavailable'); }
  h.setMono(101); await h.limiter.run(a, read); await h.limiter.run(a, read);
  assert.equal((await h.limiter.run(a, () => assert.fail())).reason, 'cooldown');
});
await test('revocation before admission and during read drops private result', async () => {
  const h = fixture(), a = h.authority(); h.setLive(false);
  assert.equal((await h.limiter.run(a, () => assert.fail())).reason, 'authority_required');
  h.setLive(true); const d = deferred(), run = h.limiter.run(a, () => d.promise); h.setLive(false); d.resolve('private-result');
  const result = await run; assert.equal(result.reason, 'authority_changed'); assert.equal(Object.hasOwn(result, 'value'), false);
  assert.equal(h.limiter.statistics().inFlight, 0);
});
await test('canonical active paid evidence does not create a new free quota', async () => {
  const h = fixture(); const entitlement = h.evidence(1, { subscription: { email: 'u1@example.invalid', plan: 'premium_monthly', status: 'active', current_period_end: new Date(2_100_000).toISOString() } });
  for (let i = 0; i < 10; i++) { const result = await h.limiter.run(h.authority(1, { entitlement }), read); assert.equal(result.policy, 'paid'); }
  assert.equal(h.limiter.statistics().owners, 0);
});
await test('missing stale future wrong-owner and wrong-subscription evidence remains free', async () => {
  const h = fixture(), paidProfile = { email: 'u1@example.invalid', public_id: 'owner1', plan: 'premium_unlimited' };
  const cases = [undefined, h.evidence(1, { profile: paidProfile, observedAt: 1_970_000 }), h.evidence(1, { profile: paidProfile, observedAt: 2_000_001 }),
    h.evidence(1, { profile: { ...paidProfile, email: 'other@example.invalid' } }), h.evidence(1, { profile: { ...paidProfile, public_id: 'other' } }),
    h.evidence(1, { profile: paidProfile, subscription: { email: 'other@example.invalid', plan: 'premium_monthly', status: 'active' } })];
  for (const entitlement of cases) { const f = fixture(); assert.equal((await f.limiter.run(f.authority(1, { entitlement }), read)).policy, 'free'); }
});
await test('canonical expiration unknown plan and legacy profile cannot fabricate premium', async () => {
  for (const patch of [
    { subscription: { email: 'u1@example.invalid', plan: 'premium_monthly', status: 'active', current_period_end: new Date(2_000_000).toISOString() } },
    { subscription: { email: 'u1@example.invalid', plan: 'partner_admin_paid', status: 'active' } },
    { profile: { email: 'u1@example.invalid', public_id: 'owner1', plan: 'premium_annual' } },
  ]) { const h = fixture(); assert.equal((await h.limiter.run(h.authority(1, { entitlement: h.evidence(1, patch) }), read)).policy, 'free'); }
});
await test('medical keyword is not a bypass and medical lane is not this capability', async () => {
  const h = fixture(), a = h.authority(1, { text: '/emergencia', callbackData: 'cc_emergency_forged' });
  for (let i = 0; i < 3; i++) await h.limiter.run(a, read);
  assert.equal((await h.limiter.run(a, () => assert.fail())).reason, 'cooldown');
  const before = h.limiter.statistics(); assert.equal((await h.limiter.run(h.authority(1, { lane: 'medical' }), () => assert.fail())).reason, 'authority_required');
  assert.deepEqual(h.limiter.statistics(), before);
  // Shipping dispatcher is intentionally unchanged; this does not simulate or
  // certify the medical handler, its DB or its delivery path.
});
await test('no response cache and no quota bypass on actor changes', async () => {
  const h = fixture(); let calls = 0;
  for (const actor of [{ kind: 'owner', id: 'owner' }, { kind: 'visitor', id: 'family' }, { kind: 'visitor', id: 'colleague' }]) {
    const result = await h.limiter.run(h.authority(1, { actor }), async () => ++calls); assert.equal(result.value, calls);
  }
  assert.equal((await h.limiter.run(h.authority(1, { actor: { kind: 'visitor', id: 'new-delegate' } }), () => assert.fail())).reason, 'cooldown');
  assert.equal((await h.limiter.run(h.authority(2), read)).allowed, true);
});
await test('civil clock rollback cannot resurrect expired paid evidence', async () => {
  const h = fixture(); const entitlement = h.evidence(1, { subscription: { email: 'u1@example.invalid', plan: 'premium_monthly', status: 'active', current_period_end: new Date(2_020_000).toISOString() } });
  const a = h.authority(1, { entitlement }); assert.equal((await h.limiter.run(a, read)).policy, 'paid');
  h.setWall(2_040_000); h.setMono(10_000); assert.equal((await h.limiter.run(a, read)).policy, 'free');
  h.setWall(2_001_000); h.setMono(20_000); assert.equal((await h.limiter.run(a, read)).policy, 'free');
});
await test('rejecting asynchronous authority predicates cannot create unhandled rejections', async () => {
  const h = fixture();
  assert.equal((await h.limiter.run(h.authority(1, { isCurrent: async () => { throw Error('synthetic_async'); } }), () => assert.fail())).reason, 'authority_required');
  let calls = 0;
  assert.equal((await h.limiter.run(h.authority(1, { isCurrent: () => ++calls === 1 ? true : Promise.reject(Error('synthetic_late_async')) }), read)).reason, 'authority_changed');
  await new Promise(setImmediate); // Node fails this process if either rejection is unhandled.
});
await test('known-owner denial flood shares an aggregate three-per-ten-second notice budget', async () => {
  const h = fixture(); for (let n = 1; n <= 2_000; n++) await h.limiter.run(h.authority(n), read);
  const d = deferred(), e = deferred(), first = h.limiter.run(h.authority(1), () => d.promise), second = h.limiter.run(h.authority(2), () => e.promise);
  let notices = 0;
  for (let n = 1; n <= 2_000; n++) notices += Number((await h.limiter.run(h.authority(n), () => assert.fail())).noticeAllowed);
  assert.equal(notices, 3); assert.equal((await h.limiter.run(h.authority(2_001), () => assert.fail())).noticeAllowed, false);
  h.setMono(10_000); assert.equal((await h.limiter.run(h.authority(1), () => assert.fail())).noticeAllowed, true);
  d.resolve(); e.resolve(); await Promise.all([first, second]);
});
await test('huge finite clock faults cannot erase windows by numeric rounding', async () => {
  const h = fixture(); h.setMono(Number.MAX_VALUE);
  for (let n = 0; n < 10; n++) assert.equal((await h.limiter.run(h.authority(), () => assert.fail())).reason, 'clock_unavailable');
  assert.equal(h.limiter.statistics().owners, 0);
});
await test('source imports one canonical pure resolver and no transport database or environment', async () => {
  const source = fs.readFileSync(new URL('../server/telegram-free-admission-off.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ resolvePlatformEntitlement \} from '.\/platform-entitlement\.mjs'/);
  assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|\.query\s*\(|setTimeout\s*\(|setInterval\s*\(/);
  assert.doesNotMatch(source, /premium\|unlimited\|partner\|admin/);
});
console.log(`${passed} groups PASS; synthetic only; no production wiring, SQL or network`);
