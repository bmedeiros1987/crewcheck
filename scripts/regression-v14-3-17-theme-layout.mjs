import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[theme-layout] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function check(value, message) {
  if (!value) throw new Error(`[theme-layout] ${message}`);
  console.log(`✓ ${message}`);
}
function versionTuple(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}
function atLeast(value, minimum) {
  const current = versionTuple(value);
  const floor = versionTuple(minimum);
  if (!current || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > floor[index]) return true;
    if (current[index] < floor[index]) return false;
  }
  return true;
}

const pkg = JSON.parse(read('package.json'));
const runtime = read('client/src/lib/themeRuntime.ts');
const baseCss = read('client/src/theme-v14-3-17.css');
const designedCss = read('client/src/theme-v14-3-18.css');
const main = read('client/src/main.tsx');
const drawer = read('client/src/components/premium/SideDrawer.tsx');
const about = read('client/src/pages/AboutUsPage.tsx');
const gradle = read('android-wrapper/app/build.gradle');

check(atLeast(pkg.version, '14.3.17'), `package em versão compatível (${pkg.version})`);
check(gradle.includes(`versionName "${pkg.version}"`), `Android sincronizado com package.json (${pkg.version})`);
check(/versionCode\s+\d+/.test(gradle), 'Android possui versionCode válido');
check(main.includes("import './lib/themeRuntime';") && main.includes('import "./theme-v14-3-17.css";') && main.includes('import "./theme-v14-3-18.css";'), 'camadas de tema carregadas na ordem correta');
check(runtime.includes("type CrewCheckThemePreference = 'system' | 'light' | 'dark'"), 'preferência automática, clara e escura');
check(runtime.includes('cycleCrewCheckTheme') && runtime.includes("ORDER: CrewCheckThemePreference[] = ['system', 'light', 'dark']"), 'controle triestado');
check(runtime.includes("document.addEventListener('click'") && runtime.includes("closest?.('.cc-theme-row')"), 'seletor do menu conectado ao runtime');
check(baseCss.includes('--cc-bottom-safe:calc(112px'), 'área segura do menu inferior');
check(designedCss.includes('html[data-crewcheck-theme="dark"]') && designedCss.includes('html[data-crewcheck-theme="light"]'), 'paletas clara e escura possuem definições próprias');
check(designedCss.includes('--cc-page-bg:#07111f') && designedCss.includes('--cc-page-bg:#edf4f8'), 'fundos foram projetados separadamente');
check(designedCss.includes('linear-gradient(135deg,#102b48') && designedCss.includes('linear-gradient(135deg,#ffffff'), 'heros possuem composição específica por tema');
check(designedCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'grade de tablet consistente');
check(!/filter\s*:\s*invert|backdrop-filter\s*:\s*invert/i.test(designedCss), 'tema não usa negativo ou inversão de cores');
check(!/,[\s\n]*@media/.test(baseCss + designedCss), 'CSS sem seletor inválido antes de @media');
check(drawer.includes("view: 'company'") && drawer.includes("href: '/sobre'") && drawer.includes("label: 'CrewCheck'"), 'menu possui acesso visível à empresa CrewCheck');
check(about.includes('CREWCHECK_FOUNDER_PHOTO') && /quem constrói o crewcheck/i.test(about), 'página institucional mostra fundador e identidade');
check(designedCss.includes(':is(.cc-card,.cc-control-card') && designedCss.includes('.cc-bottom-nav'), 'cards e navegação seguem os tokens do tema');

console.log(`CrewCheck ${pkg.version} — temas independentes, página institucional e responsividade: OK`);
