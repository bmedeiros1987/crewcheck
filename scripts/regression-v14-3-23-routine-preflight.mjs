import fs from 'node:fs';

const preflight = fs.readFileSync('scripts/v14323-preflight/apply.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const required = [
  [preflight, 'routineStartPattern', 'normalização semântica da rotina'],
  [preflight, 'contextAlreadyComplete', 'detecção de contexto completo'],
  [preflight, 'assinatura ou início de conciergeRoutineReply não reconhecido com segurança', 'falha segura'],
  [chain, "await import('../v14323-preflight/apply.mjs');", 'preflight antes do patch legado'],
];

for (const [source, marker, label] of required) {
  if (!source.includes(marker)) throw new Error(`v14.3.23 routine preflight: regressão em ${label}`);
}

console.log('v14.3.23 routine preflight regression: OK');
