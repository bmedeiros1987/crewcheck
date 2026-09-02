import fs from 'node:fs';

const parserPath = 'client/src/lib/pdfParser.ts';
const marker = 'P0_580_LEGEND_TERMINAL_RESCUES_GUARD';

if (!fs.existsSync(parserPath)) throw new Error(`[${marker}] ${parserPath} not found`);
let source = fs.readFileSync(parserPath, 'utf8');

const replacements = [
  [
    'const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);',
    `const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, publishedRows, header.month, header.year, header.base); // ${marker}`,
  ],
  [
    'const offsetAwareDays = rebuildCrewRosterOffsetDays(visuallyRescuedDays, fullText, header.month, header.year, header.base);',
    'const offsetAwareDays = rebuildCrewRosterOffsetDays(visuallyRescuedDays, publishedText, header.month, header.year, header.base);',
  ],
  [
    'rescueCrewRosterOffsetGroundActivities(continuationDays, fullText, header.month, header.year, header.base)',
    'rescueCrewRosterOffsetGroundActivities(continuationDays, publishedText, header.month, header.year, header.base)',
  ],
  [
    'rescueCrewRosterOffsetGroundActivities(offsetAwareDays, fullText, header.month, header.year, header.base)',
    'rescueCrewRosterOffsetGroundActivities(offsetAwareDays, publishedText, header.month, header.year, header.base)',
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (source.includes(before)) source = source.replace(before, after);
}

fs.writeFileSync(parserPath, source, 'utf8');
const prepared = fs.readFileSync(parserPath, 'utf8');
const parseStart = prepared.indexOf('function parseCrewRosterReportRows(');
const parseEnd = prepared.indexOf('\nfunction ', parseStart + 10);
const block = parseStart >= 0 ? prepared.slice(parseStart, parseEnd > parseStart ? parseEnd : prepared.length) : '';
if (!block) throw new Error(`[${marker}] parseCrewRosterReportRows not found`);
for (const fragment of [
  marker,
  'rescueFlightsFromVisualRows(rescuedDays, publishedRows',
  'rebuildCrewRosterOffsetDays(visuallyRescuedDays, publishedText',
]) {
  if (!block.includes(fragment)) throw new Error(`[${marker}] missing ${fragment}`);
}
for (const unsafe of [
  'rescueFlightsFromVisualRows(rescuedDays, rows,',
  'rebuildCrewRosterOffsetDays(visuallyRescuedDays, fullText,',
  'rescueCrewRosterOffsetGroundActivities(continuationDays, fullText,',
  'rescueCrewRosterOffsetGroundActivities(offsetAwareDays, fullText,',
]) {
  if (block.includes(unsafe)) throw new Error(`[${marker}] post-LEGEND rescue still uses unbounded source: ${unsafe}`);
}
console.log(`[crewcheck:prepare] ${marker} validated`);
