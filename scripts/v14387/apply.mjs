import fs from 'node:fs';

const VERSION = '14.3.87';
const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14387] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

const guardianOld = `function importGuardianSummary(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {
  const events = buildLegs(roster);
  const flights = events.filter((event) => event.kind === 'flight').length;
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  const activities = events.filter((event) => event.kind !== 'flight' && event.canonical?.kind !== 'rest').length;
  const rest = events.filter((event) => event.canonical?.kind === 'rest').length;`;
const guardianNew = `function importGuardianSummary(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {
  const events = buildLegs(roster);
  const canonicalCounts = rosterCounters(roster);
  const flights = canonicalCounts.flights;
  const days = canonicalCounts.days;
  const activities = canonicalCounts.activities;
  const rest = canonicalCounts.rest;`;
if (!source.includes('const canonicalCounts = rosterCounters(roster);')) {
  if (!source.includes(guardianOld)) throw new Error('[v14387] bloco do preview canônico não localizado.');
  source = source.replace(guardianOld, guardianNew);
}

const cockpitSignatureOld = `function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {`;
const cockpitSignatureNew = `function Cockpit({ roster, events, compliance, setView, onUpload, openMenu }: { roster: CrewRoster; events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {`;
if (!source.includes(cockpitSignatureNew)) {
  if (!source.includes(cockpitSignatureOld)) throw new Error('[v14387] assinatura do FlyDeck não localizada.');
  source = source.replace(cockpitSignatureOld, cockpitSignatureNew);
}

const cockpitCountersOld = `  const counters = loaded && events[0]?.day ? {
    days: new Set(events.map((e) => e.day.date)).size,
    flights: events.filter((e) => e.kind === 'flight').length,
    activities: events.filter((e) => e.kind !== 'flight' && e.canonical?.kind !== 'rest').length,
    rest: events.filter((e) => e.canonical?.kind === 'rest').length,
  } : { days: 0, flights: 0, activities: 0, rest: 0 };`;
const cockpitCountersNew = `  const counters = loaded ? rosterCounters(roster) : { days: 0, flights: 0, activities: 0, rest: 0, events: 0 };`;
if (!source.includes(cockpitCountersNew)) {
  if (!source.includes(cockpitCountersOld)) throw new Error('[v14387] contadores locais do FlyDeck não localizados.');
  source = source.replace(cockpitCountersOld, cockpitCountersNew);
}

const cockpitCallOld = `<Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>`;
const cockpitCallNew = `<Cockpit roster={bundle.roster} events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>`;
if (!source.includes(cockpitCallNew)) {
  if (!source.includes(cockpitCallOld)) throw new Error('[v14387] chamada do FlyDeck não localizada.');
  source = source.replace(cockpitCallOld, cockpitCallNew);
}

const rosterFinance = `  const finance = financeSnapshot(normalizedRoster);`;
const rosterFinanceNew = `  const finance = financeSnapshot(normalizedRoster);\n  const canonicalCounts = rosterCounters(roster);`;
if (!source.includes(rosterFinanceNew)) {
  if (!source.includes(rosterFinance)) throw new Error('[v14387] snapshot financeiro da Escala não localizado.');
  source = source.replace(rosterFinance, rosterFinanceNew);
}

const rosterKpisOld = `<div><CalendarDays/><span>Dias</span><strong>{days.length}</strong></div><div><Plane/><span>Voos</span><strong>{events.filter(e => e.kind === 'flight').length}</strong></div>`;
const rosterKpisNew = `<div><CalendarDays/><span>Dias</span><strong>{canonicalCounts.days}</strong></div><div><Plane/><span>Voos</span><strong>{canonicalCounts.flights}</strong></div>`;
if (!source.includes(rosterKpisNew)) {
  if (!source.includes(rosterKpisOld)) throw new Error('[v14387] KPIs da Escala não localizados.');
  source = source.replace(rosterKpisOld, rosterKpisNew);
}

source = source.replace(
  `HourLimitBar title="Total mensal" used={monthlyHours}`,
  `HourLimitBar title="Jornada regulatória mensal" used={monthlyHours}`,
);

for (const required of [
  'const canonicalCounts = rosterCounters(roster);',
  'const counters = loaded ? rosterCounters(roster)',
  '<Cockpit roster={bundle.roster}',
  '<strong>{canonicalCounts.days}</strong>',
  '<strong>{canonicalCounts.flights}</strong>',
  'title="Jornada regulatória mensal"',
]) {
  if (!source.includes(required)) throw new Error(`[v14387] contrato não aplicado: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14387] CrewCheck ${VERSION}: preview, FlyDeck e Escala usam rosterCounters canônico; Carga/Limites rotula jornada mensal.`);
