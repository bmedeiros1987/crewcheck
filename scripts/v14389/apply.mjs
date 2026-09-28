import fs from 'node:fs';

const VERSION = '14.3.89';
const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14389] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

const hotelsStart = source.indexOf('function HotelsView(');
if (hotelsStart < 0) throw new Error('[v14389] HotelsView não localizado.');

if (!source.includes('function explicitStayReportLocation(event: ZeroLeg | null): string')) {
  const helper = `function explicitStayReportLocation(event: ZeroLeg | null): string {
  if (!event) return '';
  const day = (event.day || {}) as any;
  const explicitValues = [
    day.reportLocation,
    day.trainingLocation,
    day.presentationLocation,
    day.meetingPoint,
    (event as any).reportLocation,
    (event as any).trainingLocation,
    (event as any).presentationLocation,
    (event as any).meetingPoint,
  ];
  for (const value of explicitValues) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

`;
  source = source.slice(0, hotelsStart) + helper + source.slice(hotelsStart);
}

const oldCatalog = `  const targetAirport = selectedEvent?.destination || selectedEvent?.origin || '';
  const catalogResults = useMemo(() => searchCrewHotels(query, targetAirport), [query, targetAirport]);`;
const newCatalog = `  // Airport here scopes only the hotel catalog. It is never a report/training location.
  const catalogAirport = selectedEvent?.destination || selectedEvent?.origin || '';
  const catalogResults = useMemo(() => searchCrewHotels(query, catalogAirport), [query, catalogAirport]);`;
if (source.includes(oldCatalog)) source = source.replace(oldCatalog, newCatalog);

const oldDetail = `<div><span>Apresentação</span><strong>{current?.presentationTime || safe(event.presentation, 'A confirmar')}</strong></div><div><span>Antecedência</span>`;
const newDetail = `<div><span>Apresentação</span><strong>{current?.presentationTime || safe(event.presentation, 'A confirmar')}</strong></div><div><span>Local de apresentação</span><strong>{explicitStayReportLocation(event) || 'Local a confirmar'}</strong></div><div><span>Antecedência</span>`;
if (source.includes(oldDetail)) source = source.replace(oldDetail, newDetail);

for (const required of [
  'function explicitStayReportLocation(event: ZeroLeg | null): string',
  "const catalogAirport = selectedEvent?.destination || selectedEvent?.origin || '';",
  "searchCrewHotels(query, catalogAirport)",
  "<span>Local de apresentação</span><strong>{explicitStayReportLocation(event) || 'Local a confirmar'}</strong>",
]) {
  if (!source.includes(required)) throw new Error(`[v14389] contrato não aplicado: ${required}`);
}

const helperStart = source.indexOf('function explicitStayReportLocation(');
const helperEnd = source.indexOf('\nfunction ', helperStart + 1);
const helperScope = source.slice(helperStart, helperEnd > helperStart ? helperEnd : undefined);
if (/\.origin\b|\.destination\b|hotelName|hotelLocation/i.test(helperScope)) {
  throw new Error('[v14389] local de apresentação não pode ser inferido de origem/destino/hotel.');
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14389] CrewCheck ${VERSION}: hotel/catalogo e local explícito de apresentação permanecem semanticamente separados.`);

await import('../v14390/apply.mjs');
