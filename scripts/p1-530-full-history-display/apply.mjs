import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P1_530_FULL_HISTORY_DISPLAY_WINDOW';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] databaseClient ausente`);
let source = fs.readFileSync(databasePath, 'utf8');
if (source.includes(marker)) {
  console.log(`[${marker}] já aplicado; repetição segura ignorada.`);
  process.exit(0);
}
if (!source.includes('P0_530_ADJACENT_MONTH_DISPLAY_WINDOW')) {
  throw new Error(`[${marker}] requer a janela visual #530 adjacente antes da ampliação histórica`);
}

const oldHelper = `async function openDisplayAdjacentCandidate(
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
}`;

const newHelper = `async function openDisplaySavedCandidate(
  preferred: SavedRosterSummary,
  primaryCrew: string,
): Promise<CrewRoster | null> {
  const wantedOrdinal = rosterPeriodOrdinal(preferred);
  if (wantedOrdinal === null) return null;
  const preferredOpened = await openSavedRoster(preferred.id, preferred).catch(() => null);
  if (preferredOpened?.roster?.days?.length
      && crewIdentityToken(preferredOpened.roster) === primaryCrew
      && rosterPeriodOrdinal(preferredOpened.roster) === wantedOrdinal) {
    return preferredOpened.roster;
  }

  // ${marker}: a failed remote detail must not make an older saved competence vanish.
  // Retry only a device-local publication for the exact same verified crew and nominal
  // competence. Never broaden by date overlap, id similarity, another crew or period.
  const localFallback = getLocalRosterSummaries(72)
    .filter((item) => crewIdentityToken(item) === primaryCrew && rosterPeriodOrdinal(item) === wantedOrdinal)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  if (!localFallback) return null;
  const localOpened = await openSavedRoster(localFallback.id, localFallback).catch(() => null);
  if (!localOpened?.roster?.days?.length) return null;
  if (crewIdentityToken(localOpened.roster) !== primaryCrew) return null;
  if (rosterPeriodOrdinal(localOpened.roster) !== wantedOrdinal) return null;
  return localOpened.roster;
}`;

if (!source.includes(oldHelper)) throw new Error(`[${marker}] helper adjacente esperado não localizado`);
source = source.replace(oldHelper, newHelper);

const oldLoop = `  const summaries = await listSavedRosters(72).catch(() => getLocalRosterSummaries(72));
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
  return { ...primary, days: display.days };`;

const newLoop = `  const summaries = await listSavedRosters(72).catch(() => getLocalRosterSummaries(72));
  const sameCrew = summaries.filter((item) => crewIdentityToken(item) === primaryCrew);
  const latestByPeriod = new Map<number, SavedRosterSummary>();
  for (const item of [...sameCrew].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))) {
    const ordinal = rosterPeriodOrdinal(item);
    if (ordinal === null || latestByPeriod.has(ordinal)) continue;
    latestByPeriod.set(ordinal, item);
  }
  let display = primary;

  for (const [ordinal, savedSummary] of [...latestByPeriod.entries()].sort((a, b) => a[0] - b[0])) {
    if (ordinal === primaryOrdinal) continue;
    const saved = await openDisplaySavedCandidate(savedSummary, primaryCrew);
    if (!saved?.days?.length) continue;
    display = mergeRosterDisplayAdjacent(display, saved, ordinal < primaryOrdinal ? 'prepend' : 'append');
  }

  // Keep primary metadata/rawText authoritative. Only the Escala display receives all
  // retained saved competences; operational consumers remain bound to bundle.roster.
  return { ...primary, days: display.days };`;

if (!source.includes(oldLoop)) throw new Error(`[${marker}] loop adjacente esperado não localizado`);
source = source.replace(oldLoop, newLoop);
source = source.replace(
  'This window only lets the Escala UI navigate adjacent saved competences.',
  `This window lets the Escala UI navigate retained saved competences. // ${marker}`,
);

for (const fragment of [
  marker,
  'async function openDisplaySavedCandidate(',
  'const latestByPeriod = new Map<number, SavedRosterSummary>();',
  'for (const [ordinal, savedSummary] of [...latestByPeriod.entries()].sort((a, b) => a[0] - b[0]))',
  "ordinal < primaryOrdinal ? 'prepend' : 'append'",
  'rosterPeriodOrdinal(item) === wantedOrdinal',
]) {
  if (!source.includes(fragment)) throw new Error(`[${marker}] contrato ausente após aplicação: ${fragment}`);
}
if (source.includes('for (const offset of [-1, 1] as const)')) {
  throw new Error(`[${marker}] janela ainda limitada a competências adjacentes`);
}

fs.writeFileSync(databasePath, source, 'utf8');
console.log(`[${marker}] histórico visual ampliado para todas as competências retidas do mesmo tripulante.`);
