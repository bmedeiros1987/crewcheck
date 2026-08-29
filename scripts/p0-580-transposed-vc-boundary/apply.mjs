import fs from 'node:fs';

const parserPath = 'client/src/lib/pdfParser.ts';
const transposedMarker = 'P0_580_TRANSPOSED_STRUCTURE_GUARD';
const legendMarker = 'P0_580_LEGEND_BOUNDARY_GUARD';
const legendSectionMarker = 'P0_580_LEGEND_SECTION_GUARD';

if (!fs.existsSync(parserPath)) throw new Error(`[${transposedMarker}] ${parserPath} not found`);
let source = fs.readFileSync(parserPath, 'utf8');

if (!source.includes(transposedMarker)) {
  const scoreAnchor = `  const transposedScore = scoreParsedDays(transposedDays, header.month, header.year);`;
  if (!source.includes(scoreAnchor)) throw new Error(`[${transposedMarker}] transposed score anchor not found`);

  source = source.replace(scoreAnchor, `  // ${transposedMarker}: a normal horizontal page can be misread as X-columns when\n  // repeated activities line up vertically. If one synthetic transposed day\n  // contains several published date tokens (or the report legend), that candidate\n  // has collapsed independent rows and must never outrank the sequential/visual\n  // parsers. This is structural validation only; no date/activity is hardcoded.\n  const transposedStructurallySound = transposedDays.every((day) => {\n    const raw = String(day.rawText || '');\n    const dateTokens = raw.match(DATE_TOKEN_GLOBAL_RE) || [];\n    return dateTokens.length <= 1 && !/\\bLEGEND\\b/i.test(raw);\n  });\n  const transposedScore = transposedStructurallySound\n    ? scoreParsedDays(transposedDays, header.month, header.year)\n    : Number.NEGATIVE_INFINITY;`);

  const strongAnchor = `  const useStrongTransposed = /Roster\\s+Report/i.test(fullText)\n    && transposedDays.length >= 25\n    && transposedEventCount >= 30\n    && (!sourceHasFlights || transposedFlightCount > 0);`;
  if (!source.includes(strongAnchor)) throw new Error(`[${transposedMarker}] prepared strong-transposed anchor not found`);

  source = source.replace(strongAnchor, `  const useStrongTransposed = /Roster\\s+Report/i.test(fullText)\n    && transposedStructurallySound\n    && transposedDays.length >= 25\n    && transposedEventCount >= 30\n    && (!sourceHasFlights || transposedFlightCount > 0);`);
  console.log(`[crewcheck:prepare] applied ${transposedMarker}`);
} else {
  console.log(`[crewcheck:prepare] ${transposedMarker} already applied`);
}

if (!source.includes(legendMarker)) {
  const footerAnchor = `function isHeaderOrFooterRow(text: string): boolean {\n  return /^(Date\\b|Pairing\\/Activity\\b|Duty\\b|Report\\b|Item\\b|Updated Date\\b)/i.test(text)`;
  if (!source.includes(footerAnchor)) throw new Error(`[${legendMarker}] header/footer anchor not found`);
  source = source.replace(footerAnchor, `function isHeaderOrFooterRow(text: string): boolean {\n  // ${legendMarker}: legend labels enumerate valid activity codes, so allowing\n  // them through as continuation text contaminates the final published day.\n  if (/^LEGEND\\b/i.test(text)) return true;\n  return /^(Date\\b|Pairing\\/Activity\\b|Duty\\b|Report\\b|Item\\b|Updated Date\\b)/i.test(text)`);
  console.log(`[crewcheck:prepare] applied ${legendMarker}`);
} else {
  console.log(`[crewcheck:prepare] ${legendMarker} already applied`);
}

if (!source.includes(legendSectionMarker)) {
  const rowsAnchor = `function parseCrewRosterReportRows(rows: VisualRow[], fullText: string): CrewRoster {\n  const header = parseHeader(fullText);\n  const transposedDays = parseCrewRosterTransposedColumns(rows, header.month, header.year, header.base);\n  const visualDays = parseDaysFromRows(rows, header.month, header.year, header.base);\n  const columnarDays = parseCrewRosterColumnarRows(rows, header.month, header.year, header.base);\n  const looseDays = parseCrewRosterReportLooseText(fullText, header.month, header.year, header.base);`;
  if (!source.includes(rowsAnchor)) throw new Error(`[${legendSectionMarker}] parseCrewRosterReportRows anchor not found`);
  source = source.replace(rowsAnchor, `function parseCrewRosterReportRows(rows: VisualRow[], fullText: string): CrewRoster {\n  // ${legendSectionMarker}: LEGEND terminates the published roster. Labels below\n  // it intentionally contain valid activity codes (HSB/DO/DR/VC) and must never\n  // be parsed as continuation rows or transposed activities.\n  const legendRowIndex = rows.findIndex((row) => /^LEGEND\\b/i.test(normalizeSpaces(String(row?.text || ''))));\n  const publishedRows = legendRowIndex >= 0 ? rows.slice(0, legendRowIndex) : rows;\n  const legendTextMatch = String(fullText || '').match(/(?:^|\\n)\\s*LEGEND\\b/i);\n  const publishedText = legendTextMatch && typeof legendTextMatch.index === 'number'\n    ? String(fullText || '').slice(0, legendTextMatch.index)\n    : fullText;\n  const header = parseHeader(publishedText);\n  const transposedDays = parseCrewRosterTransposedColumns(publishedRows, header.month, header.year, header.base);\n  const visualDays = parseDaysFromRows(publishedRows, header.month, header.year, header.base);\n  const columnarDays = parseCrewRosterColumnarRows(publishedRows, header.month, header.year, header.base);\n  const looseDays = parseCrewRosterReportLooseText(publishedText, header.month, header.year, header.base);`);

  source = source.replace(
    `rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base)`,
    `rescueFlightsFromFullText(mergedDays, publishedText, header.month, header.year, header.base)`,
  );
  source = source.replace(
    `parseGenericTripulationRecords(fullText, header.crewName, header.year, header.month)`,
    `parseGenericTripulationRecords(publishedText, header.crewName, header.year, header.month)`,
  );
  if (!source.includes(legendSectionMarker) || !source.includes('parseCrewRosterTransposedColumns(publishedRows')) {
    throw new Error(`[${legendSectionMarker}] structural patch incomplete`);
  }
  console.log(`[crewcheck:prepare] applied ${legendSectionMarker}`);
} else {
  console.log(`[crewcheck:prepare] ${legendSectionMarker} already applied`);
}

fs.writeFileSync(parserPath, source, 'utf8');
