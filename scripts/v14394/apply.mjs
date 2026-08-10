import fs from 'node:fs';

const VERSION = '14.3.94';
const homePath = 'client/src/pages/Home.tsx';
const mainPath = 'client/src/main.tsx';
const cssPath = 'client/src/styles/ipad-shell-v14-3-94.css';
const layoutMarker = 'data-ipad-layout-v14394="contained"';
const menuStateMarker = "data-menu-open={drawer ? 'true' : 'false'}";
const cssImport = 'import "./styles/ipad-shell-v14-3-94.css";';

for (const file of [homePath, mainPath, cssPath]) {
  if (!fs.existsSync(file)) throw new Error(`[v14394] arquivo ausente: ${file}`);
}

let home = fs.readFileSync(homePath, 'utf8');
if (!home.includes(layoutMarker) || !home.includes(menuStateMarker)) {
  const anchor = 'data-view={view}';
  if (!home.includes(anchor)) throw new Error('[v14394] raiz cz-app não localizada.');
  const attributes = `${anchor} ${layoutMarker} ${menuStateMarker}`;
  home = home.replace(anchor, attributes);
}
if (!home.includes(layoutMarker)) throw new Error('[v14394] marcador de contenção do iPad ausente.');
if (!home.includes(menuStateMarker)) throw new Error('[v14394] estado explícito do menu ausente.');
fs.writeFileSync(homePath, home, 'utf8');

let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes(cssImport)) {
  const anchor = 'import "./styles/auth-premium-v2.css";';
  if (!main.includes(anchor)) throw new Error('[v14394] âncora final de estilos não localizada.');
  main = main.replace(anchor, `${anchor}\n${cssImport}`);
}
if (!main.includes(cssImport)) throw new Error('[v14394] CSS final do iPad não foi carregado.');
fs.writeFileSync(mainPath, main, 'utf8');

const css = fs.readFileSync(cssPath, 'utf8');
for (const required of [
  '.cz-app[data-ipad-layout-v14394="contained"]',
  '.cz-app[data-menu-open="true"] > .cz-global-header',
  '@media (pointer: coarse) and (min-width: 700px)',
  'width: 100vw !important;',
  'grid-template-columns: repeat(2, minmax(0, 1fr)) !important;',
  '.cz-menu-logout span',
  'white-space: nowrap !important;',
  '.cc-sidebar',
  'width: 220px !important;',
]) {
  if (!css.includes(required)) throw new Error(`[v14394] contrato visual ausente: ${required}`);
}
if (css.includes('word-break: break-all')) throw new Error('[v14394] quebra letra a letra não é permitida.');

console.log(`[v14394] CrewCheck ${VERSION}: iPad/menu contidos, header não compete com drawer e logout permanece horizontal.`);
