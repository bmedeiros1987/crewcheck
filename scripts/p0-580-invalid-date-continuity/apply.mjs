import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_INVALID_DATE_CONTINUITY_GUARD';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

if (!source.includes(marker)) {
  const anchor = `    const gap = dayGapLocal(last, anchor);\n    const hasInterveningOff = (overlapFilteredNext.days || []).some((day) => {`;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[${marker}] continuation scan anchor count ${count}, expected 1`);

  source = source.replace(anchor, `    const gap = dayGapLocal(last, anchor);\n    // ${marker}: a structured but civilly impossible date is not merely an\n    // unknown dedupe key. Its position in the adjacent publication cannot be\n    // proven safely, so it must stop continuity before any later anchor can\n    // authorize appending the publication.\n    const hasInvalidStructuredDateBeforeAnchor = (overlapFilteredNext.days || []).some((day, index) => {\n      if (index >= anchor.index) return false;\n      const rawDate = String(day?.date || '').trim();\n      const structuredDate = /^(?:\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2})$/.test(rawDate);\n      return structuredDate && !parseCrewRosterDate(rawDate);\n    });\n    if (hasInvalidStructuredDateBeforeAnchor) return null;\n    const hasInterveningOff = (overlapFilteredNext.days || []).some((day) => {`);
  fs.writeFileSync(databasePath, source, 'utf8');
  console.log(`[crewcheck:prepare] applied ${marker}`);
} else {
  console.log(`[crewcheck:prepare] ${marker} already applied; validating structure`);
}

const prepared = fs.readFileSync(databasePath, 'utf8');
const required = [
  marker,
  'const hasInvalidStructuredDateBeforeAnchor = (overlapFilteredNext.days || []).some',
  'if (index >= anchor.index) return false;',
  'return structuredDate && !parseCrewRosterDate(rawDate);',
  'if (hasInvalidStructuredDateBeforeAnchor) return null;',
];
const missing = required.filter((fragment) => !prepared.includes(fragment));
if (missing.length) throw new Error(`[${marker}] structural validation failed: ${missing.join(' | ')}`);
