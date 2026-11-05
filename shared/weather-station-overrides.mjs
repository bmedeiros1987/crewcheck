// Reviewed static identity only; not a provider lookup or global airport catalog.
// 2026-10-25: operator explicitly lists IATA BPS / ICAO SBPS; ANAC corroborates.
// https://www.portoseguro-aero.com.br/caracteristicas-do-aeroporto/
// https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2025/portaria-16406
export function reviewedWeatherStation(code) {
  return typeof code === 'string' && code.trim().toUpperCase() === 'BPS' ? 'SBPS' : null;
}
