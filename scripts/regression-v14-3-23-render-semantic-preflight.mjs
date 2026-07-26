import fs from 'node:fs';

const preflight = fs.readFileSync('scripts/v14323-preflight/apply.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const required = [
  [preflight, "currentBlock.includes('place.distanceKm')", 'detecção semântica de distância'],
  [preflight, "currentBlock.includes('const distance')", 'detecção semântica da formatação'],
  [preflight, 'canonicalBlock', 'normalização canônica'],
  [chain, "await import('../v14323-preflight/apply.mjs');", 'preflight conectado'],
];

for (const [source, marker, label] of required) {
  if (!source.includes(marker)) throw new Error(`v14.3.23 render preflight: regressão em ${label}`);
}

const preflightPos = chain.indexOf("await import('../v14323-preflight/apply.mjs');");
const patchPos = chain.indexOf("await import('../v14323/apply.mjs');");
if (preflightPos < 0 || patchPos < 0 || preflightPos > patchPos) {
  throw new Error('v14.3.23 render preflight: ordem de aplicação inválida');
}

console.log('v14.3.23 render semantic preflight regression: OK');
