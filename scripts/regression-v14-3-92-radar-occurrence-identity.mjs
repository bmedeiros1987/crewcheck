import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

for (const required of [
  "scheduledDeparture, force: force ? '1' : '0'",
  'date.setHours(Number(match[1]), Number(match[2]), 0, 0);',
]) {
  if (!home.includes(required)) throw new Error(`Home não envia identidade temporal do voo: ${required}`);
}

for (const required of [
  'function flightAwareOccurrenceRank(',
  'function selectFlightAwareOccurrence(',
  "if (wantedOrigin && rowOrigin && wantedOrigin !== rowOrigin) return Number.POSITIVE_INFINITY;",
  "if (wantedDestination && rowDestination && wantedDestination !== rowDestination) return Number.POSITIVE_INFINITY;",
  'Math.abs(rowMs - targetMs)',
  "async function providerFlightAware(ctx, timeoutMs, origin = '', destination = '', scheduledDeparture = '')",
  'selectFlightAwareOccurrence(flights, origin, destination, scheduledDeparture)',
  "const scheduledDeparture = String(url.searchParams.get('scheduledDeparture') || '').trim();",
  'runRadarRace(ctx, origin, destination, scheduledDeparture)',
]) {
  if (!server.includes(required)) throw new Error(`Contrato de identidade da ocorrência ausente: ${required}`);
}

const start = server.indexOf('async function providerFlightAware(');
const end = server.indexOf('\nasync function providerCustom(', start + 1);
if (start < 0 || end < 0) throw new Error('providerFlightAware não localizado.');
const scope = server.slice(start, end);
if (scope.includes("flights.find((item) => !item.cancelled && !item.actual_in) || flights[0]")) {
  throw new Error('FlightAware ainda pode escolher a ocorrência errada apenas por estado/ordem.');
}

console.log('CrewCheck v14.3.92 radar occurrence-identity regression OK');
