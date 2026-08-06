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

// FlyDeck: não reescreve a classificação da v14.3.50. Apenas injeta o roster
// ativo e substitui a regra local de dias pela normalização canônica. A troca é
// propositalmente independente da forma exata do bloco de Programações, pois
// versões posteriores podem reorganizar as linhas sem mudar a semântica.
const cockpitSignatureOld = `function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {`;
const cockpitSignatureNew = `function Cockpit({ roster, events, compliance, setView, onUpload, openMenu }: { roster: CrewRoster; events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {`;
if (!source.includes(cockpitSignatureNew)) {
  if (!source.includes(cockpitSignatureOld)) throw new Error('[v14387] assinatura do FlyDeck não localizada.');
  source = source.replace(cockpitSignatureOld, cockpitSignatureNew);
}

if (!source.includes('days: rosterCounters(roster).days,')) {
  const cockpitStart = source.indexOf(cockpitSignatureNew);
  const cockpitEnd = source.indexOf('function rosterCode(', cockpitStart);
  if (cockpitStart < 0 || cockpitEnd <= cockpitStart) throw new Error('[v14387] limites do FlyDeck não localizados.');
  const before = source.slice(0, cockpitStart);
  const cockpit = source.slice(cockpitStart, cockpitEnd);
  const after = source.slice(cockpitEnd);
  const patchedCockpit = cockpit.replace(
    /days:\s*new Set\(events\.map\(\((?:e|item)\)\s*=>\s*(?:e|item)\.day\.date\)\)\.size,/,
    'days: rosterCounters(roster).days,',
  );
  if (patchedCockpit === cockpit) {
    const counterIndex = cockpit.indexOf('const counters');
    const diagnostic = counterIndex >= 0 ? cockpit.slice(counterIndex, counterIndex + 700).replace(/\s+/g, ' ') : cockpit.slice(0, 700).replace(/\s+/g, ' ');
    throw new Error(`[v14387] contador local de dias do FlyDeck não localizado. Forma atual: ${diagnostic}`);
  }
  source = `${before}${patchedCockpit}${after}`;
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
  'days: rosterCounters(roster).days,',
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
