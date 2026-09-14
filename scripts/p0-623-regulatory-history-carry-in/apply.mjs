import fs from 'node:fs';

const compliancePath = 'client/src/lib/complianceEngine.ts';
const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_623_REGULATORY_HISTORY_CARRY_IN';

for (const file of [compliancePath, databasePath]) {
  if (!fs.existsSync(file)) throw new Error(`[${marker}] arquivo ausente: ${file}`);
}

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
    `import { analyzeCompliance, type ComplianceResult, type GymRecommendation } from './complianceEngine';\nimport type { CrewRoleSelection } from './actRules';`,
  );

  const insertionAnchor = `\nexport async function deleteRosterAnalysis(`;
  if (!database.includes(insertionAnchor)) throw new Error(`[${marker}] âncora antes de deleteRosterAnalysis não localizada`);

  const block = `
// ${marker}: unlike listSavedRosters(), regulatory history lookup must not silently
// collapse a network/auth failure into local fallback. Completeness is a legal-data
// provenance statement, so unavailable account history stays fail-closed.
export type RegulatoryHistorySource = 'account' | 'network_error' | 'unauthenticated' | 'identity_unverified';

export type RegulatoryHistoryRecompute = {
  compliance: ComplianceResult;
  history: {
    complete: boolean;
    source: RegulatoryHistorySource;
    previousPeriodFound: boolean;
    previousRosterId?: string | null;
  };
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
    const payload = await jsonFetch<{ ok: boolean; rosters: SavedRosterSummary[] }>(`/api/rosters?limit=72&manager=1`, { cache: 'no-store' });
    accountSummaries = Array.isArray(payload?.rosters) ? payload.rosters : [];
  } catch {
    return {
      compliance: withoutHistory(),
      history: { complete: false, source: 'network_error', previousPeriodFound: false },
    };
  }

  // An online account lookup succeeded, so a device-local copy may safely serve as
  // the bytes for the exact previous publication. The success of the account probe
  // is what distinguishes this from a silent offline fallback.
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

  const complianceResult = analyzeCompliance(roster, roleSelection, [previousRoster]);
  return {
    compliance: complianceResult,
    history: {
      complete: !complianceHasIncompleteRollingHistory(complianceResult),
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
]) {
  if (!database.includes(fragment)) throw new Error(`[${marker}] contrato database ausente: ${fragment}`);
}
fs.writeFileSync(databasePath, database, 'utf8');

console.log(`[${marker}] carry-in regulatório da competência anterior aplicado de forma fail-closed.`);
