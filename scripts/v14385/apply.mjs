import fs from 'node:fs';

const VERSION = '14.3.85';
const file = 'client/src/pages/Home.tsx';

if (!fs.existsSync(file)) throw new Error('[v14385] Home.tsx ausente.');
if (!fs.existsSync('client/src/lib/financialReserveCredits.ts')) throw new Error('[v14385] helper financeiro de Reserva ausente.');

let source = fs.readFileSync(file, 'utf8');

const financialRulesImportPattern = /^import \{[^\n]*\bresolveActFinancialRules\b[^\n]*\bresolvePerDiemRule\b[^\n]*\} from ['"]@\/lib\/financialRules['"];$/m;
const importLine = "import { payableReserveHours } from '@/lib/financialReserveCredits';";
if (!source.includes(importLine)) {
  const financialRulesImport = source.match(financialRulesImportPattern)?.[0];
  if (!financialRulesImport) throw new Error('[v14385] import de financialRules não encontrado.');
  source = source.replace(financialRulesImport, `${financialRulesImport}\n${importLine}`);
}

const oldReserve = "  const reserveHours = reserveEvents.reduce((sum, event) => sum + durationHours(event), 0);";
const newReserve = `  // CC-0001/#250: Reserva acionada remunera somente do início da Reserva até\n  // o início do primeiro voo que comece dentro da janela publicada. O evento\n  // regulatório permanece íntegro; este recorte existe apenas na camada financeira.\n  const reserveFlightStarts = flightEvents.map((event) => eventStartDateTime(event));\n  const reserveHours = reserveEvents.reduce(\n    (sum, event) => sum + payableReserveHours(\n      eventStartDateTime(event),\n      eventEndDateTime(event),\n      reserveFlightStarts,\n    ),\n    0,\n  );`;
if (!source.includes('const reserveFlightStarts = flightEvents.map((event) => eventStartDateTime(event));')) {
  if (!source.includes(oldReserve)) throw new Error('[v14385] cálculo antigo de horas de Reserva não encontrado.');
  source = source.replace(oldReserve, newReserve);
}

if (!source.includes(importLine)) throw new Error('[v14385] import do helper não aplicado.');
if (!source.includes('payableReserveHours(')) throw new Error('[v14385] crédito de Reserva acionada não aplicado.');

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14385] CrewCheck ${VERSION}: crédito financeiro da Reserva acionada termina no primeiro voo da janela.`);
