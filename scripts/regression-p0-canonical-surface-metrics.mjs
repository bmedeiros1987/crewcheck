import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[P0/#303] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[P0/#303] ${message}`);
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex >= 0 && endIndex > startIndex, `Bloco não localizado: ${start} → ${end}`);
  return source.slice(startIndex, endIndex);
}

const home = read('client/src/pages/Home.tsx');
const canonical = read('client/src/lib/canonicalRoster.ts');
const patch = read('scripts/v14387/apply.mjs');

const guardian = between(home, 'function importGuardianSummary(', 'function confirmRosterImport(');
expect(guardian.includes('const previewRosterCounts = rosterCounters(roster);'), 'Preview não usa rosterCounters para dias canônicos.');
expect(guardian.includes('const scheduleCounts = countScheduleCategories(events);'), 'Preview deve preservar a classificação única de programação/folga/descanso/pernoite.');
expect(guardian.includes('const days = previewRosterCounts.days;'), 'Preview ainda usa quantidade bruta de roster.days.');
expect(guardian.includes('const flights = scheduleCounts.flights;'), 'Preview deve manter voos pela mesma classificação da v14.3.50.');
expect(guardian.includes('Programações: ${scheduleCounts.programming}'), 'Preview perdeu a contagem separada de Programações.');
expect(guardian.includes('Folgas: ${scheduleCounts.daysOff}'), 'Preview perdeu Folgas separadas.');
expect(guardian.includes('Descansos: ${scheduleCounts.recoveryRest}'), 'Preview perdeu Descansos separados.');
expect(guardian.includes('Pernoites: ${scheduleCounts.overnights}'), 'Preview perdeu Pernoites separados.');
expect(!guardian.includes('Array.isArray(roster.days) ? roster.days.length'), 'Preview não pode voltar a contar dias brutos antes da normalização.');

const cockpit = between(home, 'function Cockpit(', 'function rosterCode(');
expect(cockpit.includes('roster: CrewRoster'), 'FlyDeck precisa receber o mesmo roster ativo usado pelas demais superfícies.');
expect(cockpit.includes('const scheduleCounts = countScheduleCategories(events);'), 'FlyDeck precisa preservar classificação única v14.3.50.');
expect(cockpit.includes('const cockpitRosterCounts = rosterCounters(roster);'), 'FlyDeck não usa contador canônico de dias.');
expect(cockpit.includes('days: cockpitRosterCounts.days,'), 'FlyDeck não usa dias normalizados.');
expect(cockpit.includes('flights: scheduleCounts.flights,'), 'FlyDeck deve manter voos pela classificação única.');
expect(cockpit.includes('programming: scheduleCounts.programming,'), 'FlyDeck deve manter Programações separadas.');
expect(!cockpit.includes('days: new Set(events.map'), 'FlyDeck não pode manter contagem local de dias em paralelo.');

const roster = between(home, 'function Roster({ roster, events, setView }', 'function comparisonEventSummary(');
expect(roster.includes('const rosterSurfaceCounts = rosterCounters(roster);'), 'Escala não usa rosterCounters canônico nos KPIs.');
expect(roster.includes('<strong>{rosterSurfaceCounts.days}</strong>'), 'KPI de dias da Escala não usa contador canônico.');
expect(roster.includes('<strong>{rosterSurfaceCounts.flights}</strong>'), 'KPI de voos da Escala não usa contador canônico.');

expect(
  home.includes("{view === 'cockpit' && <Cockpit roster={bundle.roster} events={events}"),
  'Home não entrega o mesmo roster ativo ao FlyDeck.',
);
expect(
  home.includes('HourLimitBar title="Jornada regulatória mensal" used={monthlyHours}'),
  'Carga/Limites precisa rotular totalDutyHours como jornada regulatória, não como programação genérica.',
);

expect(
  /export function rosterCounters\(roster: CrewRoster\)[\s\S]{0,260}?const normalized = normalizeRosterDays\(roster\);[\s\S]{0,260}?buildCanonicalRosterEvents\(normalized\)/.test(canonical),
  'rosterCounters deve continuar derivado de normalizeRosterDays + eventos canônicos.',
);

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/aimsParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/complianceEngine.ts',
  'client/src/lib/financialRules.ts',
]) {
  expect(!patch.includes(`update('${protectedPath}'`) && !patch.includes(`const file = '${protectedPath}'`), `Patch não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[P0/#303] OK — dias normalizados unificados; Programações/Folga/Descanso/Pernoite v14.3.50 preservados; jornada mensal rotulada.');
