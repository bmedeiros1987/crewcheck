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

// One canonical operational snapshot still feeds Cockpit and every operational
// consumer. The Escala UI may expand only its visual calendar window with adjacent
// saved competences; that visual window must never become the operational bundle.
assert.match(home, /const \[bundle, setBundle\] = useState<BundleState>\(loadRoster\(\)\);/);
assert.match(home, /const events = useMemo\(\(\) => buildLegs\(bundle\.roster\)/);
assert.match(home, /const \[rosterWindow, setRosterWindow\] = useState<CrewRoster>/);
assert.match(home, /const rosterEvents = useMemo\(\(\) => buildLegs\(rosterWindow\)/);
assert.match(home, /openRosterDisplayWindow\(primary\)/);

const cockpitRender = nearby(home, "{view === 'cockpit' && <Cockpit", 900);
const cockpitTag = cockpitRender.match(/<Cockpit[\s\S]*?\/>/)?.[0] || '';
expectAll('Cockpit deve usar apenas events do bundle operacional ativo', cockpitTag, ['<Cockpit', 'events={events}']);
assert.ok(!cockpitTag.includes('rosterEvents'), '[p0-multichannel] Cockpit não pode consumir a janela visual multi-competência');

if (home.includes("{view === 'roster' && <RosterLaunchView")) {
  const rosterRender = nearby(home, "{view === 'roster' && <RosterLaunchView", 900);
  expectAll('Escala deve usar janela visual, mantendo finanças na competência operacional ativa', rosterRender, [
    '<RosterLaunchView',
    'events={rosterEvents}',
    'finance={financeSnapshot(bundle.roster)}',
  ]);
} else {
  throw new Error('[p0-multichannel] RosterLaunchView canônica ausente');
}

const openActiveAction = nearby(home, 'openActive: () => { openActiveRoster()', 1800);
expectAll('abrir escala ativa deve continuar substituindo somente o bundle operacional compartilhado', openActiveAction, [
  'openActiveRoster()',
  'active?.roster',
  'setBundle({ roster: active.roster',
]);

// Android ACTION_SEND and PWA share_target must enter the exact same canonical
// processRosterFile(File) pipeline. ACK is allowed only after that pipeline returns success.
assert.match(home, /window\.addEventListener\('crewcheck:native-pdf'/);
assert.match(home, /claimPendingPwaSharedPdf\(\)/);
assert.match(home, /const imported = await processRosterFile\(file\);/);
assert.match(home, /await importSharedPdfFile\(claim\.file/);
assert.match(home, /const imported = await processRosterFile\(file\);/);
assert.match(android, /SharedPdfInbox\.capture/);
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
  'scripts/regression-p0-pwa-share-target-pdf.mjs',
  'scripts/regression-v14-3-74-for-cgh.mjs',
  'scripts/regression-v14-3-75-telegram-roster-parity.mjs',
  'scripts/regression-v14-3-76-telegram-platform-roster-sync.mjs',
  'scripts/regression-active-roster-runtime.mjs',
  'scripts/regression-v14-3-72-roster-fingerprint-parity.mjs',
  'scripts/regression-p0-active-roster-server.mjs',
]) run(script);

console.log('[p0-multichannel] GREEN — Cockpit permanece operacional-canônico; Escala pode reter competências adjacentes apenas na camada visual.');