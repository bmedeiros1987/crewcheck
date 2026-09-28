import fs from 'node:fs';

const home = fs.readFileSync(new URL('../client/src/pages/Home.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../client/src/index.css', import.meta.url), 'utf8');
if (!home.includes('const visibleAlertCount =')) throw new Error('visibleAlertCount precisa estar definido antes do uso.');
if (!css.includes('CrewCheck v13.7.14 — UI Audit Runtime Patch')) throw new Error('Auditoria visual v13.7.14 ausente.');
console.log('CrewCheck v13.7.14 UI audit regression OK');
