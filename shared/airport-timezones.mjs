import { baseTimeZone } from './timezone-choice.mjs';

// Airport evidence extends the existing reviewed map; no device/UTC inference.
// DECEA ROTAER SBKG, D-AMDT30/26: Campina Grande/PB, UTC-3.
// https://aisweb.decea.mil.br/?codigo=SBKG&i=aerodromos
// IANA zone1970.tab assigns PB to America/Fortaleza.
// https://raw.githubusercontent.com/eggert/tz/main/zone1970.tab
// Additional operational airports are reviewed independently of personal base
// choices. Evidence (airport identity/location + IANA region) is recorded in
// docs/airport-timezones-reviewed.md. Never infer from a supplied event zone,
// device preference, nearby coordinates or a fixed UTC offset.
export const reviewedAirportTimeZones = Object.freeze({
  CPV: Object.freeze({ zone: 'America/Fortaleza', icao: 'SBKG', region: 'BR-PB', reviewedOn: '2026-10-14' }),
  FLN: Object.freeze({ zone: 'America/Sao_Paulo', icao: 'SBFL', region: 'BR-SC', reviewedOn: '2026-11-08' }),
  NAT: Object.freeze({ zone: 'America/Fortaleza', icao: 'SBSG', region: 'BR-RN', reviewedOn: '2026-11-08' }),
  VIX: Object.freeze({ zone: 'America/Sao_Paulo', icao: 'SBVT', region: 'BR-ES', reviewedOn: '2026-11-08' }),
  JFK: Object.freeze({ zone: 'America/New_York', region: 'US-NY', reviewedOn: '2026-11-08' }),
  LIS: Object.freeze({ zone: 'Europe/Lisbon', region: 'PT-mainland', reviewedOn: '2026-11-08' }),
});
export function airportTimeZone(airport) {
  const code = String(airport || '').trim().toUpperCase();
  return reviewedAirportTimeZones[code]?.zone || baseTimeZone(code);
}
