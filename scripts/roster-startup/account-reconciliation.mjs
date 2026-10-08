import fs from 'node:fs';
const marker = '// account-active-reconciliation-fenced-v1';
let home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
if (!home.includes(marker)) {
  const startupImport = 'startupIntentRevision }';
  const lifecycle = '  useEffect(() => {\n    applyCrewCheckTheme();';
  if (!home.includes(startupImport) || !home.includes(lifecycle)) throw Error('Account reconciliation: guarded startup anchors missing');
  home = home.replace(startupImport, 'startupIntentRevision, captureAutomaticRosterGuard }');
  const bootstrapFence = '      const canCommit = () => alive && startupCanCommit(start,';
  if (!home.includes(bootstrapFence)) throw Error('Account reconciliation: bootstrap fence missing');
  home = home.replace(bootstrapFence, '      const bootstrapGuard = captureAutomaticRosterGuard();\n      const canCommit = () => alive && bootstrapGuard() && startupCanCommit(start,');
  const choicePayload = '{ owner: startupOwner(), roster, selection, sourceFileName: source, cacheSchema: ROSTER_CACHE_SCHEMA }';
  if (!home.includes(choicePayload)) throw Error('Account reconciliation: choice cache metadata missing');
  home = home.replace(choicePayload, "{ owner: startupOwner(), roster, selection, choiceIntent: selection === 'explicit' ? startupIntentRevision() : undefined, sourceFileName: source, cacheSchema: ROSTER_CACHE_SCHEMA }");
  home = "import { assertAutomaticRosterScope } from '@/lib/databaseClient';\n" + home;
  const effect = fs.readFileSync('scripts/roster-startup/account-reconciliation-effect.ts.txt', 'utf8');
  home = home.replace(lifecycle, '  ' + marker + '\n' + effect + '\n' + lifecycle);
  fs.writeFileSync('client/src/pages/Home.tsx', home);
}

let database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
if (!database.includes(marker)) {
  const start = database.indexOf('export async function openActiveRoster():');
  const end = database.indexOf('\nfunction parseCrewRosterDate(', start);
  if (start < 0 || end < 0) throw Error('Account reconciliation: active reader anchors missing');
  let reader = database.slice(start, end);
  const anchors = [
    ['openActiveRoster():', 'openActiveRoster(options: { requireRemote?: boolean } = {}):'],
    ["    if (payload?.data?.roster?.days?.length) {", "    if (options.requireRemote && payload?.ok !== true) throw new Error('ACTIVE_ROSTER_REMOTE_REQUIRED');\n    if (payload?.data?.roster?.days?.length) {"],
    ["      if (reconciliation.decision === 'use-local' && local?.id) {", "      if (reconciliation.decision === 'use-local' && local?.id) {\n        if (options.requireRemote) throw new Error('ACTIVE_ROSTER_REMOTE_REQUIRED');"],
    ['      const reconciled = remoteSummary', '      if (options.requireRemote) return { ...remoteData, summary: payload.roster || remoteSummary };\n      const reconciled = remoteSummary'],
    ['  } catch (error: any) {', '  } catch (error: any) {\n    if (options.requireRemote) throw error;'],
  ];
  for (const [before, after] of anchors) {
    if (!reader.includes(before)) throw Error('Account reconciliation: verified reader anchor missing: ' + before);
    reader = reader.replace(before, after);
  }
  database = database.slice(0, start) + marker + '\n' + reader + database.slice(end);
  // Reuse canonical identity checks without inventing identity for legacy bodies.
  // The authenticated account is mandatory; known crew identities must agree.
  database += `\nexport function assertAutomaticRosterScope(remote: CrewRoster, current: CrewRoster, summary?: SavedRosterSummary | null): void {
  const year = Number(current.year), month = Number(current.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12
    || Number(remote.year) !== year || Number(remote.month) !== month) throw new Error('ROSTER_PERIOD_MISMATCH');
  const localCrew = crewIdentityToken(current), remoteCrew = crewIdentityToken(remote);
  if ((localCrew || remoteCrew) && localCrew !== remoteCrew) throw new Error('ACTIVE_ROSTER_CREW_MISMATCH');
  const summaryCrew = crewIdentityToken(summary);
  if (summaryCrew && summaryCrew !== remoteCrew) throw new Error('ACTIVE_ROSTER_CREW_MISMATCH');
}\n`;
  fs.writeFileSync('client/src/lib/databaseClient.ts', database);
}
