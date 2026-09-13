import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const homePath = 'client/src/pages/Home.tsx';
const rosterViewPath = 'client/src/components/v1391/RosterLaunchView.tsx';
const marker = 'P0_530_ADJACENT_MONTH_DISPLAY_WINDOW';
const historyEvent = 'crewcheck:roster-history-updated';

for (const file of [databasePath, homePath, rosterViewPath]) {
  if (!fs.existsSync(file)) throw new Error(`[${marker}] arquivo ausente: ${file}`);
}

let database = fs.readFileSync(databasePath, 'utf8');
if (!database.includes('P0_580_OVERLAP_ACTIVITY_DEDUPE')) {
  throw new Error(`[${marker}] requer o guard count-aware #580 antes da janela visual`);
}

if (!database.includes(marker)) {
  const anchor = '\nexport async function deleteRosterAnalysis(';
  if (!database.includes(anchor)) throw new Error(`[${marker}] âncora de databaseClient ausente`);

  const block = `
// ${marker}: monthly publication retention is a DISPLAY concern, not an
// operational-continuity proof. The operational active roster remains sovereign for
// current/next, compliance, finance, alarms, Radar and every other operational
// consumer. This window only lets the Escala UI navigate adjacent saved competences.
function mergeRosterDisplayAdjacent(primary: CrewRoster, adjacent: CrewRoster, position: 'prepend' | 'append'): CrewRoster {
  const adjacentDays = dedupeAdjacentRosterDays(primary.days || [], adjacent.days || []);
  const days = position === 'prepend'
    ? [...adjacentDays, ...(primary.days || [])]
    : [...(primary.days || []), ...adjacentDays];
  days.sort((a, b) => (parseCrewRosterDate(a.date)?.getTime() || 0) - (parseCrewRosterDate(b.date)?.getTime() || 0));
  return { ...primary, days };
}

async function openDisplayAdjacentCandidate(
  primary: CrewRoster,
  preferred: SavedRosterSummary,
  offset: -1 | 1,
  primaryCrew: string,
): Promise<CrewRoster | null> {
  const preferredOpened = await openSavedRoster(preferred.id, preferred).catch(() => null);
  if (preferredOpened?.roster?.days?.length && crewIdentityToken(preferredOpened.roster) === primaryCrew) {
    return preferredOpened.roster;
  }

  // #663: a newer remote summary can legitimately win listSavedRosters() while its
  // detail endpoint is temporarily unavailable. In that case, retry ONLY a device
  // local publication for the same nominal competence and the same verified crew.
  // Never broaden by id, adjacent date, another crew member or another period.
  const localSameCrew = getLocalRosterSummaries(72).filter((item) => crewIdentityToken(item) === primaryCrew);
  const localFallback = adjacentRosterSummary(localSameCrew, primary, offset);
  if (!localFallback) return null;
  const localOpened = await openSavedRoster(localFallback.id, localFallback).catch(() => null);
  if (!localOpened?.roster?.days?.length) return null;
  if (crewIdentityToken(localOpened.roster) !== primaryCrew) return null;
  const wantedOrdinal = (rosterPeriodOrdinal(primary) ?? Number.NaN) + offset;
  if (rosterPeriodOrdinal(localOpened.roster) !== wantedOrdinal) return null;
  return localOpened.roster;
}

export async function openRosterDisplayWindow(primary: CrewRoster): Promise<CrewRoster> {
  const primaryCrew = crewIdentityToken(primary);
  const primaryOrdinal = rosterPeriodOrdinal(primary);
  if (!primaryCrew || primaryOrdinal === null || !Array.isArray(primary.days) || !primary.days.length) return primary;

  const summaries = await listSavedRosters(72).catch(() => getLocalRosterSummaries(72));
  const sameCrew = summaries.filter((item) => crewIdentityToken(item) === primaryCrew);
  let display = primary;

  for (const offset of [-1, 1] as const) {
    const adjacentSummary = adjacentRosterSummary(sameCrew, primary, offset);
    if (!adjacentSummary) continue;
    const adjacent = await openDisplayAdjacentCandidate(primary, adjacentSummary, offset, primaryCrew);
    if (!adjacent?.days?.length) continue;
    display = mergeRosterDisplayAdjacent(display, adjacent, offset < 0 ? 'prepend' : 'append');
  }

  // Keep primary metadata/rawText authoritative. Only the day window is expanded.
  return { ...primary, days: display.days };
}
`;
  database = database.replace(anchor, `${block}${anchor}`);

  const localSaveAnchor = '  const localSummary = persistRosterHistoryLocally(payload);';
  if (!database.includes(localSaveAnchor)) throw new Error(`[${marker}] persistência mensal preparada não localizada`);
  database = database.replace(
    localSaveAnchor,
    `${localSaveAnchor}\n  try { window.dispatchEvent(new CustomEvent('${historyEvent}')); } catch {}`,
  );
}

for (const fragment of [
  marker,
  'export async function openRosterDisplayWindow(primary: CrewRoster)',
  'openDisplayAdjacentCandidate(primary, adjacentSummary, offset, primaryCrew)',
  'getLocalRosterSummaries(72).filter((item) => crewIdentityToken(item) === primaryCrew)',
  'rosterPeriodOrdinal(localOpened.roster) !== wantedOrdinal',
  'dedupeAdjacentRosterDays(primary.days || [], adjacent.days || [])',
  'const sameCrew = summaries.filter((item) => crewIdentityToken(item) === primaryCrew)',
  `window.dispatchEvent(new CustomEvent('${historyEvent}'))`,
]) {
  if (!database.includes(fragment)) throw new Error(`[${marker}] contrato de database ausente: ${fragment}`);
}
fs.writeFileSync(databasePath, database, 'utf8');

let home = fs.readFileSync(homePath, 'utf8');

if (!home.includes('openRosterDisplayWindow')) {
  const importAnchor = "import { saveRosterAnalysis, listSavedRosters, openSavedRoster, openActiveRoster, getDatabaseStatus } from '@/lib/databaseClient';";
  if (!home.includes(importAnchor)) throw new Error(`[${marker}] import databaseClient da Home não localizado`);
  home = home.replace(
    importAnchor,
    "import { saveRosterAnalysis, listSavedRosters, openSavedRoster, openActiveRoster, openRosterDisplayWindow, getDatabaseStatus } from '@/lib/databaseClient';",
  );
}

if (!home.includes('const [rosterWindow, setRosterWindow]')) {
  const stateAnchor = '  const [bundle, setBundle] = useState<BundleState>(loadRoster());';
  if (!home.includes(stateAnchor)) throw new Error(`[${marker}] state do bundle não localizado`);
  const stateBlock = `${stateAnchor}
  const [rosterWindow, setRosterWindow] = useState<CrewRoster>(() => bundle.roster);
  useEffect(() => {
    let alive = true;
    const refreshRosterWindow = () => {
      const primary = bundle.roster;
      setRosterWindow(primary);
      void openRosterDisplayWindow(primary)
        .then((windowRoster) => { if (alive) setRosterWindow(windowRoster); })
        .catch(() => { if (alive) setRosterWindow(primary); });
    };
    refreshRosterWindow();
    window.addEventListener('${historyEvent}', refreshRosterWindow);
    return () => {
      alive = false;
      window.removeEventListener('${historyEvent}', refreshRosterWindow);
    };
  }, [bundle.roster]);`;
  home = home.replace(stateAnchor, stateBlock);
}

if (!home.includes('const rosterEvents = useMemo(() => buildLegs(rosterWindow)')) {
  const eventsPattern = /(  const events = useMemo\(\(\) => buildLegs\(bundle\.roster\)[^\n]*\n?)/;
  const match = home.match(eventsPattern);
  if (!match) throw new Error(`[${marker}] declaração de events operacionais não localizada`);
  home = home.replace(eventsPattern, `${match[1]}  const rosterEvents = useMemo(() => buildLegs(rosterWindow), [rosterWindow]);\n`);
}

if (!home.includes('RosterLaunchView events={rosterEvents}')) {
  const rosterPattern = /<RosterLaunchView\s+events=\{events\}(\s+finance=\{financeSnapshot\(bundle\.roster\)\})?\s+setView=\{setView\}\s*\/>/;
  if (!rosterPattern.test(home)) throw new Error(`[${marker}] render da Escala não localizado`);
  home = home.replace(rosterPattern, (_all, finance = '') => `<RosterLaunchView events={rosterEvents}${finance} setView={setView}/>`);
}

// #663: financeSnapshot(bundle.roster) remains sovereign, but the view must know
// which competence that snapshot actually represents so an adjacent visual month
// cannot present empty rows as a legitimate R$ 0,00 result.
if (!home.includes('financeMonth={')) {
  const rosterAnchor = '<RosterLaunchView events={rosterEvents} finance={financeSnapshot(bundle.roster)} setView={setView}/>';
  if (!home.includes(rosterAnchor)) throw new Error(`[${marker}] render financeiro da Escala não localizado`);
  home = home.replace(
    rosterAnchor,
    "<RosterLaunchView events={rosterEvents} finance={financeSnapshot(bundle.roster)} financeMonth={Number(bundle.roster.year) && Number(bundle.roster.month) ? `${bundle.roster.year}-${String(bundle.roster.month).padStart(2, '0')}` : undefined} setView={setView}/>",
  );
}

for (const fragment of [
  'openRosterDisplayWindow',
  'const [rosterWindow, setRosterWindow]',
  `window.addEventListener('${historyEvent}', refreshRosterWindow)`,
  'const rosterEvents = useMemo(() => buildLegs(rosterWindow)',
  'RosterLaunchView events={rosterEvents}',
  'financeMonth={Number(bundle.roster.year)',
]) {
  if (!home.includes(fragment)) throw new Error(`[${marker}] contrato da Home ausente: ${fragment}`);
}

// Fail closed against accidental operational contamination.
if (!/const events = useMemo\(\(\) => buildLegs\(bundle\.roster\)/.test(home)) {
  throw new Error(`[${marker}] events operacionais deixaram de usar bundle.roster`);
}
if (!home.includes('finance={financeSnapshot(bundle.roster)}')) {
  throw new Error(`[${marker}] finanças da Escala deixaram de usar bundle.roster`);
}

fs.writeFileSync(homePath, home, 'utf8');

let rosterView = fs.readFileSync(rosterViewPath, 'utf8');
if (!rosterView.includes('financeMonth?: string')) {
  const signature = 'export default function RosterLaunchView({ events, finance, setView }: { events: RosterEvent[]; finance?: RosterFinance; setView: (view: any) => void }) {';
  if (!rosterView.includes(signature)) throw new Error(`[${marker}] assinatura RosterLaunchView não localizada`);
  rosterView = rosterView.replace(
    signature,
    'export default function RosterLaunchView({ events, finance, financeMonth, setView }: { events: RosterEvent[]; finance?: RosterFinance; financeMonth?: string; setView: (view: any) => void }) {',
  );
}

if (!rosterView.includes('const financeAvailable = !financeMonth || selectedMonth === financeMonth;')) {
  const orderedAnchor = '  const ordered = useMemo(() => allOrdered.filter((event) => monthOf(event) === selectedMonth), [allOrdered, selectedMonth]);';
  if (!rosterView.includes(orderedAnchor)) throw new Error(`[${marker}] seleção mensal da Escala não localizada`);
  rosterView = rosterView.replace(
    orderedAnchor,
    `${orderedAnchor}\n  const financeAvailable = !financeMonth || selectedMonth === financeMonth;\n  const scopedFinance = financeAvailable ? finance : undefined;`,
  );
  rosterView = rosterView.replace('  const salaryRows = finance?.salary?.rows || [];', '  const salaryRows = scopedFinance?.salary?.rows || [];');
  rosterView = rosterView.replace('  const perDiemRows = finance?.perdiem?.rows || [];', '  const perDiemRows = scopedFinance?.perdiem?.rows || [];');
  rosterView = rosterView.replace("<strong>{money(perDiemTotal)}</strong>", "<strong>{financeAvailable ? money(perDiemTotal) : 'Indisponível'}</strong>");
  rosterView = rosterView.replace("<small>{pendingCurrencies.length ? `Câmbio pendente: ${pendingCurrencies.join(', ')}` : 'Café e refeições elegíveis'}</small>", "<small>{financeAvailable ? (pendingCurrencies.length ? `Câmbio pendente: ${pendingCurrencies.join(', ')}` : 'Café e refeições elegíveis') : 'Financeiro disponível somente para a competência operacional ativa'}</small>");
  rosterView = rosterView.replace("<strong>{finance?.salary?.configured ? money(production) : 'Calibrar tarifa'}</strong>", "<strong>{financeAvailable ? (scopedFinance?.salary?.configured ? money(production) : 'Calibrar tarifa') : 'Indisponível'}</strong>");
  rosterView = rosterView.replace("<small>{totalKm.toLocaleString('pt-BR')} km estimados no mês</small>", "<small>{financeAvailable ? `${totalKm.toLocaleString('pt-BR')} km estimados no mês` : 'Selecione a competência operacional ativa para ver a memória financeira'}</small>");
  rosterView = rosterView.replaceAll('finance?.salary?.configured', 'scopedFinance?.salary?.configured');
}

for (const fragment of [
  'financeMonth?: string',
  'const financeAvailable = !financeMonth || selectedMonth === financeMonth;',
  'const scopedFinance = financeAvailable ? finance : undefined;',
  "financeAvailable ? money(perDiemTotal) : 'Indisponível'",
  "financeAvailable ? (scopedFinance?.salary?.configured ? money(production) : 'Calibrar tarifa') : 'Indisponível'",
]) {
  if (!rosterView.includes(fragment)) throw new Error(`[${marker}] contrato financeiro #663 ausente: ${fragment}`);
}
fs.writeFileSync(rosterViewPath, rosterView, 'utf8');

console.log(`[${marker}] janela visual de competências adjacentes aplicada sem alterar o roster operacional; fallback local e escopo financeiro #663 ativos.`);
