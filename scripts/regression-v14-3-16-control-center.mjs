import fs from 'node:fs';
import path from 'node:path';

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14.3.16] Arquivo ausente: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}
function persist(message) {
  const runnerTemp = String(process.env.RUNNER_TEMP || '').trim();
  if (!runnerTemp) return;
  try { fs.appendFileSync(path.join(runnerTemp, 'typescript.log'), `\n${message}\n`, 'utf8'); } catch {}
  try { fs.writeFileSync(path.join(runnerTemp, 'control-center-regression.log'), `${message}\n`, 'utf8'); } catch {}
}
function check(condition, message) {
  if (condition) { console.log(`✓ ${message}`); return; }
  const error = `[v14.3.16] ${message}`;
  persist(error);
  throw new Error(error);
}
function versionAtLeast(value, minimum) {
  const current = String(value || '').split('.').map((item) => Number(item) || 0);
  const floor = String(minimum || '').split('.').map((item) => Number(item) || 0);
  for (let index = 0; index < Math.max(current.length, floor.length); index += 1) {
    if ((current[index] || 0) > (floor[index] || 0)) return true;
    if ((current[index] || 0) < (floor[index] || 0)) return false;
  }
  return true;
}

const pkg = JSON.parse(read('package.json'));
const serverIndex = read('server/v139/index.mjs');
const control = read('server/v14316/controlCenter.mjs');
const telegram = read('server/v14316/telegramLocation.mjs');
const canonicalGym = read('scripts/v14335/gyms-reply.snippet');
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
const bridge = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const gradle = read('android-wrapper/app/build.gradle');
const androidVersion = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1] || '';
const androidCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] || 0);

check(versionAtLeast(pkg.version, '14.3.16'), `versão preparada é 14.3.16 ou posterior; encontrada ${pkg.version}`);
check(versionAtLeast(androidVersion, '14.3.16') && androidCode >= 140316, `versão Android é 14.3.16/140316 ou posterior; encontrada ${androidVersion}/${androidCode}`);
check(serverIndex.includes('handleV14316ControlRoute') && serverIndex.includes('handleTelegramLocationAndPlaces'), 'rotas v14.3.16 estão integradas ao servidor');
check(control.includes("'/api/guardian/card'") && control.includes("'/api/support/tickets'") && control.includes("'/api/admin/overview'"), 'Guardian, suporte e dashboard possuem rotas');
check(control.includes('aes-256-gcm') && control.includes('token_hash') && control.includes('expires_at') && control.includes('revoked_at'), 'Guardian possui criptografia, token, expiração e revogação');
check(control.includes("privacyMode: 'aggregate-only'") && control.includes('Nenhum nome, e-mail, escala, localização ou dado de saúde'), 'dashboard declara modo agregado/LGPD');
check(!admin.includes('requester_email') && !admin.includes('owner_email') && !admin.includes('payload_cipher'), 'dashboard não contém campos individuais do banco');
check(control.includes('CREWCHECK_SUPPORT_TICKET_V1') && control.includes('suporte@crewcheck.com.br'), 'ticket estruturado e e-mail público estão presentes');
check(support.includes('/api/support/tickets') && support.includes('suporte@crewcheck.com.br'), 'interface de suporte usa ticket e alias público');
check(app.includes('<Route path="/guardian" component={GuardianPublicPage} />'), 'página pública Guardian possui rota');
check(home.includes("['guardian','Guardian'") && home.includes("['support','Suporte'"), 'Guardian e Suporte estão no menu');
check(home.includes("view === 'guardian' && <GuardianCenterView") && home.includes("view === 'support' && <SupportCenterView"), 'views Guardian e Suporte renderizam');
check(home.includes('<AdminControlCenter/>'), 'dashboard agregada está integrada ao Admin');
check(guardian.includes('QRCode.toDataURL') && guardian.includes('/api/guardian/card') && guardian.includes('Revogar'), 'central Guardian gera, testa e revoga QR');
check(guardianPublic.includes('/api/guardian/card?token=') && guardianPublic.includes('SOMENTE LEITURA'), 'página Guardian pública é somente leitura');
check(telegram.includes('compatibilityMirror: true') && telegram.includes('return false;'), 'handler legado libera localização para o resolvedor canônico');
check(telegram.includes('update?.edited_message') && telegram.includes('saveLegacyLocationMirror'), 'espelho legado aceita localização comum e ao vivo sem decidir consumo');
check(!telegram.includes('asksForGyms') && !telegram.includes('nearbyGyms') && !telegram.includes('rankPreference'), 'handler legado não contém busca de academias');
check(canonicalGym.includes('conciergeLocationContextV14335') && canonicalGym.includes('conciergeSearchPlaces') && canonicalGym.includes('locationState.location'), 'academias usam localização canônica e busca por proximidade');
check(canonicalGym.includes('conciergePlaceLines(places)'), 'lista de academias usa apresentação canônica de locais');
check(life.includes('window.setInterval(refresh, 60_000)') && life.includes('data-health-sync="continuous"'), 'Life possui atualização automática no primeiro plano');
check(life.includes("window.addEventListener('focus', resume)") && life.includes("document.addEventListener('visibilitychange', resume)"), 'Life atualiza ao retomar a tela');
check(bridge.includes('fun refreshFromHost()') && activity.includes('healthBridge.refreshFromHost()'), 'ponte Android atualiza ao retornar ao app');
check(home.includes('refreshSmartDepartureLocation') && home.includes('await getCurrentGeoPosition()'), 'Saída Inteligente solicita localização atual');
check(home.includes("kind: 'route_calculation'"), 'cálculo de rota registra apenas telemetria agregada');
check(visitor.includes('.filter(visitorRealDay)') && visitor.includes('visitorDayTitle(day)'), 'portal visitante filtra programação real');
check(!visitor.includes("day.type || day.pairingCode || 'Programação'"), 'portal visitante não inventa título Programação');
check(read('server/v1403/premium-helpers.snippet').includes('conciergeLayoverAwareReply'), 'Concierge reconhece pernoite inativo/publicado');
check(about.includes('CREWCHECK_FOUNDER_PHOTO') && /quem constrói o crewcheck/i.test(about), 'página institucional possui foto e seção do fundador');
check(manual.includes('id="guardian"') && manual.includes('id="suporte"'), 'manual web contém Guardian e Suporte');
check(fs.existsSync('migrations/20260723_014_v14316_guardian_support_metrics.sql'), 'migração v14.3.16 está presente');

console.log(`CrewCheck ${pkg.version} — recursos do Control Center 14.3.16 preservados: OK`);
