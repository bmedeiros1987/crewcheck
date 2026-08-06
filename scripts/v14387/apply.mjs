import fs from 'node:fs';

const VERSION = '14.3.87';
const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14387] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

// Preview: preserva countScheduleCategories (Folga/Descanso/Pernoite) e troca
// apenas a contagem bruta de dias pela mesma normalização usada na Escala.
const guardianOld = `  const scheduleCounts = countScheduleCategories(events);
  const flights = scheduleCounts.flights;
  const days = Array.isArray(roster.days) ? roster.days.length : 0;`;
const guardianNew = `  const previewRosterCounts = rosterCounters(roster);
  const scheduleCounts = countScheduleCategories(events);
  const flights = scheduleCounts.flights;
  const days = previewRosterCounts.days;`;
if (!source.includes('const previewRosterCounts = rosterCounters(roster);')) {
  if (!source.includes(guardianOld)) throw new Error('[v14387] contadores do preview pós-v14.3.50 não localizados.');
  source = source.replace(guardianOld, guardianNew);
}

// O FlyDeck Premium atual (v14.3.53+) não exibe mais os KPIs agregados antigos
// de Dias/Voos/Atividades. Portanto, não há contador paralelo a corrigir ali;
// a cronologia continua consumindo os mesmos eventos canônicos sem mudança.

// Escala: KPIs passam a usar explicitamente o mesmo contador canônico do preview.
const rosterFinance = `  const finance = financeSnapshot(normalizedRoster);`;
const rosterFinanceNew = `  const finance = financeSnapshot(normalizedRoster);\n  const rosterSurfaceCounts = rosterCounters(roster);`;
if (!source.includes('const rosterSurfaceCounts = rosterCounters(roster);')) {
  if (!source.includes(rosterFinance)) throw new Error('[v14387] snapshot financeiro da Escala não localizado.');
  source = source.replace(rosterFinance, rosterFinanceNew);
}

const rosterKpisOld = `<div><CalendarDays/><span>Dias</span><strong>{days.length}</strong></div><div><Plane/><span>Voos</span><strong>{events.filter(e => e.kind === 'flight').length}</strong></div>`;
const rosterKpisNew = `<div><CalendarDays/><span>Dias</span><strong>{rosterSurfaceCounts.days}</strong></div><div><Plane/><span>Voos</span><strong>{rosterSurfaceCounts.flights}</strong></div>`;
if (!source.includes(rosterKpisNew)) {
  if (!source.includes(rosterKpisOld)) throw new Error('[v14387] KPIs da Escala não localizados.');
  source = source.replace(rosterKpisOld, rosterKpisNew);
}

// "Total mensal" em Carga/Limites é jornada regulatória (compliance.metrics.totalDutyHours),
// conceito diferente de horas de programação exibidas em outras superfícies.
source = source.replace(
  `HourLimitBar title="Total mensal" used={monthlyHours}`,
  `HourLimitBar title="Jornada regulatória mensal" used={monthlyHours}`,
);

for (const required of [
  'const previewRosterCounts = rosterCounters(roster);',
  'const days = previewRosterCounts.days;',
  'const rosterSurfaceCounts = rosterCounters(roster);',
  '<strong>{rosterSurfaceCounts.days}</strong>',
  '<strong>{rosterSurfaceCounts.flights}</strong>',
  'title="Jornada regulatória mensal"',
]) {
  if (!source.includes(required)) throw new Error(`[v14387] contrato não aplicado: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14387] CrewCheck ${VERSION}: dias canônicos unificados no preview/Escala; jornada regulatória mensal rotulada sem tocar FlyDeck Premium.`);
