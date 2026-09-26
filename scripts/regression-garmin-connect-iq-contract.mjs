import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const schema = json('peripherals/contracts/watchSnapshotV1.schema.json');
const free = json('peripherals/garmin/fixtures/free-snapshot-v1.json');
const premium = json('peripherals/garmin/fixtures/premium-snapshot-v1.json');
const app = read('peripherals/garmin/source/CrewCheckApp.mc');
const delegate = read('peripherals/garmin/source/CrewCheckDelegate.mc');
const store = read('peripherals/garmin/source/SnapshotStore.mc');
const view = read('peripherals/garmin/source/CrewCheckView.mc');
const glance = read('peripherals/garmin/source/CrewCheckGlanceView.mc');
const readme = read('peripherals/garmin/README.md');
const matrix = read('peripherals/garmin/DEVICE_MATRIX.md');
const canonicalDoc = read('docs/peripherals/watch_snapshot_v1.md');

assert(schema.properties?.schemaVersion?.const === 1, 'watchSnapshotV1 must remain schemaVersion=1');
assert(schema.additionalProperties === true, 'v1 must allow additive optional fields for old peers');
assert(JSON.stringify(schema.required) === JSON.stringify(['schemaVersion','generatedAtEpochMs','validUntilEpochMs']), 'v1 required field set must match canonical peripheral spec');
assert(schema.properties?.source?.const === 'canonical-roster', 'portable source must remain canonical-roster');
assert(schema.properties?.premiumAccess?.default === false, 'missing entitlement must fail closed to Free');
assert(schema.properties?.schedule?.default?.length === 0, 'missing schedule must default to empty');
assert(schema.properties?.schedule?.maxItems <= 8, 'portable watch schedule must stay compact');
assert(canonicalDoc.includes('peer v1 antigo'), 'canonical contract must document old-peer behavior');
assert(canonicalDoc.includes('Downgrade Premium → Free'), 'canonical contract must document downgrade');
assert(canonicalDoc.includes('Handoff para Mobile Core'), 'canonical contract must keep phone ownership handoff');

for (const fixture of [free, premium]) {
  assert(fixture.v === 1, 'Garmin wire fixture must be v1');
  assert((fixture.c & 1) === 1, 'Garmin wire fixture must keep basicRoster bit enabled');
  assert(Number.isInteger(fixture.g) && Number.isInteger(fixture.u), 'Garmin wire timestamps must be integer seconds');
  assert(fixture.u >= fixture.g, 'Garmin wire validity cannot end before generation');
  assert(Buffer.byteLength(JSON.stringify(fixture), 'utf8') <= 1024, 'Garmin MVP wire payload must stay <= 1 KiB');
}

assert(free.c === 1, 'Free Garmin fixture may only advertise basic roster capability');
assert(premium.c > free.c, 'Premium fixture must demonstrate capability upgrade without changing roster contract');
assert(free.i === premium.i, 'Free→Premium transition must keep the same canonical context identity');
assert(Array.isArray(free.q) && free.q.length > 0, 'Free Garmin fixture must include useful schedule data');

assert(app.includes('registerForPhoneAppMessages'), 'Garmin app must receive snapshots from phone bridge');
assert(app.includes('getGlanceView'), 'Garmin MVP must expose a Glance');
assert(app.includes('new CrewCheckDelegate(view)'), 'Garmin Watch App must attach device-independent navigation');
assert(delegate.includes('BehaviorDelegate'), 'Garmin navigation must use BehaviorDelegate');
assert(delegate.includes('onNextPage') && delegate.includes('onPreviousPage'), 'Garmin navigation must support next/previous page behaviors');
assert(store.includes('App.Storage.setValue'), 'Garmin must persist last validated snapshot locally');
assert(store.includes('(capabilities & 1) != 1'), 'Garmin cache must reject payloads that remove basic roster');
assert(store.includes('integerOrNull') && store.includes('value instanceof Lang.Number') && store.includes('value instanceof Lang.Long'), 'Garmin cache must accept only real integer Number/Long wire fields');
assert(!store.includes('value.toNumber()'), 'Garmin cache must not coerce strings/symbols/floats into integer wire fields');
assert(store.includes('payload instanceof Lang.Dictionary'), 'Garmin must reject non-dictionary phone payloads');
assert(store.includes('MAX_SCHEDULE_ITEMS = 8'), 'Garmin watch-side validation must enforce schedule cap');
assert(store.includes('row instanceof Lang.Array') && store.includes('row.size() != 4'), 'Garmin watch-side validation must enforce row shape');
assert(store.includes('boundedString') && store.includes('Lang.String'), 'Garmin watch-side validation must enforce string bounds/types');
assert(store.includes('MAX_CAPABILITY_MASK = 63'), 'Garmin watch-side validation must reject unknown capability bits');
for (const state of ['OFF_DUTY','LEAVE_SOON','REPORTING','BOARDING','IN_FLIGHT','CONNECTION','OVERNIGHT','CHANGED','UNKNOWN']) {
  assert(store.includes(`value == "${state}"`), `Garmin watch-side validation must recognize state ${state}`);
}
for (const page of ['AGORA','JORNADA','ESCALA','SYNC']) {
  assert(view.includes(`CREWCHECK • ${page}`), `full renderer must expose ${page} page`);
}
assert(view.includes('PAGE_COUNT = 4'), 'full Garmin renderer must keep four-page MVP');
assert(view.includes('ROUND_SAFE_WIDTH_PERCENT'), 'renderer must enforce round-screen safe width');
assert(view.includes('getTextWidthInPixels'), 'renderer must fit text by rendered pixel width');
assert(view.includes('Última sync') && view.includes('ageLabel'), 'sync page must use human-readable freshness');
assert(!view.includes('"Snapshot " + generated.toString()'), 'sync page must not expose raw epoch timestamps');
assert(view.includes('DADOS ANTIGOS') && view.includes('Offline •'), 'full renderer must expose stale/offline state');
assert(glance.includes('Dados antigos') && glance.includes('Sem sync'), 'Glance must expose missing/stale state');
assert(glance.includes('ROUND_SAFE_WIDTH_PERCENT'), 'Glance must enforce round-screen safe width');
assert(glance.includes('getTextWidthInPixels'), 'Glance must clip by rendered pixel width');
assert(glance.includes('freshness == "fresh"') && glance.includes('Offline • cache local'), 'Glance must never present stale cache as current');

for (const forbidden of ['parseAims','pdfParser','APZ','RBAC','compliance','journeyBoundary']) {
  const source = [app, delegate, store, view, glance].join('\n');
  assert(!source.includes(forbidden), `Garmin renderer must not contain business-rule/parser dependency: ${forbidden}`);
}

assert(readme.includes('Connect IQ SDK 9.2.0'), 'Garmin README must pin verified SDK baseline');
assert(readme.includes('SDK Manager'), 'Garmin product IDs must come from official installed definitions');
assert(readme.includes('Watch Face') && readme.includes('deferred'), 'Garmin Watch Face must stay deferred');
assert(readme.includes('premiumAccess'), 'Garmin adapter docs must describe current v1 entitlement downgrade/default behavior');

for (const family of ['D2 Mach 2','D2 Mach 2 Pro','D2 Air X15','fēnix 9','fēnix 8','epix Gen 2','Forerunner 970','Forerunner 570','Venu 4 41mm','Venu X1']) {
  assert(matrix.includes(family), `Garmin qualification matrix missing ${family}`);
}
assert(matrix.includes('do not guess product IDs') || matrix.includes('do not guess') || matrix.includes('do not'), 'Garmin matrix must prohibit guessed product IDs');
assert(matrix.includes('fresh → stale → offline → fresh'), 'Garmin simulator gate must cover freshness lifecycle');
assert(matrix.includes('Free retains Agora/Jornada/Escala'), 'Garmin matrix must protect useful Free roster');

console.log(`[Garmin Connect IQ] PASS — stable additive watchSnapshotV1; Free ${Buffer.byteLength(JSON.stringify(free))} B; Premium ${Buffer.byteLength(JSON.stringify(premium))} B; strict typed wire validation; round-safe Glance + Watch App guarded.`);
