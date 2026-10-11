import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { buildMyCrewCareObservedAsset } from './build-mycrewcare-observed-asset.mjs';
import { createMyCrewCarePersistentSession } from '../shared/myCrewCarePersistentSession.mjs';
import { decodeMyCrewCareObservedNativePage } from '../shared/myCrewCareNativeAdapter.mjs';
const { JSDOM } = createRequire(process.env.WAKEUP_JSDOM_PACKAGE ?? import.meta.url)('jsdom');
const scope = { accountId: 'synthetic-A', sessionId: 'session-A', requestId: 'request-A', generation: 1,
  employeeId: '900000001', username: 'synthetic.crew@example.invalid' };
const fixture = name => readFileSync(new URL(`./fixtures/mycrewcare-observed/${name}.synthetic.html`, import.meta.url), 'utf8');
const asset = readFileSync(new URL('../android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js', import.meta.url), 'utf8');
const origin = 'https://api2.apicrewcare.com/LATAM/';
function extract(kind, card, html) {
  const name = kind.startsWith('profile') ? 'profile' : kind === 'cards' ? 'mytravel' : 'reservation';
  const url = origin + (name === 'profile' ? 'userprofile.aspx' : name === 'mytravel' ? 'mytravel.aspx' : 'reservation.aspx?tripreservid=900000001&dutyperiodnumber=1');
  const window = new JSDOM(html ?? fixture(name), { url }).window;
  const request = { kind, scope, card };
  const raw = vm.runInNewContext(asset, { document: window.document, location: window.location, URL, Date, console })(
    { schemaVersion: 3, operationalImportAllowed: false, ...request });
  return { raw, request, url, value: decodeMyCrewCareObservedNativePage(raw, request, url) };
}
test('native asset is generated from reviewed decoder; only minimized time-only observations', () => {
  assert.equal(asset, buildMyCrewCareObservedAsset(readFileSync(new URL('../shared/myCrewCareObservedContract.mjs', import.meta.url), 'utf8')));
  assert.equal(extract('profile-before').value.rows[0].employeeId, scope.employeeId);
  const card = extract('cards').value.rows[0];
  const detail = extract('detail', card).value;
  assert.equal(detail.operationalImportAllowed, false);
  assert.equal(detail.rows[0].confirmationRaw, 'Planned');
  assert.equal(detail.rows[0].toAirportPickupWallTime, '07:05');
  for (const key of ['date', 'timeZone', 'presentationAt', 'html', 'cookies', 'credentials']) assert.equal(key in detail.rows[0], false);
  assert.equal(extract('detail', card, fixture('reservation').replace('Confirmation: Planned', 'Confirmation: Awaiting allocation')).value.rows[0].confirmationRaw, 'Awaiting allocation');
});
test('bridge decoder rejects extra fields, mismatched metadata/origin and non-authoritative empty', () => {
  const { raw, request, url } = extract('cards');
  for (const patch of [{ generation: 2 }, { sessionId: 'OTHER' }, { accountId: 'OTHER' }, { requestId: 'OTHER' },
    { operationalImportAllowed: true }, { html: 'forbidden' }, { rows: [] }]) assert.throws(() => decodeMyCrewCareObservedNativePage(JSON.stringify({ ...JSON.parse(raw), ...patch }), request, url));
  assert.throws(() => decodeMyCrewCareObservedNativePage(raw, request, 'https://evil.invalid/LATAM/mytravel.aspx'));
});
test('actual native Java boundary compiles and passes offline callback/timeout/identity matrix', () => {
  const root = mkdtempSync(join(tmpdir(), 'mycrewcare-java-'));
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : '/usr/lib/jvm/java-21-openjdk-amd64/bin/java';
  try {
    const stubs = {
      'android/app/Activity.java': 'package android.app; public class Activity {}',
      'android/webkit/WebView.java': 'package android.webkit; public class WebView {}',
      'android/widget/FrameLayout.java': 'package android.widget; public class FrameLayout {}',
      'com/crewcheck/app/CrewCheckMyCrewCareProfile.java': 'package com.crewcheck.app; public class CrewCheckMyCrewCareProfile { public interface CleanupCallback {void onComplete(boolean success,String code);} public static int clearCalls; public static RuntimeException clearError; public static boolean defer; public static final java.util.List<CleanupCallback> pending=new java.util.ArrayList<>(); public void clear(android.app.Activity a,String id,CleanupCallback cb){clearCalls++;if(clearError!=null) throw clearError;if(defer) pending.add(cb);else cb.onComplete(true,"ok");} }',
      'com/crewcheck/app/CrewCheckMyCrewCareSecureStore.java': 'package com.crewcheck.app; public class CrewCheckMyCrewCareSecureStore {public CrewCheckMyCrewCareSecureStore(android.app.Activity a){} public static int clearCalls;public static RuntimeException clearError;public boolean clear(String a){clearCalls++;if(clearError!=null)throw clearError;return true;} public String load(String a){return null;} public boolean save(String a,String p){return true;}}',
    };
    const files = [];
    for (const [name, source] of Object.entries(stubs)) { const path = join(root, name); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, source); files.push(path); }
    for (const name of ['CrewCheckMyCrewCarePortalV3', 'CrewCheckMyCrewCareRuntimeV3']) files.push(new URL(`../android-wrapper/app/src/main/java/com/crewcheck/app/${name}.java`, import.meta.url).pathname);
    files.push(new URL('./fixtures/mycrewcare-native/ObservedAcquisitionHarness.java', import.meta.url).pathname);
    execFileSync(java, ['com.sun.tools.javac.Main', '-source', '17', '-target', '17', '-d', root, ...files], { encoding: 'utf8' });
    const result = execFileSync(java, ['-cp', root, 'ObservedAcquisitionHarness'], { encoding: 'utf8' });
    assert.match(result, /PASS native observed acquisition cases=68/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('extraction never reads credentials/hidden state and observation envelopes cannot seed operational cache', async () => {
  const html = fixture('profile').replace('</body>', '<input type="password" value="SYNTHETIC_SECRET"><input type="hidden" value="SYNTHETIC_HIDDEN"></body>');
  const profile = extract('profile-before', undefined, html);
  assert.equal(profile.raw.includes('SYNTHETIC_SECRET'), false);
  assert.equal(profile.raw.includes('SYNTHETIC_HIDDEN'), false);
  const native = extract('detail', extract('cards').value.rows[0]).value;
  const context = { accountId: scope.accountId, rosterId: 'synthetic-roster', rosterRevision: 'revision', providerSubject: 'synthetic-subject' };
  const stay = { ...context, id: 'stay', rosterEventId: 'event', rosterEventKind: 'stay', source: 'persisted-platform-stay', localOnly: false,
    airport: 'AAA', pairingId: 'SYNTHETIC-PAIRING-001', hotelName: null, timeZone: 'UTC', startAt: '2031-11-19T22:00:00Z', endAt: '2031-11-20T08:00:00Z' };
  let writes = 0;
  const session = createMyCrewCarePersistentSession({ adapter: { read: async request => ({ ...native, requestId: request.requestId }) },
    storage: { read: () => null, write: () => { writes++; }, clear: () => {} }, now: () => Date.parse('2031-11-19T20:00:00Z') });
  session.setContext(context, [stay]); session.setAutomatic(true);
  assert.equal(await session.sync(), false);
  assert.equal(writes, 0);
  assert.equal(session.hotel('stay'), null);
});
