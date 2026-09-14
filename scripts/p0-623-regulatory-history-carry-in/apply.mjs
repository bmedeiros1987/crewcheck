import fs from 'node:fs';

const compliancePath = 'client/src/lib/complianceEngine.ts';
const databasePath = 'client/src/lib/databaseClient.ts';
const rollingPath = 'client/src/lib/rollingFlightHours.ts';
const homePath = 'client/src/pages/Home.tsx';
const marker = 'P0_623_REGULATORY_HISTORY_CARRY_IN';

for (const file of [compliancePath, databasePath, rollingPath, homePath]) {
  if (!fs.existsSync(file)) throw new Error(`[${marker}] arquivo ausente: ${file}`);
}

let rolling = fs.readFileSync(rollingPath, 'utf8');
if (!rolling.includes('ROLLING_FLIGHT_HOURS_KERNEL_VERSION')) {
  rolling = `export const ROLLING_FLIGHT_HOURS_KERNEL_VERSION = '605.1';\n\n${rolling}`;
}
if (!rolling.includes("export const ROLLING_FLIGHT_HOURS_KERNEL_VERSION = '605.1';")) {
  throw new Error(`[${marker}] versão do kernel rolling 28d ausente`);
}
fs.writeFileSync(rollingPath, rolling, 'utf8');

let compliance = fs.readFileSync(compliancePath, 'utf8');
if (!compliance.includes(marker)) {
  const signature = "export function analyzeCompliance(roster: CrewRoster, roleSelection: CrewRoleSelection = 'auto'): ComplianceResult {";
  if (!compliance.includes(signature)) throw new Error(`[${marker}] assinatura analyzeCompliance não localizada`);
  compliance = compliance.replace(
    signature,
    `// ${marker}: regulatory history may feed ONLY the rolling flight-hours evidence.\n// It must never inflate active-competence duty, days off, ground time or other KPIs.\nexport function analyzeCompliance(roster: CrewRoster, roleSelection: CrewRoleSelection = 'auto', regulatoryHistory: CrewRoster[] = []): ComplianceResult {`,
  );

  const observationAnchor = `  const flightHoursObservations: FlightHoursObservation[] = [];`;
  if (!compliance.includes(observationAnchor)) throw new Error(`[${marker}] âncora de observações não localizada`);
  compliance = compliance.replace(
    observationAnchor,
    `  const flightHoursObservations: FlightHoursObservation[] = [];\n  for (const historicalRoster of regulatoryHistory || []) {\n    for (const historicalDay of sortDays(historicalRoster?.days || [])) {\n      flightHoursObservations.push({\n        date: String(historicalDay.date || ''),\n        hours: getFlightHours(historicalDay),\n      });\n    }\n  }`,
  );
}

for (const fragment of [
  marker,
  "regulatoryHistory: CrewRoster[] = []",
  'for (const historicalRoster of regulatoryHistory || [])',
  'hours: getFlightHours(historicalDay)',
]) {
  if (!compliance.includes(fragment)) throw new Error(`[${marker}] contrato compliance ausente: ${fragment}`);
}
fs.writeFileSync(compliancePath, compliance, 'utf8');

let database = fs.readFileSync(databasePath, 'utf8');
if (!database.includes(marker)) {
  const importAnchor = "import type { ComplianceResult, GymRecommendation } from './complianceEngine';";
  if (!database.includes(importAnchor)) throw new Error(`[${marker}] import complianceEngine não localizado`);
  database = database.replace(
    importAnchor,
    `import { analyzeCompliance, type ComplianceResult, type GymRecommendation } from './complianceEngine';\nimport type { CrewRoleSelection } from './actRules';\nimport { ROLLING_FLIGHT_HOURS_KERNEL_VERSION } from './rollingFlightHours';`,
  );

  const insertionAnchor = `\nexport async function deleteRosterAnalysis(`;
  if (!database.includes(insertionAnchor)) throw new Error(`[${marker}] âncora antes de deleteRosterAnalysis não localizada`);

  const block = `
// ${marker}: unlike listSavedRosters(), regulatory history lookup must not silently
// collapse a network/auth failure into local fallback. Completeness is a legal-data
// provenance statement, so unavailable account history stays fail-closed.
export type RegulatoryHistorySource = 'account' | 'network_error' | 'unauthenticated' | 'identity_unverified';
export const REGULATORY_HISTORY_SNAPSHOT_VERSION = '1';

export type RegulatoryHistoryRecompute = {
  compliance: ComplianceResult;
  history: {
    complete: boolean;
    source: RegulatoryHistorySource;
    previousPeriodFound: boolean;
    previousRosterId?: string | null;
  };
};

type RegulatoryHistorySnapshot = {
  snapshotVersion: string;
  kernelVersion: string;
  fingerprint: string;
  savedAt: string;
  previousRosterId: string;
  complete: boolean;
  compliance: ComplianceResult;
};

function previousRosterPeriod(roster: Pick<CrewRoster, 'year' | 'month'>): { year: number; month: number } | null {
  const ordinal = rosterPeriodOrdinal(roster);
  if (ordinal === null) return null;
  const previous = ordinal - 1;
  return { year: Math.floor(previous / 12), month: (previous % 12) + 1 };
}

function complianceHasIncompleteRollingHistory(result: ComplianceResult): boolean {
  return (result.alerts || []).some((alert) => /28 dias.*incompleta/i.test(String(alert?.title || '')));
}

function regulatoryRosterSignature(roster: CrewRoster): unknown {
  return {
    crew: crewIdentityToken(roster),
    year: Number(roster.year || 0),
    month: Number(roster.month || 0),
    base: String(roster.base || ''),
    rank: String(roster.rank || ''),
    airline: String(roster.airline || ''),
    // Aircraft legal-profile inference consumes rawText as a fallback, so it is a
    // first-class fingerprint input rather than incidental display text.
    rawText: String(roster.rawText || ''),
    days: (roster.days || []).map((day) => ({
      date: String(day.date || ''),
      type: String(day.type || ''),
      pairingCode: String(day.pairingCode || ''),
      dutyReport: String(day.dutyReport || ''),
      dutyDebrief: String(day.dutyDebrief || ''),
      legs: (day.legs || []).map((leg: any) => ({
        flightNumber: String(leg.flightNumber || ''),
        origin: String(leg.origin || ''),
        destination: String(leg.destination || ''),
        departureTime: String(leg.departureTime || ''),
        arrivalTime: String(leg.arrivalTime || ''),
        duration: Number(leg.duration || 0),
        isNextDay: Boolean(leg.isNextDay),
        aircraftType: String(leg.aircraftType || ''),
      })),
    })),
  };
}

function stableRegulatoryHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function regulatoryHistoryFingerprint(primary: CrewRoster, previous: CrewRoster): string {
  return 'fnv1a:' + stableRegulatoryHash({
    kernelVersion: ROLLING_FLIGHT_HOURS_KERNEL_VERSION,
    primary: regulatoryRosterSignature(primary),
    previous: regulatoryRosterSignature(previous),
  });
}

function regulatoryHistorySnapshotKey(roster: CrewRoster, crew: string): string {
  const scope = safeStorageScope().replace(/[^a-z0-9_-]+/gi, '_');
  const crewKey = crew.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return 'crewcheck_regulatory_history_snapshot_' + scope + '_' + crewKey + '_' + String(Number(roster.year || 0)) + '-' + String(Number(roster.month || 0)).padStart(2, '0');
}

function readRegulatoryHistorySnapshot(key: string): RegulatoryHistorySnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed as RegulatoryHistorySnapshot : null;
  } catch {
    return null;
  }
}

function writeRegulatoryHistorySnapshot(key: string, value: RegulatoryHistorySnapshot): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export async function recomputeComplianceWithRegulatoryHistory(
  roster: CrewRoster,
  roleSelection: CrewRoleSelection = 'auto',
): Promise<RegulatoryHistoryRecompute> {
  const withoutHistory = () => analyzeCompliance(roster, roleSelection);
  const primaryCrew = crewIdentityToken(roster);
  const previousPeriod = previousRosterPeriod(roster);
  if (!primaryCrew || !previousPeriod) {
    return {
      compliance: withoutHistory(),
      history: { complete: false, source: 'identity_unverified', previousPeriodFound: false },
    };
  }
  if (!hasCrewCheckAuthToken()) {
    return {
      compliance: withoutHistory(),
      history: { complete: false, source: 'unauthenticated', previousPeriodFound: false },
    };
  }

  let accountSummaries: SavedRosterSummary[];
  try {
    // The account probe is intentionally performed on every new roster identity.
    // A local snapshot may accelerate analysis but never proves account history.
    const payload = await jsonFetch<{ ok: boolean; rosters: SavedRosterSummary[] }>('/api/rosters?limit=72&manager=1', { cache: 'no-store' });
    accountSummaries = Array.isArray(payload?.rosters) ? payload.rosters : [];
  } catch {
    return {
      compliance: withoutHistory(),
      history: { complete: false, source: 'network_error', previousPeriodFound: false },
    };
  }

  const candidates = [...accountSummaries, ...getLocalRosterSummaries(72)]
    .filter((item) => crewIdentityToken(item) === primaryCrew)
    .filter((item) => Number(item.year) === previousPeriod.year && Number(item.month) === previousPeriod.month)
    .sort((a, b) => Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const previousSummary = candidates[0];
  if (!previousSummary) {
    const complianceResult = withoutHistory();
    return {
      compliance: complianceResult,
      history: { complete: false, source: 'account', previousPeriodFound: false },
    };
  }

  let previousRoster: CrewRoster | null = null;
  try {
    previousRoster = (await openSavedRoster(previousSummary.id, previousSummary)).roster;
  } catch {
    const complianceResult = withoutHistory();
    return {
      compliance: complianceResult,
      history: { complete: false, source: 'network_error', previousPeriodFound: true, previousRosterId: previousSummary.id },
    };
  }

  if (!previousRoster || crewIdentityToken(previousRoster) !== primaryCrew) {
    const complianceResult = withoutHistory();
    return {
      compliance: complianceResult,
      history: { complete: false, source: 'identity_unverified', previousPeriodFound: true, previousRosterId: previousSummary.id },
    };
  }

  const fingerprint = regulatoryHistoryFingerprint(roster, previousRoster);
  const snapshotKey = regulatoryHistorySnapshotKey(roster, primaryCrew);
  const cached = readRegulatoryHistorySnapshot(snapshotKey);
  if (
    cached
    && cached.snapshotVersion === REGULATORY_HISTORY_SNAPSHOT_VERSION
    && cached.kernelVersion === ROLLING_FLIGHT_HOURS_KERNEL_VERSION
    && cached.fingerprint === fingerprint
    && cached.previousRosterId === previousSummary.id
    && cached.compliance
  ) {
    return {
      compliance: cached.compliance,
      history: {
        complete: Boolean(cached.complete),
        source: 'account',
        previousPeriodFound: true,
        previousRosterId: previousSummary.id,
      },
    };
  }

  const complianceResult = analyzeCompliance(roster, roleSelection, [previousRoster]);
  const complete = !complianceHasIncompleteRollingHistory(complianceResult);
  writeRegulatoryHistorySnapshot(snapshotKey, {
    snapshotVersion: REGULATORY_HISTORY_SNAPSHOT_VERSION,
    kernelVersion: ROLLING_FLIGHT_HOURS_KERNEL_VERSION,
    fingerprint,
    savedAt: new Date().toISOString(),
    previousRosterId: previousSummary.id,
    complete,
    compliance: complianceResult,
  });
  return {
    compliance: complianceResult,
    history: {
      complete,
      source: 'account',
      previousPeriodFound: true,
      previousRosterId: previousSummary.id,
    },
  };
}
`;
  database = database.replace(insertionAnchor, `${block}${insertionAnchor}`);
}

for (const fragment of [
  marker,
  'export async function recomputeComplianceWithRegulatoryHistory(',
  "source: 'network_error'",
  "source: 'unauthenticated'",
  'analyzeCompliance(roster, roleSelection, [previousRoster])',
  '/api/rosters?limit=72&manager=1',
  'REGULATORY_HISTORY_SNAPSHOT_VERSION',
  'ROLLING_FLIGHT_HOURS_KERNEL_VERSION',
  'aircraftType: String(leg.aircraftType ||',
  'rawText: String(roster.rawText ||',
  'regulatoryHistoryFingerprint(roster, previousRoster)',
]) {
  if (!database.includes(fragment)) throw new Error(`[${marker}] contrato database ausente: ${fragment}`);
}
fs.writeFileSync(databasePath, database, 'utf8');

let home = fs.readFileSync(homePath, 'utf8');
if (!home.includes('recomputeComplianceWithRegulatoryHistory')) {
  const importMatch = home.match(/^import \{[^\n]+\} from '@\/lib\/databaseClient';$/m)?.[0];
  if (!importMatch) throw new Error(`[${marker}] import databaseClient da Home não localizado`);
  const expandedImport = importMatch.replace(' } from', ', recomputeComplianceWithRegulatoryHistory } from');
  home = home.replace(importMatch, expandedImport);

  const stateAnchor = '  const [bundle, setBundle] = useState<BundleState>(loadRoster());';
  if (!home.includes(stateAnchor)) throw new Error(`[${marker}] state do bundle não localizado`);
  const effect = `${stateAnchor}
  useEffect(() => {
    // ${marker}: every imported/opened/remote-active roster already becomes
    // bundle.roster. Refine only its compliance asynchronously from proven account
    // history, and reject stale completions if the active roster changed meanwhile.
    let alive = true;
    const primary = bundle.roster;
    void recomputeComplianceWithRegulatoryHistory(primary)
      .then((result) => {
        if (!alive) return;
        setBundle((current) => current.roster === primary ? { ...current, compliance: result.compliance } : current);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [bundle.roster]);`;
  home = home.replace(stateAnchor, effect);
}

for (const fragment of [
  'recomputeComplianceWithRegulatoryHistory',
  'recomputeComplianceWithRegulatoryHistory(primary)',
  'setBundle((current) => current.roster === primary ? { ...current, compliance: result.compliance } : current)',
  '}, [bundle.roster]);',
]) {
  if (!home.includes(fragment)) throw new Error(`[${marker}] contrato Home ausente: ${fragment}`);
}
fs.writeFileSync(homePath, home, 'utf8');

console.log(`[${marker}] carry-in, snapshot versionado/fingerprint e Home aplicados sem trocar o roster operacional.`);
