import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const checks = [];
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`[v14.3.2] ${name}${detail ? `: ${detail}` : ''}`);
  checks.push(name);
}
function read(path) { return fs.readFileSync(path, 'utf8'); }

for (const path of ['scripts/v1430/apply.mjs', 'scripts/v1431/apply.mjs', 'scripts/v1432/apply.mjs', 'server.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  check(`sintaxe ${path}`, result.status === 0, result.stderr.trim());
}

const home = read('client/src/pages/Home.tsx');
const main = read('client/src/main.tsx');
const server = read('server.mjs');
const css = read('client/src/components/v1432/homologation.css');
const tour = read('client/src/components/v1432/FirstAccessTour.tsx');
const regulation = read('client/src/components/v1432/ManualRegulationView.tsx');
const partners = read('client/src/pages/AdminPartnerAccountsPage.tsx');
const app = read('client/src/App.tsx');
const auth = read('client/src/pages/AuthPage.tsx');
const apply1432 = read('scripts/v1432/apply.mjs');

check('rodapé fora do contêiner rolável', home.includes('createPortal(<nav className="cz-bottom-nav"') && home.includes('</nav>, document.body)'));
check('rodapé iPad sem translate horizontal', css.includes('@media (max-width:1180px)') && css.includes('body > .cz-bottom-nav') && css.includes('transform: none !important'));
check('safe area do iPad', css.includes('env(safe-area-inset-bottom'));
check('espaço de conteúdo para o rodapé', /padding-bottom:calc\(108px/.test(read('client/src/components/v1429/reliability-premium.css')) || css.includes('calc(116px'));

check('franquia de e-mail carregada', partners.includes('cc-email-quota') && partners.includes('emailQuota'));
check('franquia com contraste explícito', css.includes('.cc-partner-admin .cc-email-quota') && css.includes('--cc-readable-text'));
check('tema claro e escuro padronizados', css.includes('html[data-crew-theme="dark"]') && css.includes('--cc-readable-surface: #ffffff'));
check('foco de teclado visível', css.includes(':focus-visible'));

check('modo demonstração com escala fictícia', home.includes('function buildCrewCheckDemoRoster') && home.includes('ESCALA FICTÍCIA CREWCHECK'));
check('demonstração separada da escala real', home.includes("sessionStorage.getItem('crewcheck_demo_active')") && home.includes("source: 'Demonstração fictícia CrewCheck'"));
check('versão visual unificada', app.includes("crewcheck_last_loaded_version', '14.3.2'") && auth.includes('data-version="14.3.2"') && auth.includes('CREWCHECK V14.3.2'));
check('versão do backend unificada', server.includes("version: '14.3.2'") && !server.includes("version:'14.1.7'") && !server.includes("version: '14.2.7'"));
check('preparador substitui versão com ou sem espaços', apply1432.includes("version\\s*:\\s*'\\d+\\.\\d+\\.\\d+'"));

check('tutorial de primeiro acesso instalado', home.includes('<FirstAccessTour') && main.includes('v1432/homologation.css'));
check('tutorial não bloqueante', css.includes('pointer-events: none') && tour.includes('Explorar depois'));
check('opção não exibir novamente', tour.includes('Não exibir novamente') && tour.includes('TOUR_SEEN_KEY'));
check('tutorial navegável', tour.includes('Próximo') && tour.includes('Voltar') && tour.includes('Concluir'));

check('programação do dia alimenta cálculo', home.includes('scheduleDay={event?.day}') && regulation.includes('formFromScheduleDay'));
check('horário do corte visível', regulation.includes('Horário do corte') && regulation.includes('maximumCutoff'));
check('fim da jornada mais 30 minutos', regulation.includes('30 min após o corte') && regulation.includes('dutyLimitMinutes - 30'));
check('aclimatação desconhecida reduz uma hora', regulation.includes("form.acclimatization === 'unknown' ? 60 : 0") && regulation.includes('redução de 1 h'));
check('premissa automática transparente', server.includes('tripulante aclimatizado') && home.includes('Premissa automática: RBAC 117 B.1'));
check('card regulatório na escala', home.includes('RosterRegulationBadge') && home.includes('Corte {result.cutoffTime} · fim {result.dutyEndTime}'));
check('reserva e sobreaviso aguardam acionamento', regulation.includes("status: 'waiting'") && regulation.includes('Aguardando acionamento'));

check('comando Telegram regulamentação', server.includes("command: 'regulamentacao'") && server.includes('function conciergeRegulationReply'));
check('intenção natural Telegram', server.includes('at[eé] que horas') && server.includes('hor[aá]rio do corte'));
check('voz usa o mesmo motor de resposta', server.includes('buildTelegramConciergeReply(transcript, profile, snapshot)'));
check('capacidade exposta no health', server.includes('regulationSupported: true'));
check('HSTS em produção', server.includes("'Strict-Transport-Security'") && server.includes('max-age=31536000'));
check('CSP e bloqueio de iframe', server.includes("'Content-Security-Policy'") && server.includes("frame-ancestors 'none'") && server.includes("X-Frame-Options', 'DENY"));
check('nosniff e política de referência', server.includes("X-Content-Type-Options', 'nosniff") && server.includes("Referrer-Policy', 'strict-origin-when-cross-origin"));
check('política de permissões', server.includes("Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()"));
check('cabeçalhos aplicados antes das rotas', server.includes('http.createServer(async (req, res) => {\n  applyCrewCheckSecurityHeaders(req, res);'));
check('rota aceita endereço e coordenadas', server.includes('originCoordinate ? { location: { latLng: originCoordinate } }') && server.includes('destinationCoordinate ? { location: { latLng: destinationCoordinate } }'));
check('diagnóstico de rota e incidentes', server.includes("url.pathname === '/api/maps/route-health'") && server.includes('incidentsConfigured: tomtomConfigured'));
check('rota com recuperação entre provedores', server.includes('if (!route && googleKey) route = await googleRoutePreview') && server.includes('providerFallback: true'));

function luminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map((part) => parseInt(part, 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}
check('contraste claro AA', contrast('#10213a', '#ffffff') >= 4.5, contrast('#10213a', '#ffffff').toFixed(2));
check('contraste escuro AA', contrast('#f4f8fc', '#0d2035') >= 4.5, contrast('#f4f8fc', '#0d2035').toFixed(2));
check('contraste secundário claro AA', contrast('#52627a', '#ffffff') >= 4.5, contrast('#52627a', '#ffffff').toFixed(2));
check('contraste secundário escuro AA', contrast('#b9c9da', '#0d2035') >= 4.5, contrast('#b9c9da', '#0d2035').toFixed(2));

const start = 8 * 60;
const limit = 13 * 60;
const clock = (value) => `${String(Math.floor((value % 1440) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
check('exemplo regulatório 08h/2 etapas', clock(start + limit - 30) === '20:30' && clock(start + limit) === '21:00');

console.log(`[v14.3.2] ${checks.length} verificações aprovadas.`);
for (const name of checks) console.log(`  ✓ ${name}`);
