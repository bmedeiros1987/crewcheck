import fs from 'node:fs';
const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const anchor = '<div className="cz-menu-scroll" data-crew-menu-scroll="true">';
if (!home.includes('id="cc-menu-fixed-heading"')) {
  if (!home.includes(anchor)) throw new Error('Canonical menu scroller missing');
  home = home.replace(anchor, '<div id="cc-menu-fixed-heading"/>\n      ' + anchor);
}
fs.writeFileSync(homePath, home);
// Preserve canonical final stylesheet and manual-finalization ordering.
const cssPath = 'client/src/styles/ipad-header-recovery.css';
const marker = '/* Explicit pinned navigation override */';
let css = fs.readFileSync(cssPath, 'utf8').split(marker)[0].replaceAll("@import './fixed-navigation-headers.css';\n", '').trimEnd();
fs.writeFileSync(cssPath, css + '\n' + marker + '\n' + fs.readFileSync('client/src/styles/fixed-navigation-headers.css', 'utf8'));
const mainPath = 'client/src/main.tsx';
let main = fs.readFileSync(mainPath, 'utf8').replaceAll('import "./styles/fixed-navigation-headers.css";\n', '');
const finalImport = 'import "./styles/ipad-header-recovery.css";';
main = main.replaceAll(finalImport + '\n', '');
fs.writeFileSync(mainPath, main.trimEnd() + '\n' + finalImport + '\n');
