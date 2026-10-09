import fs from 'node:fs';
const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const anchor = '<div className="cz-menu-scroll" data-crew-menu-scroll="true">';
if (!home.includes('id="cc-menu-fixed-heading"')) {
  if (!home.includes(anchor)) throw new Error('Canonical menu scroller missing');
  home = home.replace(anchor, '<div id="cc-menu-fixed-heading"/>\n      ' + anchor);
}
fs.writeFileSync(homePath, home);
const mainPath = 'client/src/main.tsx';
let main = fs.readFileSync(mainPath, 'utf8');
const css = 'import "./styles/fixed-navigation-headers.css";';
main = main.replaceAll(css + '\n', '');
fs.writeFileSync(mainPath, main.trimEnd() + '\n' + css + '\n');
