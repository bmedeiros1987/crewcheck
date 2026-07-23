import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.19] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function check(value, message) {
  if (!value) throw new Error(`[v14.3.19] ${message}`);
  console.log(`✓ ${message}`);
}

const pkg = JSON.parse(read('package.json'));
const css = read('client/src/theme-v14-3-19.css');
const main = read('client/src/main.tsx');
const drawer = read('client/src/components/premium/SideDrawer.tsx');
const app = read('client/src/App.tsx');
const about = read('client/src/pages/AboutUsPage.tsx');
const gradle = read('android-wrapper/app/build.gradle');

check(pkg.version === '14.3.19', `package preparado em 14.3.19; encontrado ${pkg.version}`);
check(gradle.includes('versionName "14.3.19"') && gradle.includes('versionCode 140319'), 'Android preparado em 14.3.19/140319');
check(main.includes('theme-v14-3-19.css'), 'tema estrutural carregado por último');
check(css.includes('html[data-crewcheck-theme="dark"]') && css.includes('html[data-crewcheck-theme="light"]'), 'paletas clara e escura independentes');
check(css.includes('--cc-card:#102238') && css.includes('--cc-card:#fff'), 'cards possuem superfícies próprias em cada tema');
check(css.includes('cc-button-row') && css.includes('minmax(180px,1fr)'), 'ações possuem grade e alinhamento consistentes');
check(css.includes('--cc-nav-safe:calc(108px'), 'conteúdo preserva área do menu inferior');
check(!css.includes('filter:invert') && !css.includes('filter: invert'), 'tema não usa negativo de cor');
check(!css.includes('[class*="card"]') && !css.includes('[class*="panel"]'), 'tema evita seletores genéricos destrutivos');
check(drawer.includes("view: 'company'") && drawer.includes("href: '/sobre'"), 'menu contém acesso visível ao CrewCheck');
check(drawer.includes('Building2') && drawer.includes('cc-company-link'), 'item institucional possui ícone e estilo próprios');
check(app.includes('<Route path="/sobre" component={AboutUsPage} />'), 'rota institucional permanece pública');
check(about.includes('Nossa origem') || about.includes('Quem constrói o CrewCheck'), 'página institucional mantém identidade e transparência');

console.log('CrewCheck v14.3.19 — auditoria estrutural, temas próprios e página institucional: OK');
