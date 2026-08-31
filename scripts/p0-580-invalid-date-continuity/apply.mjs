import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_INVALID_DATE_CONTINUITY_GUARD';
const sourceOrderMarker = 'P0_580_RESIDUAL_SOURCE_ORDER_GUARD';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

if (source.includes(sourceOrderMarker)) {
  const requiredSourceOrder = [
    sourceOrderMarker,
    'const residualDays = overlapFilteredNext.days || [];',
    'const provenRetainedOverlap = dedupeAdjacentRosterDays(previousRoster.days || [], [day]).length === 0;',
    'const dayDate = parseCrewRosterDate(day.date);',
    'if (!dayDate || isOffLikeLocalDay(day)) return null;',
    'if (!(day.legs || []).length) return null;',
  ];
  const missing = requiredSourceOrder.filter((fragment) => !source.includes(fragment));
  if (missing.length) throw new Error(`[${marker}] source-order guard incomplete: ${missing.join(' | ')}`);
  console.log(`[crewcheck:prepare] ${marker} covered by ${sourceOrderMarker}`);
} else if (!source.includes(marker)) {
  const anchor = `    const gap = dayGapLocal(last, anchor);\n    const hasInterveningOff = (overlapFilteredNext.days || []).some((day) => {`;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[${marker}] continuation scan anchor count ${count}, expected 1`);

  source = source.replace(anchor, `    const gap = dayGapLocal(last, anchor);\n    // ${marker}: after proven overlap copies are removed, every remaining row\n    // before a later continuation anchor must have a valid civil date. Unknown,\n    // malformed or impossible dates cannot be ordered safely and therefore must\n    // stop continuity rather than disappear from the scan and authorize a later\n    // activity indirectly.\n    const hasInvalidDateBeforeAnchor = (overlapFilteredNext.days || []).some((day, index) => {\n      if (index >= anchor.index) return false;\n      const rawDate = String(day?.date || '').trim();\n      return !rawDate || !parseCrewRosterDate(rawDate);\n    });\n    if (hasInvalidDateBeforeAnchor) return null;\n    const hasInterveningOff = (overlapFilteredNext.days || []).some((day) => {`);
  fs.writeFileSync(databasePath, source, 'utf8');
  console.log(`[crewcheck:prepare] applied ${marker}`);
} else {
  console.log(`[crewcheck:prepare] ${marker} already applied; validating structure`);
}

const prepared = fs.readFileSync(databasePath, 'utf8');
if (prepared.includes(sourceOrderMarker)) {
  const required = [
    sourceOrderMarker,
    'const residualDays = overlapFilteredNext.days || [];',
    'const provenRetainedOverlap = dedupeAdjacentRosterDays(previousRoster.days || [], [day]).length === 0;',
    'const dayDate = parseCrewRosterDate(day.date);',
    'if (!dayDate || isOffLikeLocalDay(day)) return null;',
    'if (!(day.legs || []).length) return null;',
  ];
  const missing = required.filter((fragment) => !prepared.includes(fragment));
  if (missing.length) throw new Error(`[${marker}] structural validation failed: ${missing.join(' | ')}`);
} else {
  const required = [
    marker,
    'const hasInvalidDateBeforeAnchor = (overlapFilteredNext.days || []).some',
    'if (index >= anchor.index) return false;',
    "return !rawDate || !parseCrewRosterDate(rawDate);",
    'if (hasInvalidDateBeforeAnchor) return null;',
  ];
  const missing = required.filter((fragment) => !prepared.includes(fragment));
  if (missing.length) throw new Error(`[${marker}] structural validation failed: ${missing.join(' | ')}`);
}
