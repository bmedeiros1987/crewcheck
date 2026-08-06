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

// FlyDeck: mantém a classificação única da v14.3.50; só a dimensão "dias" passa
// a vir do mesmo roster normalizado que alimenta a Escala.
const cockpitSignatureOld = `function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {`;
const cockpitSignatureNew = `function Cockpit({ roster, events, compliance, setView, onUpload, openMenu }: { roster: CrewRoster; events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {`;
if (!source.includes(cockpitSignatureNew)) {
  if (!source.includes(cockpitSignatureOld)) throw new Error('[v14387] assinatura do FlyDeck não localizada.');
  source = source.replace(cockpitSignatureOld, cockpitSignatureNew);
}

const cockpitScheduleAnchor = `  const scheduleCounts = countScheduleCategories(events);
  const counters = loaded && events[0]?.day ? {`;
const cockpitScheduleNew = `  const scheduleCounts = countScheduleCategories(events);
  const cockpitRosterCounts = rosterCounters(roster);
  const counters = loaded && events[0]?.day ? {`;
if (!source.includes('const cockpitRosterCounts = rosterCounters(roster);')) {
  if (!source.includes(cockpitScheduleAnchor)) throw new Error('[v14387] scheduleCounts do FlyDeck não localizado.');
  source = source.replace(cockpitScheduleAnchor, cockpitScheduleNew);
}
source = source.replace(
  `    days: new Set(events.map((item) => item.day.date)).size,
    flights: scheduleCounts.flights,`,
  `    days: cockpitRosterCounts.days,
    flights: scheduleCounts.flights,`,
);
if (source.includes('days: new Set(events.map((item) => item.day.date)).size')) {
  throw new Error('[v14387] contador local de dias do FlyDeck ainda presente.');
}

const cockpitCallOld = `<Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>`;
const cockpitCallNew = `<Cockpit roster={bundle.roster} events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>`;
if (!source.includes(cockpitCallNew)) {
  if (!source.includes(cockpitCallOld)) throw new Error('[v14387] chamada do FlyDeck não localizada.');
  source = source.replace(cockpitCallOld, cockpitCallNew);
}

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
  'const cockpitRosterCounts = rosterCounters(roster);',
  'days: cockpitRosterCounts.days,',
  '<Cockpit roster={bundle.roster}',
  'const rosterSurfaceCounts = rosterCounters(roster);',
  '<strong>{rosterSurfaceCounts.days}</strong>',
  '<strong>{rosterSurfaceCounts.flights}</strong>',
  'title="Jornada regulatória mensal"',
]) {
  if (!source.includes(required)) throw new Error(`[v14387] contrato não aplicado: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14387] CrewCheck ${VERSION}: dias canônicos unificados no preview/FlyDeck/Escala; classificação v14.3.50 preservada; jornada mensal rotulada.`);
