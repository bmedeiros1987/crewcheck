import fs from 'node:fs';

const VERSION = '14.3.92';
const serverFile = 'server.mjs';
const homeFile = 'client/src/pages/Home.tsx';
for (const file of [serverFile, homeFile]) {
  if (!fs.existsSync(file)) throw new Error(`[v14392] arquivo ausente: ${file}`);
}

let server = fs.readFileSync(serverFile, 'utf8');
let home = fs.readFileSync(homeFile, 'utf8');

const oldRadarParams = `  const identity = telegramConciergeIdentity();\n  const params = new URLSearchParams({ flight, origin: String(event.origin || ''), destination: String(event.destination || ''), force: force ? '1' : '0', email: identity.email, name: identity.name, conciergeKey: identity.conciergeKey });`;
const newRadarParams = `  const identity = telegramConciergeIdentity();\n  const scheduledDeparture = (() => {\n    const match = String(event.departure || '').match(/(\\d{1,2}):(\\d{2})/);\n    const date = new Date(event.date);\n    if (!match || Number.isNaN(date.getTime())) return '';\n    date.setHours(Number(match[1]), Number(match[2]), 0, 0);\n    return date.toISOString();\n  })();\n  const params = new URLSearchParams({ flight, origin: String(event.origin || ''), destination: String(event.destination || ''), scheduledDeparture, force: force ? '1' : '0', email: identity.email, name: identity.name, conciergeKey: identity.conciergeKey });`;
if (home.includes(oldRadarParams)) home = home.replace(oldRadarParams, newRadarParams);

const normalizeMarker = 'function normalizeFlightAwareFlight(row = {}, ctx) {';
if (!server.includes('function selectFlightAwareOccurrence(')) {
  const helper = `function radarAirportCode(value) {\n  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');\n}\nfunction flightAwareAirport(row = {}, side = 'origin') {\n  const airport = row?.[side] || {};\n  return radarAirportCode(firstKnown(airport.code_iata, airport.code, airport.airport_code, airport.code_icao));\n}\nfunction flightAwareScheduledDeparture(row = {}) {\n  return firstKnown(row.scheduled_out, row.filed_departure_time, row.estimated_out, row.actual_out);\n}\nfunction flightAwareOccurrenceRank(row = {}, origin = '', destination = '', scheduledDeparture = '') {\n  const wantedOrigin = radarAirportCode(origin);\n  const wantedDestination = radarAirportCode(destination);\n  const rowOrigin = flightAwareAirport(row, 'origin');\n  const rowDestination = flightAwareAirport(row, 'destination');\n\n  if (wantedOrigin && rowOrigin && wantedOrigin !== rowOrigin) return Number.POSITIVE_INFINITY;\n  if (wantedDestination && rowDestination && wantedDestination !== rowDestination) return Number.POSITIVE_INFINITY;\n\n  let rank = 0;\n  if (wantedOrigin && !rowOrigin) rank += 12 * 60 * 60_000;\n  if (wantedDestination && !rowDestination) rank += 12 * 60 * 60_000;\n\n  const targetMs = Date.parse(String(scheduledDeparture || ''));\n  const rowMs = Date.parse(String(flightAwareScheduledDeparture(row) || ''));\n  if (Number.isFinite(targetMs) && Number.isFinite(rowMs)) rank += Math.abs(rowMs - targetMs);\n  else if (Number.isFinite(targetMs)) rank += 48 * 60 * 60_000;\n\n  // Status is only a deterministic tie-breaker. Temporal identity must always win.\n  if (row.cancelled) rank += 2;\n  if (row.actual_in) rank += 1;\n  return rank;\n}\nfunction selectFlightAwareOccurrence(flights = [], origin = '', destination = '', scheduledDeparture = '') {\n  const candidates = Array.isArray(flights) ? flights.filter(Boolean) : [];\n  if (!candidates.length) return null;\n  return candidates\n    .map((row, index) => ({ row, index, rank: flightAwareOccurrenceRank(row, origin, destination, scheduledDeparture) }))\n    .filter((candidate) => Number.isFinite(candidate.rank))\n    .sort((a, b) => a.rank - b.rank || a.index - b.index)[0]?.row || null;\n}\n`;
  if (!server.includes(normalizeMarker)) throw new Error('[v14392] normalizador FlightAware não localizado.');
  server = server.replace(normalizeMarker, helper + normalizeMarker);
}

server = server.replace(
  "async function providerFlightAware(ctx, timeoutMs) {",
  "async function providerFlightAware(ctx, timeoutMs, origin = '', destination = '', scheduledDeparture = '') {",
);
server = server.replace(
  "  const row = flights.find((item) => !item.cancelled && !item.actual_in) || flights[0];",
  "  const row = selectFlightAwareOccurrence(flights, origin, destination, scheduledDeparture);",
);
server = server.replace(
  "async function runRadarRace(ctx, origin, destination) {",
  "async function runRadarRace(ctx, origin, destination, scheduledDeparture = '') {",
);
server = server.replace(
  "    () => providerFlightAware(ctx, timeoutMs),",
  "    () => providerFlightAware(ctx, timeoutMs, origin, destination, scheduledDeparture),",
);

const oldHandleContext = `  const origin = String(url.searchParams.get('origin') || '').trim();\n  const destination = String(url.searchParams.get('destination') || '').trim();`;
const newHandleContext = `  const origin = String(url.searchParams.get('origin') || '').trim();\n  const destination = String(url.searchParams.get('destination') || '').trim();\n  const scheduledDeparture = String(url.searchParams.get('scheduledDeparture') || '').trim();`;
if (server.includes(oldHandleContext)) server = server.replace(oldHandleContext, newHandleContext);
server = server.replace(
  '  const payload = await runRadarRace(ctx, origin, destination);',
  '  const payload = await runRadarRace(ctx, origin, destination, scheduledDeparture);',
);

for (const required of [
  "scheduledDeparture, force: force ? '1' : '0'",
  'function selectFlightAwareOccurrence(',
  'flightAwareOccurrenceRank(row, origin, destination, scheduledDeparture)',
  "async function providerFlightAware(ctx, timeoutMs, origin = '', destination = '', scheduledDeparture = '')",
  'selectFlightAwareOccurrence(flights, origin, destination, scheduledDeparture)',
  "const scheduledDeparture = String(url.searchParams.get('scheduledDeparture') || '').trim();",
  'runRadarRace(ctx, origin, destination, scheduledDeparture)',
  'if (row.cancelled) rank += 2;',
  'if (row.actual_in) rank += 1;',
]) {
  if (!home.includes(required) && !server.includes(required)) throw new Error(`[v14392] contrato não aplicado: ${required}`);
}

const flightAwareStart = server.indexOf("async function providerFlightAware(");
const flightAwareEnd = server.indexOf("\nasync function providerCustom(", flightAwareStart + 1);
if (flightAwareStart < 0 || flightAwareEnd < 0) throw new Error('[v14392] provider FlightAware não localizado.');
const flightAwareScope = server.slice(flightAwareStart, flightAwareEnd);
if (flightAwareScope.includes("flights.find((item) => !item.cancelled && !item.actual_in) || flights[0]")) {
  throw new Error('[v14392] FlightAware ainda escolhe ocorrência apenas por estado/ordem da resposta.');
}

fs.writeFileSync(serverFile, server, 'utf8');
fs.writeFileSync(homeFile, home, 'utf8');
console.log(`[v14392] CrewCheck ${VERSION}: Radar envia horário publicado e seleciona ocorrência FlightAware por rota + proximidade temporal.`);
