import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function pass(label) { console.log(`✓ ${label}`); }
function fail(label, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  console.error(`::error title=Android preflight failed::${label}${suffix}`);
  throw new Error(`[android-preflight] ${label}${suffix}`);
}
function expect(label, condition, detail = '') {
  if (!condition) fail(label, detail);
  pass(label);
}
function contains(label, path, needle, insensitive = false) {
  const source = read(path);
  const ok = insensitive
    ? source.toLocaleLowerCase('pt-BR').includes(String(needle).toLocaleLowerCase('pt-BR'))
    : source.includes(needle);
  expect(label, ok, `${path} não contém ${JSON.stringify(needle)}`);
}
function absent(label, path, needle) {
  const source = read(path);
  expect(label, !source.includes(needle), `${path} ainda contém ${JSON.stringify(needle)}`);
}
function matches(label, path, regex) {
  expect(label, regex.test(read(path)), `${path} não corresponde a ${regex}`);
}
function file(label, path) {
  expect(label, fs.existsSync(path) && fs.statSync(path).size > 0, `arquivo ausente/vazio: ${path}`);
}

const release = JSON.parse(read('client/public/release.json'));
const VERSION = String(process.env.CREWCHECK_VERSION || release.version || '').trim();
const versionParts = VERSION.split('.').map(Number);
const derivedVersionCode = versionParts.length === 3 && versionParts.every(Number.isInteger)
  ? String(versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2])
  : '';
const VERSION_CODE = String(process.env.CREWCHECK_VERSION_CODE || derivedVersionCode).trim();

expect('canonical release', Boolean(VERSION) && String(release.version) === VERSION, `esperado ${VERSION}, obtido ${release.version}`);
expect('canonical version code', Boolean(VERSION_CODE), `não foi possível derivar versionCode de ${VERSION}`);
contains('Android versionName', 'android-wrapper/app/build.gradle', `versionName "${VERSION}"`);
contains('Android versionCode', 'android-wrapper/app/build.gradle', `versionCode ${VERSION_CODE}`);
contains('Android Gradle plugin', 'android-wrapper/build.gradle', "id 'com.android.application' version '8.11.1'");
contains('Kotlin plugin', 'android-wrapper/build.gradle', "id 'org.jetbrains.kotlin.android' version '2.0.21'");
matches('compileSdk 36', 'android-wrapper/app/build.gradle', /compileSdk\s+36/);
contains('Health Connect dependency', 'android-wrapper/app/build.gradle', 'androidx.health.connect:connect-client:1.1.0');
contains('Health Connect manage-data intent', 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', 'HealthConnectClient.getHealthConnectManageDataIntent(activity, HEALTH_CONNECT_PACKAGE)');
contains('Health Connect refreshFromHost', 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', 'fun refreshFromHost()');
contains('MainActivity Health refresh hook', 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', 'healthBridge.refreshFromHost()');
absent('protected Health permissions intent absent', 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', 'android.health.connect.action.MANAGE_HEALTH_PERMISSIONS');

for (const [label, path] of [
  ['Control Center module', 'server/v14316/controlCenter.mjs'],
  ['Telegram location compatibility mirror', 'server/v14316/telegramLocation.mjs'],
  ['Canonical nearby-health helper', 'scripts/v14365/health-nearby.snippet'],
  ['Guardian Center view', 'client/src/components/v14316/GuardianCenterView.tsx'],
  ['Support Center view', 'client/src/components/v14316/SupportCenterView.tsx'],
  ['Admin Control Center', 'client/src/components/v14316/AdminControlCenter.tsx'],
  ['Guardian public page', 'client/src/pages/GuardianPublicPage.tsx'],
  ['Theme runtime', 'client/src/lib/themeRuntime.ts'],
  ['Theme v14.3.17', 'client/src/theme-v14-3-17.css'],
  ['Theme v14.3.19', 'client/src/theme-v14-3-19.css'],
  ['Guardian/support metrics migration', 'migrations/20260723_014_v14316_guardian_support_metrics.sql'],
]) file(label, path);

contains('Control Center AES-256-GCM', 'server/v14316/controlCenter.mjs', 'aes-256-gcm');
contains('Support ticket contract', 'server/v14316/controlCenter.mjs', 'CREWCHECK_SUPPORT_TICKET_V1');
contains('Admin aggregate-only privacy', 'server/v14316/controlCenter.mjs', "privacyMode: 'aggregate-only'");
contains('Places distance ranking', 'scripts/v14365/health-nearby.snippet', "rankPreference: 'DISTANCE'");
contains('Nearby location restriction', 'scripts/v14365/health-nearby.snippet', 'locationRestriction');
contains('Nearby 35 km guard', 'scripts/v14365/health-nearby.snippet', 'filterConciergePlacesByLocationV14335(places, current, 35)');
contains('Telegram location mirror handoff', 'server/v14316/telegramLocation.mjs', 'await saveLegacyLocationMirror(message, Boolean(edited))');
contains('Telegram canonical continuation', 'server/v14316/telegramLocation.mjs', 'return false;');
contains('Life continuous sync marker', 'client/src/components/v1434/CrewCheckLifeView.tsx', 'data-health-sync="continuous"');
contains('Life 60s refresh', 'client/src/components/v1434/CrewCheckLifeView.tsx', 'window.setInterval(refresh, 60_000)');
contains('Smart Departure live location refresh', 'client/src/pages/Home.tsx', 'refreshSmartDepartureLocation');
contains('Visitor real-day filter', 'client/src/pages/VisitorAccessPage.tsx', '.filter(visitorRealDay)');
contains('Concierge layover-aware reply', 'server/v1403/premium-helpers.snippet', 'conciergeLayoverAwareReply');
contains('Founder photo marker', 'client/src/pages/AboutUsPage.tsx', 'CREWCHECK_FOUNDER_PHOTO');
contains('About us pt-BR copy', 'client/src/pages/AboutUsPage.tsx', 'quem constrói o crewcheck', true);
contains('Manual canonical release', 'client/public/manual.html', `CrewCheck v${VERSION}`);
contains('Theme preference order', 'client/src/lib/themeRuntime.ts', "ORDER: CrewCheckThemePreference[] = ['system', 'light', 'dark']");
contains('Automatic appearance label', 'client/src/theme-v14-3-17.css', 'Aparência: Automático');
contains('Theme v14.3.19 import', 'client/src/main.tsx', 'theme-v14-3-19.css');
expect('No malformed comma before @media', !/,[\s]*@media/.test(read('client/src/theme-v14-3-17.css')), 'client/src/theme-v14-3-17.css contém ", @media" inválido');

console.log('[android-preflight] all named checks passed');
