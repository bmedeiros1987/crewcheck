import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_POST_ANCHOR_RESIDUAL_GUARD';
const crewMarker = 'P0_580_ADJACENT_CREW_IDENTITY_GUARD';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

if (!source.includes(crewMarker)) {
  const oldAdjacent = `function adjacentRosterSummary(candidates: SavedRosterSummary[], current: Pick<SavedRosterSummary, 'year' | 'month'>, offset: -1 | 1): SavedRosterSummary | undefined {\n  const currentOrdinal = rosterPeriodOrdinal(current);\n  if (currentOrdinal === null) return undefined;\n  const targetOrdinal = currentOrdinal + offset;\n  return candidates\n    .filter((item) => rosterPeriodOrdinal(item) === targetOrdinal)\n    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];\n}`;
  const adjacentCount = source.split(oldAdjacent).length - 1;
  if (adjacentCount !== 1) throw new Error(`[${crewMarker}] adjacent roster selector count ${adjacentCount}, expected 1`);

  const newAdjacent = `function normalizeRosterCrewId(value?: string | null): string | null {\n  const normalized = String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');\n  return normalized || null;\n}\n\nfunction normalizeRosterCrewName(value?: string | null): string | null {\n  const normalized = String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');\n  return normalized || null;\n}\n\nfunction sameRosterCrew(a: Pick<SavedRosterSummary, 'crewId' | 'crewName'>, b: Pick<SavedRosterSummary, 'crewId' | 'crewName'>): boolean {\n  // ${crewMarker}: nominal adjacency is scoped to the same crew member. Prefer a\n  // verified crewId when both publications expose one; otherwise fall back to a\n  // normalized crewName. Missing identity on either side fails closed.\n  const aId = normalizeRosterCrewId(a.crewId);\n  const bId = normalizeRosterCrewId(b.crewId);\n  if (aId && bId) return aId === bId;\n  const aName = normalizeRosterCrewName(a.crewName);\n  const bName = normalizeRosterCrewName(b.crewName);\n  return Boolean(aName && bName && aName === bName);\n}\n\nfunction adjacentRosterSummary(candidates: SavedRosterSummary[], current: Pick<SavedRosterSummary, 'year' | 'month' | 'crewId' | 'crewName'>, offset: -1 | 1): SavedRosterSummary | undefined {\n  const currentOrdinal = rosterPeriodOrdinal(current);\n  if (currentOrdinal === null) return undefined;\n  const targetOrdinal = currentOrdinal + offset;\n  return candidates\n    .filter((item) => rosterPeriodOrdinal(item) === targetOrdinal && sameRosterCrew(current, item))\n    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];\n}`;
  source = source.replace(oldAdjacent, newAdjacent);
  console.log(`[crewcheck:prepare] applied ${crewMarker}`);
} else {
  console.log(`[crewcheck:prepare] ${crewMarker} already applied; validating structure`);
}

if (!source.includes(marker)) {
  const oldBlock = `  const residualDays = overlapFilteredNext.days || [];\n  let firstNext = null as (typeof nextAnchors)[number] | null;\n  for (const day of residualDays) {\n    const provenRetainedOverlap = dedupeAdjacentRosterDays(previousRoster.days || [], [day]).length === 0;\n    if (provenRetainedOverlap) continue;\n    const dayDate = parseCrewRosterDate(day.date);\n    if (!dayDate || isOffLikeLocalDay(day)) return null;\n    if (!(day.legs || []).length) return null;\n    if (!isOperationalLegChainVerifiable(day)) return null;\n    const anchor = nextAnchors.find((candidate) => candidate.day === day);\n    if (!anchor) return null;\n    const gap = dayGapLocal(last, anchor);\n    if (gap >= 0 && gap <= 3 && Boolean(anchor.origin && last.destination === anchor.origin)) {\n      firstNext = anchor;\n      break;\n    }\n    return null;\n  }\n  if (!firstNext) return null;`;

  const count = source.split(oldBlock).length - 1;
  if (count !== 1) throw new Error(`[${marker}] residual continuation anchor count ${count}, expected 1`);

  const newBlock = `  const residualDays = overlapFilteredNext.days || [];\n  let firstNext = null as (typeof nextAnchors)[number] | null;\n  let previousResidualAnchor = null as (typeof nextAnchors)[number] | null;\n  // ${marker}: validating only the first compatible residual anchor is insufficient.\n  // Every later residual activity must remain independently verifiable and physically\n  // continuous before the adjacent publication can be merged as a whole.\n  for (const day of residualDays) {\n    const provenRetainedOverlap = dedupeAdjacentRosterDays(previousRoster.days || [], [day]).length === 0;\n    if (provenRetainedOverlap) continue;\n    const dayDate = parseCrewRosterDate(day.date);\n    if (!dayDate || isOffLikeLocalDay(day)) return null;\n    if (!(day.legs || []).length) return null;\n    if (!isOperationalLegChainVerifiable(day)) return null;\n    const anchor = nextAnchors.find((candidate) => candidate.day === day);\n    if (!anchor) return null;\n    const predecessor = previousResidualAnchor || last;\n    const gap = dayGapLocal(predecessor, anchor);\n    if (gap < 0 || gap > 3 || !anchor.origin || !predecessor.destination || predecessor.destination !== anchor.origin) return null;\n    if (!firstNext) firstNext = anchor;\n    previousResidualAnchor = anchor;\n  }\n  if (!firstNext) return null;`;

  source = source.replace(oldBlock, newBlock);
  fs.writeFileSync(databasePath, source, 'utf8');
  console.log(`[crewcheck:prepare] applied ${marker}`);
} else {
  fs.writeFileSync(databasePath, source, 'utf8');
  console.log(`[crewcheck:prepare] ${marker} already applied; validating structure`);
}

const prepared = fs.readFileSync(databasePath, 'utf8');
for (const fragment of [
  marker,
  'let previousResidualAnchor = null',
  'const predecessor = previousResidualAnchor || last;',
  'predecessor.destination !== anchor.origin',
  'previousResidualAnchor = anchor;',
  crewMarker,
  "Pick<SavedRosterSummary, 'year' | 'month' | 'crewId' | 'crewName'>",
  'sameRosterCrew(current, item)',
]) {
  if (!prepared.includes(fragment)) throw new Error(`[${marker}] structural patch incomplete: missing ${fragment}`);
}

const start = prepared.indexOf('function continuationTailLocal(');
const end = prepared.indexOf('\nfunction mergeContinuousLocal(', start);
if (start < 0 || end < 0) throw new Error(`[${marker}] continuationTailLocal range not found`);
const block = prepared.slice(start, end);
if (block.includes('firstNext = anchor;\n      break;') || block.includes('firstNext = anchor;\n      break')) {
  throw new Error(`[${marker}] first-anchor break survived`);
}
