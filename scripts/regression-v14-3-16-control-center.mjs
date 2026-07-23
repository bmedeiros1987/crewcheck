import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.16] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function check(condition, message) {
  if (!condition) throw new Error(`[v14.3.16] ${message}`);
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

check(pkg.version === '14.3.16', `versão esperada 14.3.16; encontrada ${pkg.version}`);
check(gradle.includes('versionName "14.3.16"') && gradle.includes('versionCode 140316'), 'versão Android incorreta.');

check(serverIndex.includes('handleV14316ControlRoute') && serverIndex.includes('handleTelegramLocationAndPlaces'), 'rotas v14.3.16 não integradas ao servidor.');
check(control.includes("'/api/guardian/card'") && control.includes("'/api/support/tickets'") && control.includes("'/api/admin/overview'"), 'Guardian, suporte ou dashboard sem rota.');
check(control.includes('aes-256-gcm') && control.includes('token_hash') && control.includes('expires_at') && control.includes('revoked_at'), 'proteção temporária do Guardian incompleta.');
check(control.includes("privacyMode: 'aggregate-only'") && control.includes('Nenhum nome, e-mail, escala, localização ou dado de saúde'), 'dashboard não declara modo agregado/LGPD.');
check(!admin.includes('requester_email') && !admin.includes('owner_email') && !admin.includes('payload_cipher'), 'dashboard expõe campo individual.');
check(control.includes('CREWCHECK_SUPPORT_TICKET_V1') && control.includes('suporte@crewcheck.com.br'), 'ticket estruturado ou e-mail público ausente.');
check(support.includes('/api/support/tickets') && support.includes('suporte@crewcheck.com.br'), 'interface de suporte incompleta.');

check(app.includes('<Route path="/guardian" component={GuardianPublicPage} />'), 'página pública Guardian sem rota.');
check(home.includes("['guardian','Guardian'") && home.includes("['support','Suporte'"), 'Guardian/Suporte ausentes do menu.');
check(home.includes("view === 'guardian' && <GuardianCenterView") && home.includes("view === 'support' && <SupportCenterView"), 'views Guardian/Suporte não renderizadas.');
check(home.includes('<AdminControlCenter/>'), 'dashboard agregada não integrada ao Admin.');
check(guardian.includes("QRCode.toDataURL") && guardian.includes('/api/guardian/card') && guardian.includes('Revogar'), 'central Guardian incompleta.');
check(guardianPublic.includes('/api/guardian/card?token=') && guardianPublic.includes('SOMENTE LEITURA'), 'página pública Guardian incompleta.');

check(telegram.includes("rankPreference: 'DISTANCE'") && telegram.includes("includedTypes: ['gym']"), 'academias não usam distância real.');
check(telegram.includes('request_location: true') && telegram.includes('edited_message'), 'localização comum/ao vivo não integrada.');
check(telegram.includes('if (edited) return true;'), 'atualização ao vivo não está silenciosa.');
check(telegram.includes('googleMapsUri') && telegram.includes('inline_keyboard'), 'botões do Maps ausentes na lista de academias.');

check(life.includes('window.setInterval(refresh, 60_000)') && life.includes('data-health-sync="continuous"'), 'atualização automática do Life ausente.');
check(life.includes("window.addEventListener('focus', resume)") && life.includes("document.addEventListener('visibilitychange', resume)"), 'retomada do Life incompleta.');
check(bridge.includes('fun refreshFromHost()') && activity.includes('healthBridge.refreshFromHost()'), 'ponte Android não atualiza ao retornar ao app.');

check(home.includes('refreshSmartDepartureLocation') && home.includes('await getCurrentGeoPosition()'), 'Saída Inteligente não solicita localização atual.');
check(home.includes("kind: 'route_calculation'"), 'telemetria agregada de rota ausente.');
check(visitor.includes('.filter(visitorRealDay)') && visitor.includes('visitorDayTitle(day)'), 'portal visitante não filtra programação real.');
check(!visitor.includes("day.type || day.pairingCode || 'Programação'"), 'portal visitante ainda inventa Programação.');
check(read('server/v1403/premium-helpers.snippet').includes('conciergeLayoverAwareReply'), 'pernoite inativo não foi reconhecido pelo Concierge.');

check(about.includes('CREWCHECK_FOUNDER_PHOTO') && about.includes('Quem constrói o CrewCheck'), 'página do fundador sem foto ou identidade correta.');
check(manual.includes('CrewCheck v14.3.16') && manual.includes('id="guardian"') && manual.includes('id="suporte"'), 'manual web não foi atualizado.');
check(fs.existsSync('migrations/20260723_014_v14316_guardian_support_metrics.sql'), 'migração v14.3.16 ausente.');

console.log('CrewCheck v14.3.16 — Guardian, Life, Telegram, visitante, saída, suporte e Admin: OK');
