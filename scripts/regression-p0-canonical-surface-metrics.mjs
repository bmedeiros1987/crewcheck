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
const referenceMonthPatch = read('scripts/v14387b/apply.mjs');

const guardian = between(home, 'function importGuardianSummary(', 'function confirmRosterImport(');
expect(guardian.includes('const normalizedPreviewRoster = normalizeRosterDays(roster);'), 'Preview não normaliza o roster antes de resumir o mês de referência.');
expect(guardian.includes('filterEventsToRosterReferencePeriod(buildLegs(roster), normalizedPreviewRoster)'), 'Preview não limita eventos ao mês/ano exibido.');
expect(guardian.includes('filterDaysToRosterReferencePeriod(normalizedPreviewRoster.days, normalizedPreviewRoster)'), 'Preview não limita dias ao mês/ano exibido.');
expect(guardian.includes('const scheduleCounts = countScheduleCategories(events);'), 'Preview deve preservar a classificação única de programação/folga/descanso/pernoite.');
expect(guardian.includes('const days = previewDays.length;'), 'Preview não usa a quantidade de dias normalizados do mês de referência.');
expect(guardian.includes('const flights = scheduleCounts.flights;'), 'Preview deve manter voos pela mesma classificação da v14.3.50.');
expect(guardian.includes('Programações: ${scheduleCounts.programming}'), 'Preview perdeu a contagem separada de Programações.');
expect(guardian.includes('Folgas: ${scheduleCounts.daysOff}'), 'Preview perdeu Folgas separadas.');
expect(guardian.includes('Descansos: ${scheduleCounts.recoveryRest}'), 'Preview perdeu Descansos separados.');
expect(guardian.includes('Pernoites: ${scheduleCounts.overnights}'), 'Preview perdeu Pernoites separados.');
expect(!guardian.includes('Array.isArray(roster.days) ? roster.days.length'), 'Preview não pode voltar a contar dias brutos antes da normalização.');
expect(!guardian.includes('const previewRosterCounts = rosterCounters(roster);'), 'Preview não pode voltar a resumir o bundle multimensal inteiro sob um único mês.');

// FlyDeck Premium v14.3.53+ não exibe KPIs agregados de Dias/Voos/Atividades.
// Esse gate não deve reintroduzir esses contadores nem alterar sua cronologia.
const cockpit = between(home, 'function Cockpit(', 'function rosterCode(');
expect(cockpit.includes('data-flydeck-v14353="premium-briefing"'), 'FlyDeck Premium atual deve permanecer preservado.');
expect(cockpit.includes('<OperationalDayTimeline events={events}'), 'FlyDeck deve continuar usando a cronologia operacional existente.');
expect(!cockpit.includes('title="Dias publicados"'), 'FlyDeck Premium não deve reintroduzir KPI agregado legado de dias.');

const roster = between(home, 'function Roster({ roster, events, setView }', 'function comparisonEventSummary(');
expect(roster.includes('const rosterSurfaceCounts = rosterCounters(roster);'), 'Escala não usa rosterCounters canônico nos KPIs.');
expect(roster.includes('<strong>{rosterSurfaceCounts.days}</strong>'), 'KPI de dias da Escala não usa contador canônico.');
expect(roster.includes('<strong>{rosterSurfaceCounts.flights}</strong>'), 'KPI de voos da Escala não usa contador canônico.');

expect(
  home.includes('HourLimitBar title="Jornada regulatória mensal" used={monthlyHours}'),
  'Carga/Limites precisa rotular totalDutyHours como jornada regulatória, não como programação genérica.',
);

expect(
  /export function rosterCounters\(roster: CrewRoster\)[\s\S]{0,260}?const normalized = normalizeRosterDays\(roster\);[\s\S]{0,260}?buildCanonicalRosterEvents\(normalized\)/.test(canonical),
  'rosterCounters deve continuar derivado de normalizeRosterDays + eventos canônicos.',
);
expect(
  canonical.includes('const forwardContinuationLimit = end + 45 * 24 * 60 * 60_000;'),
  'Bundle canônico deve continuar preservando carry-out de até 45 dias; só o preview é recortado por mês.',
);

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/aimsParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/complianceEngine.ts',
  'client/src/lib/financialRules.ts',
]) {
  expect(!patch.includes(`update('${protectedPath}'`) && !patch.includes(`const file = '${protectedPath}'`), `Patch v14.3.87 não deve alterar motor protegido: ${protectedPath}.`);
  expect(!referenceMonthPatch.includes(`'${protectedPath}'`), `Patch v14.3.87b não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[P0/#303] OK — preview usa roster normalizado e mês de referência; Escala mantém rosterCounters; FlyDeck Premium preservado; jornada regulatória mensal rotulada.');
