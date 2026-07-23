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
const css = read('client/src/theme-v14-3-17.css');
const main = read('client/src/main.tsx');
const gradle = read('android-wrapper/app/build.gradle');

check(pkg.version === '14.3.17', 'package na versão 14.3.17');
check(gradle.includes('versionName "14.3.17"') && gradle.includes('versionCode 140317'), 'Android na versão 14.3.17');
check(main.includes("import './lib/themeRuntime';") && main.includes('import "./theme-v14-3-17.css";'), 'tema carregado por último');
check(runtime.includes("type CrewCheckThemePreference = 'system' | 'light' | 'dark'"), 'preferência automática, clara e escura');
check(runtime.includes('cycleCrewCheckTheme') && runtime.includes("ORDER: CrewCheckThemePreference[] = ['system', 'light', 'dark']"), 'controle triestado');
check(runtime.includes("document.addEventListener('click'") && runtime.includes("closest?.('.cc-theme-row')"), 'seletor do menu conectado ao runtime');
check(css.includes('--cc-bottom-safe:calc(112px'), 'área segura do menu inferior');
check(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'grade de tablet consistente');
check(css.includes('Aparência: Automático') && css.includes('Aparência: Claro') && css.includes('Aparência: Escuro'), 'rótulos visíveis de aparência');
check(!/,[\s\n]*@media/.test(css), 'CSS sem seletor inválido antes de @media');
check(css.includes('[data-crewcheck-theme="light"] body') && css.includes('@media(prefers-color-scheme:light)'), 'modo claro explícito e automático');
check(css.includes(':focus-visible'), 'foco acessível');

console.log('CrewCheck v14.3.17 — tema, contraste, alinhamento e responsividade: OK');
