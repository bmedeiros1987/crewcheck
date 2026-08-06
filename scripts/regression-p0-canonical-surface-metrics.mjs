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
expect(guardian.includes('const canonicalCounts = rosterCounters(roster);'), 'Preview não usa rosterCounters canônico.');
expect(guardian.includes('const days = canonicalCounts.days;'), 'Preview ainda usa quantidade bruta de roster.days.');
expect(guardian.includes('const flights = canonicalCounts.flights;'), 'Preview não usa contagem canônica de voos.');
expect(guardian.includes('const activities = canonicalCounts.activities;'), 'Preview não usa contagem canônica de atividades.');
expect(guardian.includes('const rest = canonicalCounts.rest;'), 'Preview não usa contagem canônica de folga/descanso.');
expect(!guardian.includes('Array.isArray(roster.days) ? roster.days.length'), 'Preview não pode voltar a contar dias brutos antes da normalização.');

const cockpit = between(home, 'function Cockpit(', 'function rosterCode(');
expect(cockpit.includes('roster: CrewRoster'), 'FlyDeck precisa receber o mesmo roster ativo usado pelas demais superfícies.');
expect(cockpit.includes('const counters = loaded ? rosterCounters(roster)'), 'FlyDeck ainda deriva contadores por regra local.');
expect(!cockpit.includes('days: new Set(events.map'), 'FlyDeck não pode manter contagem local de dias em paralelo.');

const roster = between(home, 'function Roster({ roster, events, setView }', 'function comparisonEventSummary(');
expect(roster.includes('const canonicalCounts = rosterCounters(roster);'), 'Escala não usa rosterCounters canônico.');
expect(roster.includes('<strong>{canonicalCounts.days}</strong>'), 'KPI de dias da Escala não usa contador canônico.');
expect(roster.includes('<strong>{canonicalCounts.flights}</strong>'), 'KPI de voos da Escala não usa contador canônico.');

expect(
  home.includes("{view === 'cockpit' && <Cockpit roster={bundle.roster} events={events}"),
  'Home não entrega o mesmo roster ativo ao FlyDeck.',
);
expect(
  home.includes('HourLimitBar title="Jornada regulatória mensal" used={monthlyHours}'),
  'Carga/Limites precisa rotular 126,3h como jornada regulatória, não como programação genérica.',
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

console.log('[P0/#303] OK — preview, FlyDeck e Escala compartilham rosterCounters; Carga/Limites diferencia jornada regulatória.');
