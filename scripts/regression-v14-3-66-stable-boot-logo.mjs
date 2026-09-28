import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14366-regression] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const app = read('client/src/App.tsx');
const html = read('client/index.html');
const css = read('client/src/index.css');

if (!app.includes('className="cc1270-loader-brand"')) throw new Error('[v14366-regression] Splash ainda não usa a logo fixa canônica.');
if (!app.includes('src="/icons/crewcheck-icon-v2.png"')) throw new Error('[v14366-regression] Splash não aponta para o asset canônico da marca.');
if (!html.includes('rel="preload" as="image" href="/icons/crewcheck-icon-v2.png"')) throw new Error('[v14366-regression] Logo canônica não é pré-carregada.');
if (/window\.location\.reload\s*\(/.test(html)) throw new Error('[v14366-regression] Reload automático permanece no HTML preparado.');
if (/crewcheck-release-watch-v\d+/.test(html)) throw new Error('[v14366-regression] Release watcher legado permanece no HTML preparado.');
if (/registration\.unregister\s*\(/.test(html)) throw new Error('[v14366-regression] Limpeza destrutiva de service worker permanece no HTML preparado.');
if (!css.includes('CrewCheck v14.3.66 — stable boot brand')) throw new Error('[v14366-regression] Proteção visual da logo fixa ausente.');
if (!css.includes('animation: none !important')) throw new Error('[v14366-regression] Logo ainda pode receber animação no boot.');

console.log('[v14366-regression] OK: boot sem reload automático e logo fixa desde o primeiro frame.');
