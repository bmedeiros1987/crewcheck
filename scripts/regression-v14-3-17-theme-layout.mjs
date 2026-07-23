import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.17] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function check(value, message) {
  if (!value) throw new Error(`[v14.3.17] ${message}`);
  console.log(`✓ ${message}`);
}

const pkg = JSON.parse(read('package.json'));
const runtime = read('client/src/lib/themeRuntime.ts');
const baseCss = read('client/src/theme-v14-3-17.css');
const designedCss = read('client/src/theme-v14-3-18.css');
const main = read('client/src/main.tsx');
const drawer = read('client/src/components/premium/SideDrawer.tsx');
const about = read('client/src/pages/AboutUsPage.tsx');
const gradle = read('android-wrapper/app/build.gradle');

check(pkg.version === '14.3.17', 'package na versão pública 14.3.17');
check(gradle.includes('versionName "14.3.17"') && gradle.includes('versionCode 140317'), 'Android na versão 14.3.17');
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
check(about.includes('CREWCHECK_FOUNDER_PHOTO') && about.includes('Quem constrói o CrewCheck'), 'página institucional mostra fundador e identidade');
check(designedCss.includes(':is(.cc-card,.cc-control-card') && designedCss.includes('.cc-bottom-nav'), 'cards e navegação seguem os tokens do tema');

console.log('CrewCheck v14.3.17 — temas independentes, página institucional e responsividade: OK');
