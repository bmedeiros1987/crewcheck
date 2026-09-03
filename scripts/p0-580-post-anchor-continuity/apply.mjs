import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_POST_ANCHOR_RESIDUAL_GUARD';
const crewMarker = 'P0_580_ADJACENT_CREW_IDENTITY_GUARD';
const remoteCrewMarker = 'P0_580_REMOTE_CREW_IDENTITY_ENRICHMENT';
const crewSentinelMarker = 'P0_580_CREW_IDENTITY_SENTINEL_GUARD';
const remoteCrewBindingMarker = 'P0_580_REMOTE_CREW_BODY_BINDING';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

if (!source.includes(crewMarker)) {
  const oldAdjacent = `function adjacentRosterSummary(candidates: SavedRosterSummary[], current: Pick<SavedRosterSummary, 'year' | 'month'>, offset: -1 | 1): SavedRosterSummary | undefined {\n  const currentOrdinal = rosterPeriodOrdinal(current);\n  if (currentOrdinal === null) return undefined;\n  const targetOrdinal = currentOrdinal + offset;\n  return candidates\n    .filter((item) => rosterPeriodOrdinal(item) === targetOrdinal)\n    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];\n}`;
  const adjacentCount = source.split(oldAdjacent).length - 1;
  if (adjacentCount !== 1) throw new Error(`[${crewMarker}] adjacent roster selector count ${adjacentCount}, expected 1`);

  const newAdjacent = `function sameRosterCrew(a: Pick<SavedRosterSummary, 'crewId' | 'crewName'>, b: Pick<SavedRosterSummary, 'crewId' | 'crewName'>): boolean {\n  // ${crewMarker}: nominal adjacency is scoped to the same crew member. Prefer a\n  // verified crewId when both publications expose one; otherwise fall back to a\n  // normalized crewName. Missing identity on either side fails closed.\n  const aId = normalizeRosterCrewId(a.crewId);\n  const bId = normalizeRosterCrewId(b.crewId);\n  if (aId && bId) return aId === bId;\n  const aName = normalizeRosterCrewName(a.crewName);\n  const bName = normalizeRosterCrewName(b.crewName);\n  return Boolean(aName && bName && aName === bName);\n}\n\nfunction adjacentRosterSummary(candidates: SavedRosterSummary[], current: Pick<SavedRosterSummary, 'year' | 'month' | 'crewId' | 'crewName'>, offset: -1 | 1): SavedRosterSummary | undefined {\n  const currentOrdinal = rosterPeriodOrdinal(current);\n  if (currentOrdinal === null) return undefined;\n  const targetOrdinal = currentOrdinal + offset;\n  return candidates\n    .filter((item) => rosterPeriodOrdinal(item) === targetOrdinal && sameRosterCrew(current, item))\n    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];\n}`;
  source = source.replace(oldAdjacent, newAdjacent);
  console.log(`[crewcheck:prepare] applied ${crewMarker}`);
} else {
  if (!source.includes(crewSentinelMarker)) {
    const oldNormalizer = `function normalizeRosterCrewId(value?: string | null): string | null {\n  const normalized = String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');\n  return normalized || null;\n}`;
    const count = source.split(oldNormalizer).length - 1;
    if (count !== 1) throw new Error(`[${crewSentinelMarker}] crew id normalizer count ${count}, expected 1`);
    const newNormalizer = `function normalizeRosterCrewId(value?: string | null): string | null {\n  const normalized = String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');\n  // ${crewSentinelMarker}: placeholder identities, including numbered variants,\n  // cannot authorize cross-publication adjacency.\n  if (!normalized || /^(?:UNKNOWN|INVALID|MISSING)(?:\\d+)?$/.test(normalized) || /^(?:NA|NONE|NULL|UNDEFINED|TBD|TBA|PLACEHOLDER)$/.test(normalized)) return null;\n  return normalized;\n}`;
    source = source.replace(oldNormalizer, newNormalizer);
    console.log(`[crewcheck:prepare] applied ${crewSentinelMarker}`);
  }
  console.log(`[crewcheck:prepare] ${crewMarker} already applied; validating structure`);
}

if (!source.includes(remoteCrewMarker)) {
  const oldRemoteSummary = `      const remoteSummary = payload.roster\n        || getLocalRosterSummaries(12).find((item) => Number(item.year) === Number(remoteData.roster.year) && Number(item.month) === Number(remoteData.roster.month))\n        || null;`;
  const remoteSummaryCount = source.split(oldRemoteSummary).length - 1;
  if (remoteSummaryCount !== 1) throw new Error(`[${remoteCrewMarker}] remote summary anchor count ${remoteSummaryCount}, expected 1`);
  const newRemoteSummary = `      // ${remoteCrewMarker}: older active-summary payloads may omit crew identity even\n      // though the already-authorized roster body contains it. Crew identity used for\n      // adjacency must be bound to the verified body, not trusted from stale summary metadata.\n      const remoteSummaryBase = payload.roster\n        || getLocalRosterSummaries(12).find((item) => Number(item.year) === Number(remoteData.roster.year) && Number(item.month) === Number(remoteData.roster.month))\n        || null;\n      const remoteBodyCrewId = normalizeRosterCrewId(remoteData.roster.crewId);\n      const remoteBodyCrewName = normalizeRosterCrewName(remoteData.roster.crewName);\n      const remoteSummaryCrewId = normalizeRosterCrewId(remoteSummaryBase?.crewId);\n      const remoteSummaryCrewName = normalizeRosterCrewName(remoteSummaryBase?.crewName);\n      // ${remoteCrewBindingMarker}: if both the verified body and summary expose a\n      // usable identity, disagreement is a hard authorization failure. When the\n      // body has no usable identity, do not let summary-only metadata select an\n      // adjacent crew publication.\n      if (remoteBodyCrewId && remoteSummaryCrewId && remoteBodyCrewId !== remoteSummaryCrewId) throw new Error('ACTIVE_ROSTER_CREW_MISMATCH');\n      if (!remoteBodyCrewId && !remoteSummaryCrewId && remoteBodyCrewName && remoteSummaryCrewName && remoteBodyCrewName !== remoteSummaryCrewName) throw new Error('ACTIVE_ROSTER_CREW_MISMATCH');\n      const remoteSummary = remoteSummaryBase\n        ? {\n            ...remoteSummaryBase,\n            crewId: remoteBodyCrewId || null,\n            crewName: remoteBodyCrewName || null,\n          }\n        : null;`;
  source = source.replace(oldRemoteSummary, newRemoteSummary);
  console.log(`[crewcheck:prepare] applied ${remoteCrewMarker}`);
} else if (!source.includes(remoteCrewBindingMarker)) {
  const oldEnrichment = `      const remoteSummary = remoteSummaryBase\n        ? {\n            ...remoteSummaryBase,\n            crewId: remoteSummaryBase.crewId || remoteData.roster.crewId || null,\n            crewName: remoteSummaryBase.crewName || remoteData.roster.crewName || null,\n          }\n        : null;`;
  const count = source.split(oldEnrichment).length - 1;
  if (count !== 1) throw new Error(`[${remoteCrewBindingMarker}] remote enrichment count ${count}, expected 1`);
  const newEnrichment = `      const remoteBodyCrewId = normalizeRosterCrewId(remoteData.roster.crewId);\n      const remoteBodyCrewName = normalizeRosterCrewName(remoteData.roster.crewName);\n      const remoteSummaryCrewId = normalizeRosterCrewId(remoteSummaryBase?.crewId);\n      const remoteSummaryCrewName = normalizeRosterCrewName(remoteSummaryBase?.crewName);\n      // ${remoteCrewBindingMarker}: summary metadata may be stale; identity used for\n      // adjacency is authorized only by the verified roster body.\n      if (remoteBodyCrewId && remoteSummaryCrewId && remoteBodyCrewId !== remoteSummaryCrewId) throw new Error('ACTIVE_ROSTER_CREW_MISMATCH');\n      if (!remoteBodyCrewId && !remoteSummaryCrewId && remoteBodyCrewName && remoteSummaryCrewName && remoteBodyCrewName !== remoteSummaryCrewName) throw new Error('ACTIVE_ROSTER_CREW_MISMATCH');\n      const remoteSummary = remoteSummaryBase\n        ? {\n            ...remoteSummaryBase,\n            crewId: remoteBodyCrewId || null,\n            crewName: remoteBodyCrewName || null,\n          }\n        : null;`;
  source = source.replace(oldEnrichment, newEnrichment);
  console.log(`[crewcheck:prepare] applied ${remoteCrewBindingMarker}`);
} else {
  console.log(`[crewcheck:prepare] ${remoteCrewMarker} already applied; validating structure`);
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
  crewSentinelMarker,
  'P0_580_CREW_NAME_SENTINEL_GUARD',
  '/^(?:UNKNOWN|INVALID|MISSING)(?:\\d+)?$/',
  "Pick<SavedRosterSummary, 'year' | 'month' | 'crewId' | 'crewName'>",
  'sameRosterCrew(current, item)',
  remoteCrewMarker,
  remoteCrewBindingMarker,
  'const remoteSummaryBase = payload.roster',
  'const remoteBodyCrewId = normalizeRosterCrewId(remoteData.roster.crewId);',
  "throw new Error('ACTIVE_ROSTER_CREW_MISMATCH')",
  'crewId: remoteBodyCrewId || null',
  'crewName: remoteBodyCrewName || null',
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
