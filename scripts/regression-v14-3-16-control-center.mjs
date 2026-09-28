import fs from 'node:fs';

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14.3.16] Arquivo ausente: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}
function check(condition, message) {
  if (condition) return console.log(`✓ ${message}`);
  throw new Error(`[v14.3.16] ${message}`);
}
function versionAtLeast(value, minimum) {
  const current = String(value || '').split('.').map(Number);
  const floor = String(minimum || '').split('.').map(Number);
  for (let i = 0; i < Math.max(current.length, floor.length); i += 1) {
    if ((current[i] || 0) !== (floor[i] || 0)) return (current[i] || 0) > (floor[i] || 0);
  }
  return true;
}

const pkg = JSON.parse(read('package.json'));
const serverIndex = read('server/v139/index.mjs');
const control = read('server/v14316/controlCenter.mjs');
const telegramLegacy = read('server/v14316/telegramLocation.mjs');
const locationPolicy = read('server/v14335/concierge-location.mjs');
const locationHandler = read('scripts/v14335/location-handler.snippet');
const gyms = read('scripts/v14335/gyms-reply.snippet');
const app = read('client/src/App.tsx');
const home = read('client/src/pages/Home.tsx');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const visitor = read('client/src/pages/VisitorAccessPage.tsx');
const guardian = read('client/src/components/v14316/GuardianCenterView.tsx');
const guardianPublic = read('client/src/pages/GuardianPublicPage.tsx');
const support = read('client/src/components/v14316/SupportCenterView.tsx');
const admin = read('client/src/components/v14316/AdminControlCenter.tsx');
const about = read('client/src/pages/AboutUsPage.tsx');
const manual = read('client/public/manual.html');
const gradle = read('android-wrapper/app/build.gradle');
const androidVersion = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1] || '';
const androidCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] || 0);

check(versionAtLeast(pkg.version, '14.3.16'), `versão preparada é 14.3.16 ou posterior; encontrada ${pkg.version}`);
check(versionAtLeast(androidVersion, '14.3.16') && androidCode >= 140316, `versão Android válida; encontrada ${androidVersion}/${androidCode}`);
check(serverIndex.includes('handleV14316ControlRoute') && serverIndex.includes('handleTelegramLocationAndPlaces'), 'rotas do Control Center estão integradas');
check(control.includes("'/api/guardian/card'") && control.includes("'/api/support/tickets'") && control.includes("'/api/admin/overview'"), 'Guardian, suporte e Admin possuem rotas');
check(control.includes('aes-256-gcm') && control.includes('token_hash') && control.includes('expires_at') && control.includes('revoked_at'), 'Guardian preserva segurança e revogação');
check(!admin.includes('requester_email') && !admin.includes('owner_email') && !admin.includes('payload_cipher'), 'Admin não expõe campos individuais');
check(app.includes('<Route path="/guardian" component={GuardianPublicPage} />'), 'rota pública Guardian existe');
check(home.includes("view === 'guardian' && <GuardianCenterView") && home.includes("view === 'support' && <SupportCenterView"), 'views Guardian e Suporte renderizam');
check(guardian.includes('QRCode.toDataURL') && guardian.includes('/api/guardian/card') && guardian.includes('Revogar'), 'Guardian gera e revoga QR');
check(guardianPublic.includes('/api/guardian/card?token=') && guardianPublic.includes('SOMENTE LEITURA'), 'Guardian público é somente leitura');
check(support.includes('/api/support/tickets') && support.includes('suporte@crewcheck.com.br'), 'suporte usa ticket e alias público');
check(locationPolicy.includes('filterConciergePlacesByLocation') && locationPolicy.includes('CONCIERGE_LOCATION_TTL_MS'), 'distância e validade usam política canônica');
check(gyms.includes('conciergeLocationContextV14335') && gyms.includes('locationState.location') && gyms.includes('conciergeSearchPlaces'), 'academias usam localização canônica e distância real');
check(locationHandler.includes("source: 'telegram'") && locationHandler.includes('conciergeSaveSnapshotAsync') && locationHandler.includes('silent'), 'Telegram salva posição canônica e aceita atualização silenciosa');
check(telegramLegacy.includes('compatibilityMirror: true') && telegramLegacy.includes('return false;'), 'handler legado não intercepta Academias');
check(life.includes('window.setInterval(refresh, 60_000)') && life.includes('visibilitychange'), 'Life mantém atualização automática');
check(home.includes('refreshSmartDepartureLocation') && home.includes('await getCurrentGeoPosition()'), 'Saída Inteligente solicita localização atual');
check(visitor.includes('.filter(visitorRealDay)') && visitor.includes('visitorDayTitle(day)'), 'portal visitante filtra programação real');
check(about.includes('CREWCHECK_FOUNDER_PHOTO') && /quem constrói o crewcheck/i.test(about), 'página institucional preservada');
check(manual.includes('id="guardian"') && manual.includes('id="suporte"'), 'manual contém Guardian e Suporte');
check(fs.existsSync('migrations/20260723_014_v14316_guardian_support_metrics.sql'), 'migração do Control Center está presente');

console.log(`CrewCheck ${pkg.version} — Control Center e localização canônica: OK`);
