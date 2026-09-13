import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const homePath = 'client/src/pages/Home.tsx';
const marker = 'P0_530_ADJACENT_MONTH_DISPLAY_WINDOW';
const historyEvent = 'crewcheck:roster-history-updated';

for (const file of [databasePath, homePath]) {
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
    const opened = await openSavedRoster(adjacentSummary.id, adjacentSummary).catch(() => null);
    if (!opened?.roster?.days?.length) continue;
    if (crewIdentityToken(opened.roster) !== primaryCrew) continue;
    display = mergeRosterDisplayAdjacent(display, opened.roster, offset < 0 ? 'prepend' : 'append');
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

for (const fragment of [
  'openRosterDisplayWindow',
  'const [rosterWindow, setRosterWindow]',
  `window.addEventListener('${historyEvent}', refreshRosterWindow)`,
  'const rosterEvents = useMemo(() => buildLegs(rosterWindow)',
  'RosterLaunchView events={rosterEvents}',
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
console.log(`[${marker}] janela visual de competências adjacentes aplicada sem alterar o roster operacional.`);
