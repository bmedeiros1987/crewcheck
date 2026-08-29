import fs from 'node:fs';

const parserPath = 'client/src/lib/pdfParser.ts';
const marker = 'P0_580_TRANSPOSED_STRUCTURE_GUARD';

if (!fs.existsSync(parserPath)) throw new Error(`[${marker}] ${parserPath} not found`);
let source = fs.readFileSync(parserPath, 'utf8');

if (source.includes(marker)) {
  console.log(`[crewcheck:prepare] ${marker} already applied`);
} else {
  const scoreAnchor = `  const transposedScore = scoreParsedDays(transposedDays, header.month, header.year);`;
  if (!source.includes(scoreAnchor)) throw new Error(`[${marker}] transposed score anchor not found`);

  source = source.replace(scoreAnchor, `  // ${marker}: a normal horizontal page can be misread as X-columns when\n  // repeated activities line up vertically. If one synthetic transposed day\n  // contains several published date tokens (or the report legend), that candidate\n  // has collapsed independent rows and must never outrank the sequential/visual\n  // parsers. This is structural validation only; no date/activity is hardcoded.\n  const transposedStructurallySound = transposedDays.every((day) => {\n    const raw = String(day.rawText || '');\n    const dateTokens = raw.match(DATE_TOKEN_GLOBAL_RE) || [];\n    return dateTokens.length <= 1 && !/\\bLEGEND\\b/i.test(raw);\n  });\n  const transposedScore = transposedStructurallySound\n    ? scoreParsedDays(transposedDays, header.month, header.year)\n    : Number.NEGATIVE_INFINITY;`);

  const strongAnchor = `  const useStrongTransposed = /Roster\\s+Report/i.test(fullText)\n    && transposedDays.length >= 25\n    && transposedEventCount >= 30;`;
  if (!source.includes(strongAnchor)) throw new Error(`[${marker}] strong-transposed anchor not found`);

  source = source.replace(strongAnchor, `  const useStrongTransposed = /Roster\\s+Report/i.test(fullText)\n    && transposedStructurallySound\n    && transposedDays.length >= 25\n    && transposedEventCount >= 30;`);

  fs.writeFileSync(parserPath, source, 'utf8');
  console.log(`[crewcheck:prepare] applied ${marker}`);
}
