import { baseTimeZone } from './timezone-choice.mjs';

// Airport evidence extends the existing reviewed map; no device/UTC inference.
// DECEA ROTAER SBKG, D-AMDT30/26: Campina Grande/PB, UTC-3.
// https://aisweb.decea.mil.br/?codigo=SBKG&i=aerodromos
// IANA zone1970.tab assigns PB to America/Fortaleza.
// https://raw.githubusercontent.com/eggert/tz/main/zone1970.tab
export const reviewedAirportTimeZones = Object.freeze({
  CPV: Object.freeze({ zone: 'America/Fortaleza', icao: 'SBKG', region: 'BR-PB', reviewedOn: '2026-10-14' }),
});
export function airportTimeZone(airport) {
  const code = String(airport || '').trim().toUpperCase();
  return reviewedAirportTimeZones[code]?.zone || baseTimeZone(code);
}
