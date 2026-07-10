import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const home = fs.readFileSync(path.join(root, 'client/src/pages/Home.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/src/index.css'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'client/src/lib/complianceEngine.ts'), 'utf8');

assert(home.includes('getRegulatoryLimitCardsForDay'), 'Home precisa anexar limites regulatórios aos eventos');
assert(home.includes('function RegulationLimitGrid'), 'Home precisa renderizar bloco de regulamentação nos cards');
assert(home.includes('event.regulation'), 'Cards da escala precisam consumir event.regulation');
assert(css.includes('.cz-regulation-strip'), 'CSS precisa conter a régua visual de regulamentação');
assert(engineSource.includes('const WEEKLY_DUTY_LIMIT_HOURS = 44'), 'Motor precisa parametrizar 44h semanais');
assert(engineSource.includes('RBAC117_ROLLING_DUTY_LIMIT_7_DAYS = 60'), 'Motor precisa preservar referência RBAC 117 de 60h/7 dias');
assert(!engineSource.includes('/jornada semanal acima/i'), 'Alerta semanal de 44h não pode ficar escondido no sanitizador');
assert(engineSource.includes('duty: [12, 12, 12, 11, 10]'), 'Tabela B.1 08h00-11h59 precisa usar 12h para 1-5 etapas');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-reg-audit-'));
fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"commonjs"}');

for (const file of ['actRules.ts', 'rosterCodes.ts', 'complianceEngine.ts']) {
  const source = fs.readFileSync(path.join(root, 'client/src/lib', file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  fs.writeFileSync(path.join(tempDir, file.replace('.ts', '.js')), output);
}

const engine = require(path.join(tempDir, 'complianceEngine.js'));

function leg(flightNumber, origin, destination, departureTime, arrivalTime, isNextDay = false, duration = 1) {
  return { flightNumber, origin, destination, departureTime, arrivalTime, isNextDay, duration };
}

function day(date, type, dutyReport, dutyDebrief, options = {}) {
  return {
    date,
    dayOfWeek: 'SEG',
    dayNumber: Number(date.slice(0, 2)),
    month: 1,
    year: 2026,
    type,
    pairingCode: options.pairingCode || type,
    dutyReport,
    dutyDebrief,
    isNextDay: Boolean(options.isNextDay),
    dutyHours: options.dutyHours,
    flyingHours: options.flyingHours,
    legs: options.legs || [],
    rawText: options.rawText || '',
  };
}

function roster(days) {
  return {
    crewName: 'Tripulante Teste',
    base: 'BSB',
    month: 1,
    year: 2026,
    days,
    rawText: 'COMISSARIO CCM BSB',
  };
}

const weeklyRoster = roster([
  day('01/01/2026', 'VOO', '08:00', '17:00', { dutyHours: 9 }),
  day('02/01/2026', 'VOO', '08:00', '17:00', { dutyHours: 9 }),
  day('03/01/2026', 'VOO', '08:00', '17:00', { dutyHours: 9 }),
  day('04/01/2026', 'VOO', '08:00', '17:00', { dutyHours: 9 }),
  day('05/01/2026', 'VOO', '08:00', '17:00', { dutyHours: 9 }),
]);
const weeklyCompliance = engine.analyzeCompliance(weeklyRoster);
assert(weeklyCompliance.metrics.weeklyDutyHours === 45, 'Métrica semanal deve somar 45h');
assert(weeklyCompliance.alerts.some((alert) => alert.title === 'Jornada semanal acima de 44h'), 'Deve alertar quando a janela semanal passar de 44h');

const b1Day = day('06/01/2026', 'VOO', '08:00', '17:00', {
  legs: [
    leg('LA3001', 'BSB', 'GRU', '09:00', '10:40', false, 1.7),
    leg('LA3002', 'GRU', 'BSB', '13:30', '15:10', false, 1.7),
  ],
});
const b1Cards = engine.getRegulatoryLimitCardsForDay(b1Day, roster([b1Day]));
assert(b1Cards.some((card) => card.key === 'daily-duty' && card.value === '12h'), 'Card diário deve usar B.1 corrigida de 12h para início 08h');

const standbyReserveRoster = roster([
  day('01/01/2026', 'HSB', '00:00', '14:00', { pairingCode: 'HSB', rawText: 'HSB BSB 00:00 14:00' }),
  day('02/01/2026', 'RES', '10:00', '18:00', { pairingCode: 'RES', rawText: 'RES BSB 10:00 18:00' }),
]);
const standbyReserveCompliance = engine.analyzeCompliance(standbyReserveRoster);
const forbiddenStandalone = /Sobreaviso acima|Sobreaviso abaixo|Reserva acima|Reserva abaixo/i;
assert(!standbyReserveCompliance.alerts.some((alert) => forbiddenStandalone.test(alert.title)), 'SAV/RES isolados não devem gerar alerta automático de min/max');
const standbyCards = engine.getRegulatoryLimitCardsForDay(standbyReserveRoster.days[0], standbyReserveRoster);
assert(standbyCards.some((card) => card.key === 'standby-reserve-limits' && card.informationalOnly), 'Card SAV/RES precisa ser informativo');

const nightRoster = roster([
  day('01/01/2026', 'VOO', '22:30', '02:30', { isNextDay: true, legs: [leg('LA3101', 'BSB', 'GRU', '23:00', '02:00', true, 3)] }),
  day('02/01/2026', 'VOO', '22:30', '02:30', { isNextDay: true, legs: [leg('LA3102', 'GRU', 'BSB', '23:00', '02:00', true, 3)] }),
  day('05/01/2026', 'VOO', '22:30', '02:30', { isNextDay: true, legs: [leg('LA3103', 'BSB', 'GRU', '23:00', '02:00', true, 3)] }),
]);
const nightAudit = engine.getRegulatoryAuditSummary(nightRoster);
assert(nightAudit.maxConsecutiveNights === 2, 'Madrugada consecutiva deve resetar após 48h livres');
assert(nightAudit.maxNightOpsWindow === 2, 'Janela de 168h deve reiniciar após 48h livres de atividade');

console.log('v13.5.4 regulatory audit regression OK');
