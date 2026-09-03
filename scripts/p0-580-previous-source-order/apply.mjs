import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_PREVIOUS_SOURCE_ORDER_GUARD';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

if (!source.includes(marker)) {
  const anchorGuardBefore = `      const legs = day.legs || [];\n      if (!legs.length) return null;\n      const first = legs[0];`;
  const anchorGuardAfter = `      const legs = day.legs || [];\n      if (!legs.length) return null;\n      if (!isOperationalLegChainVerifiable(day)) return null; // ${marker}\n      const first = legs[0];`;
  const anchorCount = source.split(anchorGuardBefore).length - 1;
  if (anchorCount !== 1) throw new Error(`[${marker}] continuation-anchor guard count ${anchorCount}, expected 1`);
  source = source.replace(anchorGuardBefore, anchorGuardAfter);

  const oldTail = `  const hasOffAfter = (previousRoster.days || []).some((day, index) => index > last.index && isOffLikeLocalDay(day));\n  if (hasOffAfter) return null;\n  let tailStart = last.index;\n  for (let i = previousAnchors.length - 2; i >= 0; i -= 1) {\n    const previous = previousAnchors[i];\n    const current = previousAnchors[i + 1];\n    const gap = dayGapLocal(previous, current);\n    if (gap < 0 || gap > 3) break;\n    if (!previous.destination || !current.origin || previous.destination !== current.origin) break;\n    tailStart = previous.index;\n  }\n  const days = (previousRoster.days || []).filter((day, index) => index >= tailStart && !isOffLikeLocalDay(day));\n  return days.length ? { ...previousRoster, days } : null;`;
  const oldTailCount = source.split(oldTail).length - 1;
  if (oldTailCount !== 1) throw new Error(`[${marker}] previous-tail source-order count ${oldTailCount}, expected 1`);

  const newTail = `  const previousSourceDays = previousRoster.days || [];\n  // ${marker}: the final verified anchor cannot authorize source rows that occur\n  // after it, and a non-anchor row between two verified anchors terminates the\n  // older chain instead of being silently discarded. This mirrors the fail-closed\n  // residual traversal applied to the adjacent publication.\n  if (previousSourceDays.slice(last.index + 1).length) return null;\n  let tailStart = last.index;\n  for (let i = previousAnchors.length - 2; i >= 0; i -= 1) {\n    const previous = previousAnchors[i];\n    const current = previousAnchors[i + 1];\n    if (previousSourceDays.slice(previous.index + 1, current.index).length) break;\n    const gap = dayGapLocal(previous, current);\n    if (gap < 0 || gap > 3) break;\n    if (!previous.destination || !current.origin || previous.destination !== current.origin) break;\n    tailStart = previous.index;\n  }\n  const days = previousSourceDays.slice(tailStart, last.index + 1);\n  if (!days.length) return null;\n  if (days.some((day) => !parseCrewRosterDate(day.date) || isOffLikeLocalDay(day) || !(day.legs || []).length || !isOperationalLegChainVerifiable(day))) return null;\n  return { ...previousRoster, days };`;
  source = source.replace(oldTail, newTail);
  fs.writeFileSync(databasePath, source, 'utf8');
  console.log(`[crewcheck:prepare] applied ${marker}`);
} else {
  console.log(`[crewcheck:prepare] ${marker} already applied; validating structure`);
}

const prepared = fs.readFileSync(databasePath, 'utf8');
const start = prepared.indexOf('function continuationTailLocal(');
const end = prepared.indexOf('\nfunction mergeContinuousLocal(', start);
if (start < 0 || end < 0) throw new Error(`[${marker}] continuationTailLocal range not found`);
const block = prepared.slice(start, end);
for (const fragment of [
  marker,
  'if (!isOperationalLegChainVerifiable(day)) return null;',
  'const previousSourceDays = previousRoster.days || [];',
  'previousSourceDays.slice(last.index + 1).length',
  'previousSourceDays.slice(previous.index + 1, current.index).length',
  'const days = previousSourceDays.slice(tailStart, last.index + 1);',
]) {
  if (!prepared.includes(fragment)) throw new Error(`[${marker}] missing structural guard: ${fragment}`);
}
if (block.includes('index > last.index && isOffLikeLocalDay(day)')) throw new Error(`[${marker}] off-only post-anchor guard survived`);
if (block.includes("filter((day, index) => index >= tailStart && !isOffLikeLocalDay(day))")) throw new Error(`[${marker}] filtering source rows instead of respecting boundary survived`);

await import('../p0-580-active-body-fingerprint/apply.mjs');
