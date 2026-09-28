import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14367-regression] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const aims = read('client/src/lib/aimsParser.ts');
const codes = read('client/src/lib/rosterCodes.ts');
const airports = read('client/src/lib/airports.ts');
const chain = read('scripts/v139/apply.mjs');

if (!codes.includes("{ code: 'MCK', title: 'MCK', description: 'Presencial - Mock-up de emergências', category: 'GROUND_DUTY' }")) {
  throw new Error('[v14367-regression] MCK deixou de ser treinamento em solo.');
}
if (!aims.includes("'PFB','PHB','PIN','PMW'")) {
  throw new Error('[v14367-regression] PHB não está na lista de aeroportos AIMS.');
}
if (!aims.includes('CBF|EMER|MCK|MCK320|MCK_SS|MT')) {
  throw new Error('[v14367-regression] MCK não entra como atividade operacional de solo no parser AIMS.');
}
if (!airports.includes("PHB: 'Parnaíba'")) {
  throw new Error('[v14367-regression] PHB não resolve para Parnaíba.');
}
if (!chain.includes("await import('../v14367/apply.mjs');")) {
  throw new Error('[v14367-regression] v14.3.67 não está na preparação canônica.');
}

console.log('[v14367-regression] OK: MCK permanece treinamento em solo e PHB resolve para Parnaíba/PI.');
