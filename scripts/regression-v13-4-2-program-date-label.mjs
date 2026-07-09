import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

if (!source.includes('function programDateLabel(event: ZeroLeg)')) {
  throw new Error('programDateLabel helper is missing');
}

if (!source.includes('Data a confirmar')) {
  throw new Error('programDateLabel must have a safe fallback');
}

if (!source.includes("typeof programDateLabel === 'function'")) {
  throw new Error('Presentation manager must have defensive programDateLabel call');
}

console.log('v13.4.2 programDateLabel hotfix regression OK');
