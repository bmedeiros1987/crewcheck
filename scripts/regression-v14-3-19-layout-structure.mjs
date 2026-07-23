import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[layout-structure] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function check(value, message) {
  if (!value) throw new Error(`[layout-structure] ${message}`);
  console.log(`✓ ${message}`);
}
function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}
function versionAtLeast(value, minimum) {
  const current = parseVersion(value);
  const floor = parseVersion(minimum);
  if (!current || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > floor[index]) return true;
    if (current[index] < floor[index]) return false;
  }
  return true;
}
function androidVersionCode(value) {
  const parsed = parseVersion(value);
  if (!parsed) return 0;
  const [major, minor, patch] = parsed;
  return (major * 10_000) + (minor * 100) + patch;
}

const pkg = JSON.parse(read('package.json'));
const css = read('client/src/theme-v14-3-19.css');
const main = read('client/src/main.tsx');
const drawer = read('client/src/components/premium/SideDrawer.tsx');
const app = read('client/src/App.tsx');
const about = read('client/src/pages/AboutUsPage.tsx');
const gradle = read('android-wrapper/app/build.gradle');

const versionName = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1];
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] || 0);
const expectedCode = androidVersionCode(pkg.version);

check(versionAtLeast(pkg.version, '14.3.19'), `package preparado em versão 14.3.19 ou posterior; encontrado ${pkg.version}`);
check(versionName === pkg.version, `Android sincronizado com package.json (${pkg.version})`);
check(versionCode === expectedCode, `versionCode Android sincronizado (${expectedCode})`);
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
check(/nossa origem|quem constrói o crewcheck/i.test(about), 'página institucional mantém identidade e transparência');

console.log(`CrewCheck ${pkg.version} — auditoria estrutural, temas próprios e página institucional: OK`);
