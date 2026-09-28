import fs from 'node:fs';

const path = 'scripts/v14389/apply.mjs';
if (!fs.existsSync(path)) throw new Error('[hotel-location-separation] v14389 apply ausente.');
const source = fs.readFileSync(path, 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`[hotel-location-separation] ${message}`);
}

expect(source.includes('function explicitStayReportLocation(event: ZeroLeg | null): string'), 'helper explícito de local de apresentação ausente.');
expect(source.includes('day.reportLocation'), 'reportLocation do dia não é considerado.');
expect(source.includes('day.trainingLocation'), 'trainingLocation do dia não é considerado.');
expect(source.includes("explicitStayReportLocation(event) || 'Local a confirmar'"), 'ausência de local explícito deve permanecer como Local a confirmar.');
expect(source.includes("const catalogAirport = selectedEvent?.destination || selectedEvent?.origin || '';"), 'escopo do catálogo de hotéis não está separado.');
expect(source.includes('searchCrewHotels(query, catalogAirport)'), 'catálogo de hotéis não usa seu próprio escopo.');

// Inspect only the helper template that v14.3.89 injects into Home.tsx. Searching from
// the first function-name occurrence would hit this apply script's own guard string and
// incorrectly include unrelated hotel-catalog code such as selectedEvent.origin.
const helperMarker = 'const helper = `function explicitStayReportLocation(';
const helperMarkerStart = source.indexOf(helperMarker);
expect(helperMarkerStart >= 0, 'template do helper explícito não localizado.');
const helperStart = helperMarkerStart + 'const helper = `'.length;
const helperEnd = source.indexOf('`;\n  source = source.slice', helperStart);
expect(helperEnd > helperStart, 'fim do template do helper explícito não localizado.');
const helperScope = source.slice(helperStart, helperEnd);

for (const forbidden of ['.origin', '.destination', 'hotelName', 'hotelLocation', 'CGH', 'GRU']) {
  expect(!helperScope.includes(forbidden), `local de apresentação não pode depender de ${forbidden}.`);
}

console.log('[hotel-location-separation] OK — hotel/catalogo e reportLocation/trainingLocation permanecem semanticamente separados; nenhum CGH/GRU é inferido pelo hotel.');
