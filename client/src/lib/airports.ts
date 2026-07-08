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
  const value = String(code || '').trim().toUpperCase();
  return AIRPORT_CITY[value] || value || fallback;
}
