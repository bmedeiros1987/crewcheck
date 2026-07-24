import fs from 'node:fs';

const source = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const required = [
  "serverSource.includes('function conciergeStayRecords(')",
  "serverSource.includes('function conciergeContextualRoutineReply(')",
  "serverSource.includes('async function conciergeHospitalsReply(')",
  "v14.3.23 já aplicado; repetição segura ignorada",
];

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`[v14.3.25] proteção ausente: ${marker}`);
}

if (!/if \(!conciergeContextAlreadyApplied\)\s*\{\s*await import\('\.\.\/v14323\/apply\.mjs'\);/s.test(source)) {
  throw new Error('[v14.3.25] v14323 ainda pode ser reaplicado sem guarda.');
}

console.log('[v14.3.25] Preparação do Concierge protegida contra execução repetida.');
