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

const pkg = JSON.parse(read('package.json'));
const serverIndex = read('server/v139/index.mjs');
const control = read('server/v14316/controlCenter.mjs');
const telegram = read('server/v14316/telegramLocation.mjs');
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

check(pkg.version === '14.3.16', `versão preparada é 14.3.16; encontrada ${pkg.version}`);
check(gradle.includes('versionName "14.3.16"') && gradle.includes('versionCode 140316'), 'versão Android preparada é 14.3.16/140316');
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
check(telegram.includes("rankPreference: 'DISTANCE'") && telegram.includes("includedTypes: ['gym']"), 'academias usam distância real');
check(telegram.includes('request_location: true') && telegram.includes('edited_message'), 'Telegram aceita localização comum e ao vivo');
check(telegram.includes('if (edited) return true;'), 'atualização ao vivo do Telegram é silenciosa');
check(telegram.includes('googleMapsUri') && telegram.includes('inline_keyboard'), 'lista de academias possui botões do Maps');
check(life.includes('window.setInterval(refresh, 60_000)') && life.includes('data-health-sync="continuous"'), 'Life possui atualização automática no primeiro plano');
check(life.includes("window.addEventListener('focus', resume)") && life.includes("document.addEventListener('visibilitychange', resume)"), 'Life atualiza ao retomar a tela');
check(bridge.includes('fun refreshFromHost()') && activity.includes('healthBridge.refreshFromHost()'), 'ponte Android atualiza ao retornar ao app');
check(home.includes('refreshSmartDepartureLocation') && home.includes('await getCurrentGeoPosition()'), 'Saída Inteligente solicita localização atual');
check(home.includes("kind: 'route_calculation'"), 'cálculo de rota registra apenas telemetria agregada');
check(visitor.includes('.filter(visitorRealDay)') && visitor.includes('visitorDayTitle(day)'), 'portal visitante filtra programação real');
check(!visitor.includes("day.type || day.pairingCode || 'Programação'"), 'portal visitante não inventa título Programação');
check(read('server/v1403/premium-helpers.snippet').includes('conciergeLayoverAwareReply'), 'Concierge reconhece pernoite inativo/publicado');
check(about.includes('CREWCHECK_FOUNDER_PHOTO') && about.includes('Quem constrói o CrewCheck'), 'página institucional possui foto e seção do fundador');
check(manual.includes('CrewCheck v14.3.16') && manual.includes('id="guardian"') && manual.includes('id="suporte"'), 'manual web contém Guardian e Suporte');
check(fs.existsSync('migrations/20260723_014_v14316_guardian_support_metrics.sql'), 'migração v14.3.16 está presente');

console.log('CrewCheck v14.3.16 — Guardian, Life, Telegram, visitante, saída, suporte e Admin: OK');
