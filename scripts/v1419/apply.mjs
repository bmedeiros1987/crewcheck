import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const current = fs.readFileSync(path, 'utf8');
  const next = transform(current);
  if (next !== current) fs.writeFileSync(path, next, 'utf8');
}

function insertBefore(source, anchor, content) {
  if (source.includes(content.trim())) return source;
  const index = source.indexOf(anchor);
  if (index < 0) return source;
  return `${source.slice(0, index)}${content}\n${source.slice(index)}`;
}

update('server/v1403/telegram-human.mjs', (source) => {
  let next = source;
  next = insertBefore(next, 'export function spokenFlightNumber', `export function displayFlightNumber(flightNumber = '') {
  const raw = String(flightNumber || '').toUpperCase().replace(/\\s+/g, '');
  const digits = raw.match(/\\d{2,5}/)?.[0] || '';
  if (!digits) return raw || 'voo a confirmar';
  const company = airlineName(raw);
  return company ? \\`${'${company} ${digits}'}\\` : \\`voo ${'${digits}'}\\`;
}

export function localProgramDateLabel(record = {}, fallback = '') {
  const raw = String(record?.date || record?.day?.date || record?.startDateTime || '').trim();
  const match = raw.match(/(\\d{1,2})[\\/-](\\d{1,2})(?:[\\/-](\\d{2,4}))?/);
  if (!match) return fallback;
  const year = Number(match[3] || new Date().getFullYear());
  const normalizedYear = year < 100 ? 2000 + year : year;
  const date = new Date(normalizedYear, Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' }).format(date);
}`);
  next = next.replace("const flight = spokenFlightNumber(leg.flightNumber || `etapa ${index + 1}`);", "const flight = displayFlightNumber(leg.flightNumber || `etapa ${index + 1}`);");
  next = next.replace("? ` Depois você segue no ${spokenFlightNumber(firstLeg.flightNumber)}, às ${spokenTime(firstLeg.departureTime)}${gate ? `, pelo portão ${gate}` : ''}.`", "? ` Depois você segue no ${displayFlightNumber(firstLeg.flightNumber)}, às ${spokenTime(firstLeg.departureTime)}${gate ? `, pelo portão ${gate}` : ''}.`");
  next = next.replace("const opening = `${greeting} ${label ? `${label}, ` : ''}você tem ${count} perna${count === 1 ? '' : 's'}. A apresentação é às ${presentation}, e a chave termina em ${airportName(finalDestination).replace(/^aeroporto d[eo] /, '')} às ${end}.`;", "const dateLabel = localProgramDateLabel(record, label);\n  const opening = `${greeting} ${dateLabel ? `${dateLabel}, ` : label ? `${label}, ` : ''}você tem ${count} perna${count === 1 ? '' : 's'}. A apresentação é às ${presentation}, e a chave termina em ${airportName(finalDestination).replace(/^aeroporto d[eo] /, '')} às ${end}.`;");
  next = next.replace("return `${greeting} saia às ${spokenTime(leaveTime)}. O trânsito está ${traffic}, e o trajeto até ${airportName(origin)} deve levar cerca de ${spokenDuration(route.minutes)}.${flightPart}`;", "const dateLabel = localProgramDateLabel(record);\n  return `${greeting} ${dateLabel ? `para ${dateLabel}, ` : ''}saia às ${spokenTime(leaveTime)}. O trânsito está ${traffic}, e o trajeto até ${airportName(origin)} deve levar cerca de ${spokenDuration(route.minutes)}.${flightPart}`;");
  return next;
});

for (const path of ['scripts/v1406/departure.snippet', 'client/src/pages/Home.tsx']) {
  update(path, (source) => {
    let next = source;
    next = insertBefore(next, 'function Departure({ event }', `function crewCheckEventDateLabel(event: ZeroLeg): string {
  const date = event?.date instanceof Date ? event.date : new Date(event?.date || Date.now());
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(date);
}
function crewCheckUberXUrl(origin: string, destination: string): string {
  const base = 'https://m.uber.com/ul/';
  const params = new URLSearchParams({ action: 'setPickup', pickup: origin || 'my_location', dropoff: destination, product_id: 'uberx' });
  params.set('pickup[formatted_address]', origin || 'Localização atual');
  params.set('dropoff[formatted_address]', destination);
  return `${base}?${params.toString()}`;
}`);
    next = next.replace('<h2>{originLabel} → {event.origin}</h2>', '<h2>{originLabel} → {event.origin}</h2><p className="cc-departure-date">{crewCheckEventDateLabel(event)}</p>');
    next = next.replace('<GoogleMapsRoutePreview event={event} mode={mode} onRoute={(next) => { setRoute(next); setRoutePending(false); const minutes = routeDurationMinutes(next); if (minutes) saveDepartureTravelMinutes(event, minutes); }} onOriginLabel={setOriginLabel}/>', '<GoogleMapsRoutePreview event={event} mode={mode} onRoute={(next) => { setRoute(next); setRoutePending(false); const minutes = routeDurationMinutes(next); if (minutes) saveDepartureTravelMinutes(event, minutes); }} onOriginLabel={setOriginLabel}/><div className="cc-departure-actions"><a className="cc-premium-action" href={buildGoogleMapsDirectionsUrl(originLabel, event.origin, mode.includes(\'transit\') ? \'transit\' : \'driving\')} target="_blank" rel="noreferrer"><MapIcon/>Abrir rota detalhada</a>{mode.includes(\'uber\') && <a className="cc-premium-action" href={crewCheckUberXUrl(originLabel, `${event.origin} aeroporto`)} target="_blank" rel="noreferrer"><Car/>Chamar UberX</a>}</div>');
    return next;
  });
}

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, "const DEFAULT_VERSION = '14.1.9';")
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.1.9: mobilidade Premium, datas operacionais, UberX e Concierge natural';"));

update('client/src/main.tsx', (source) => source.includes('v1419/premium-deluxe-phase2.css')
  ? source
  : source.replace('import "./components/v1418/premium-deluxe.css";', 'import "./components/v1418/premium-deluxe.css";\nimport "./components/v1419/premium-deluxe-phase2.css";'));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = '14.1.9';
  data.description = 'CrewCheck v14.1.9 - Premium Deluxe mobility, natural-language concierge and document readiness';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log('[v1419] Premium Deluxe phase 2: UberX, operational dates, text flight numbers and mobility actions.');
