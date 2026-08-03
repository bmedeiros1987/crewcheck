import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[p0-multichannel] arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function run(script) {
  console.log(`[p0-multichannel] running ${script}`);
  execFileSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
}
function nearby(source, anchor, span = 1800) {
  const index = source.indexOf(anchor);
  assert.ok(index >= 0, `[p0-multichannel] âncora ausente: ${anchor}`);
  return source.slice(index, index + span);
}
function expectAll(label, source, needles) {
  for (const needle of needles) {
    assert.ok(source.includes(needle), `[p0-multichannel] ${label}: ausente ${needle}`);
  }
}

const home = read('client/src/pages/Home.tsx');
const android = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const platform = read('server/platform.mjs');
const server = read('server.mjs');

// One runtime snapshot must feed both the operational cockpit/FlyDeck surface
// and the full roster view. Assert semantics inside each render/action block,
// without coupling the gate to JSX attribute order or formatting.
assert.match(home, /const \[bundle, setBundle\] = useState<BundleState>\(loadRoster\(\)\);/);
assert.match(home, /const events = useMemo\(\(\) => buildLegs\(bundle\.roster\)/);

const cockpitRender = nearby(home, "view === 'cockpit'", 900);
expectAll('Cockpit deve usar events do bundle ativo', cockpitRender, ['<Cockpit', 'events={events}']);

const rosterRender = nearby(home, "view === 'roster'", 900);
expectAll('Escala deve usar o mesmo bundle/events do Cockpit', rosterRender, ['<Roster', 'roster={bundle.roster}', 'events={events}']);

const openActiveAction = nearby(home, 'openActive: () =>', 1800);
expectAll('abrir escala ativa deve substituir o bundle compartilhado', openActiveAction, [
  'openActiveRoster()',
  'active?.roster',
  'setBundle({ roster: active.roster',
]);

// Android ACTION_SEND must enter the exact same handleFile pipeline as PWA.
assert.match(home, /window\.addEventListener\('crewcheck:native-pdf'/);
assert.match(home, /await handleFile\(\{ target: \{ files: \[file\] \} \}/);
assert.match(android, /acknowledgeSharedPdf/);

// Telegram must parse, then persist only a linked account through the same
// canonical active-roster transaction used by the client/server API.
assert.match(server, /parsePdfOnServer/);
assert.match(server, /profile\.linked\s*\?\s*await syncLinkedTelegramRoster/);
assert.match(platform, /export async function syncLinkedTelegramRoster/);
assert.match(platform, /const synced = await syncRosterForContext/);
assert.match(platform, /saveRosterMysql\(context/);
assert.match(platform, /ACTIVE_ROSTER_INVARIANT/);

// Run the durable channel-specific gates. These protect the exact reported
// 01/08 FOR-PHB -> PHB-FOR -> FOR-CGH sequence and identity/persistence rules.
for (const script of [
  'scripts/regression-v14-3-68-android-share-import.mjs',
  'scripts/regression-v14-3-74-for-cgh.mjs',
  'scripts/regression-v14-3-75-telegram-roster-parity.mjs',
  'scripts/regression-v14-3-76-telegram-platform-roster-sync.mjs',
  'scripts/regression-active-roster-runtime.mjs',
  'scripts/regression-v14-3-72-roster-fingerprint-parity.mjs',
  'scripts/regression-p0-active-roster-server.mjs',
]) run(script);

console.log('[p0-multichannel] GREEN — PWA/APK share path, Telegram parser/persistence, active identity and Cockpit/Escala snapshot are protected by one release gate.');
