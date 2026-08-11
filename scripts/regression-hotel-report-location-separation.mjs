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

const helperStart = source.indexOf('function explicitStayReportLocation(');
const helperEnd = source.indexOf('\nfunction ', helperStart + 1);
const helperScope = source.slice(helperStart, helperEnd > helperStart ? helperEnd : undefined);

for (const forbidden of ['.origin', '.destination', 'hotelName', 'hotelLocation', 'CGH', 'GRU']) {
  expect(!helperScope.includes(forbidden), `local de apresentação não pode depender de ${forbidden}.`);
}

console.log('[hotel-location-separation] OK — hotel/catalogo e reportLocation/trainingLocation permanecem semanticamente separados; nenhum CGH/GRU é inferido pelo hotel.');
