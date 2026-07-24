import fs from 'node:fs';

const applyPath = 'scripts/v14326/apply.mjs';
if (!fs.existsSync(applyPath)) throw new Error('v14.3.26 apply ausente.');
const source = fs.readFileSync(applyPath, 'utf8');

const required = [
  'grid-template-columns: 76px minmax(0,1fr) auto',
  'grid-column: 1 / -1',
  'overflow-wrap: anywhere',
  'env(safe-area-inset-bottom)',
  'padding-bottom: max(116px',
  '@media (max-width: 560px)',
];

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Proteção visual ausente: ${marker}`);
}

const prepare = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
if (!prepare.includes("await import('../v14326/apply.mjs');")) throw new Error('v14.3.26 não conectado à preparação canônica.');

console.log('[regression-v14.3.26] Layout mobile do despertador protegido contra sobreposição.');
