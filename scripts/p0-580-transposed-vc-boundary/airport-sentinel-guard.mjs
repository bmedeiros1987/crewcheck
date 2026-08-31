import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_CONTINUITY_AIRPORT_SENTINEL_GUARD';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

const unsafeHelper = `function mergeAirportForLocal(value?: string | null): string {\n  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);\n}`;
const safeHelper = `function mergeAirportForLocal(value?: string | null): string {\n  // ${marker}: continuity anchors must never turn a sentinel into a real IATA.\n  const raw = String(value || '').trim().toUpperCase();\n  if (!raw || ['UNKNOWN', 'INVALID', 'XXX'].includes(raw)) return '';\n  const compact = raw.replace(/[^A-Z]/g, '');\n  return /^[A-Z]{3}$/.test(compact) ? compact : '';\n}`;

if (!source.includes(marker)) {
  const count = source.split(unsafeHelper).length - 1;
  if (count !== 1) throw new Error(`[${marker}] unsafe airport helper count ${count}, expected 1`);
  source = source.replace(unsafeHelper, safeHelper);
  console.log(`[crewcheck:prepare] applied ${marker}`);
} else {
  console.log(`[crewcheck:prepare] ${marker} already applied; validating structure`);
}

const staleResidualDefinition = `  const residualDays = overlapFilteredNext.days || [];`;
const directResidualDefinition = `  const residualDays = dedupeAdjacentRosterDays(previousRoster.days || [], nextRoster.days || []);`;
if (source.includes(staleResidualDefinition)) {
  source = source.replace(staleResidualDefinition, directResidualDefinition);
}

const start = source.indexOf('function mergeAirportForLocal(value?: string | null): string {');
const end = source.indexOf('\n}\n\nfunction isOffLikeLocalDay', start);
if (start < 0 || end < 0) throw new Error(`[${marker}] continuity airport helper range not found`);
const helper = source.slice(start, end + 2);
for (const fragment of [
  marker,
  "['UNKNOWN', 'INVALID', 'XXX'].includes(raw)",
  "return /^[A-Z]{3}$/.test(compact) ? compact : '';",
]) {
  if (!helper.includes(fragment)) throw new Error(`[${marker}] structural guard incomplete: missing ${fragment}`);
}
if (helper.includes('.slice(0, 3)')) throw new Error(`[${marker}] truncating airport normalization survived`);
if (!source.includes(directResidualDefinition)) throw new Error(`[${marker}] residual source-order definition not aligned`);

fs.writeFileSync(databasePath, source, 'utf8');
