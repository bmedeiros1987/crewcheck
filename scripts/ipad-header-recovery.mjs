import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const original = `    <div className="cz-global-header" data-global-internal-header="true">
      <Brand pulse back={view !== 'cockpit'} onMenu={view === 'cockpit' ? () => setDrawer(true) : undefined}/>
    </div>
    <div className="cz-global-header-spacer" aria-hidden="true"/>`;
const replacement = `    <InternalHeaderFrame>
      <Brand back={view !== 'cockpit'} onMenu={view === 'cockpit' ? () => setDrawer(true) : undefined}/>
    </InternalHeaderFrame>`;
if (home.includes(original)) home = home.replace(original, replacement);
else if (!home.includes(replacement)) throw new Error('Canonical internal header not found');
const componentImport = "import { InternalHeaderFrame } from '../components/navigation/InternalHeaderFrame';";
if (!home.includes(componentImport)) home = `${componentImport}\n${home}`;
fs.writeFileSync(homePath, home);

const mainPath = 'client/src/main.tsx';
let main = fs.readFileSync(mainPath, 'utf8');
const cssImport = 'import "./styles/ipad-header-recovery.css";';
main = main.replaceAll(`${cssImport}\n`, '');
main = `${main.trimEnd()}\n${cssImport}\n`;
fs.writeFileSync(mainPath, main);
