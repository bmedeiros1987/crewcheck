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

const home = read('client/src/pages/Home.tsx');
const android = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const platform = read('server/platform.mjs');
const server = read('server.mjs');

// One runtime snapshot must feed both the operational cockpit/FlyDeck surface
// and the full roster view. A channel may change the active roster, but once
// loaded the UI cannot source cockpit and roster independently.
assert.match(home, /const \[bundle, setBundle\] = useState<BundleState>\(loadRoster\(\)\);/);
assert.match(home, /const events = useMemo\(\(\) => buildLegs\(bundle\.roster\)/);
assert.match(home, /view === 'cockpit' && <Cockpit events=\{events\}/);
assert.match(home, /view === 'roster' && <Roster roster=\{bundle\.roster\} events=\{events\}/);
assert.match(home, /openActiveRoster\(\)\.then\(active => \{ if \(active\?\.roster\) \{/);
assert.match(home, /setBundle\(\{ roster: active\.roster, compliance: c, source: 'Escala ativa do banco' \}\)/);

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
