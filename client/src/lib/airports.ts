const AIRPORT_CITY: Record<string, string> = {
  AJU: 'Aracaju',
  BEL: 'Belém',
  BSB: 'Brasília',
  CGH: 'São Paulo',
  CNF: 'Belo Horizonte',
  CWB: 'Curitiba',
  CXJ: 'Caxias do Sul',
  FOR: 'Fortaleza',
  GIG: 'Rio de Janeiro',
  GRU: 'São Paulo',
  MAO: 'Manaus',
  MAB: 'Marabá',
  MCZ: 'Maceió',
  NAT: 'Natal',
  PMW: 'Palmas',
  POA: 'Porto Alegre',
  OPS: 'Sinop',
  CPV: 'Campina Grande',
  RAO: 'Ribeirão Preto',
  REC: 'Recife',
  SDU: 'Rio de Janeiro',
  SLZ: 'São Luís',
  SSA: 'Salvador',
  THE: 'Teresina',
  VCP: 'Campinas',
  VIX: 'Vitória',
};

export function airportCity(code?: string, fallback = 'Aeroporto') {
  const raw = String(code || '').trim().toUpperCase();
  const value = raw==='SBSI'?'OPS':raw==='SBKG'?'CPV':raw;
  return AIRPORT_CITY[value] || value || fallback;
}

// DECEA ROTAER, inspected 2026-10-18. Geographic reference only: neither a
// route nor a company remuneration distance can be inferred from these points.
export const reviewedAirportGeography={
 OPS:{iata:'OPS',icao:'SBSI',city:'Sinop',lat:-(11+53/60+6/3600),lon:-(55+35/60+10/3600),source:'https://aisweb.decea.mil.br/?codigo=SBSI&i=aerodromos'},
 CPV:{iata:'CPV',icao:'SBKG',city:'Campina Grande',lat:-(7+16/60+9/3600),lon:-(35+53/60+42/3600),source:'https://aisweb.decea.mil.br/?codigo=SBKG&i=aerodromos'},
} as const;
