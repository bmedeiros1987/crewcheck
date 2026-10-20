import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const componentImport = "import { OperationalLayoutSafety } from '../components/navigation/OperationalLayoutSafety';";
if (!home.includes(componentImport)) home = `${componentImport}\n${home}`;
if (!home.includes('<OperationalLayoutSafety/>')) {
  const root = /(<main className="cz-app"[^\n]+>)/;
  if (!root.test(home)) throw new Error('Operational layout: canonical app root not found');
  home = home.replace(root, '$1\n    <OperationalLayoutSafety/>');
}
const clock = '<strong className="cz-depart-time">{primaryDepartureLabel}</strong>';
const protectedClock = '<strong className="cz-depart-time" data-clock={/^\\d{1,2}:\\d{2}$/.test(primaryDepartureLabel)}>{primaryDepartureLabel}</strong>';
if (home.includes(clock)) home = home.replace(clock, protectedClock);
else if (!home.includes(protectedClock)) throw new Error('Operational layout: canonical departure clock not found');
fs.writeFileSync(homePath, home);

const mainPath = 'client/src/main.tsx';
const cssImport = 'import "./styles/operational-layout.css";';
let main = fs.readFileSync(mainPath, 'utf8');
main = main.replaceAll(`${cssImport}\n`, '');
const headerImport = 'import "./styles/ipad-header-recovery.css";';
if (!main.includes(headerImport)) throw new Error('Operational layout: final header stylesheet not found');
main = main.replace(headerImport, `${cssImport}\n${headerImport}`);
fs.writeFileSync(mainPath, main);
console.log('[operational-layout] Departure clock, roster presentation metrics and measured footer clearance applied.');
