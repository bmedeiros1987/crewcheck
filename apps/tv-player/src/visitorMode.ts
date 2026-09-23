export const VISITOR_CODE_LABELS: Record<string,string>={
  BSB:'Brasília',GRU:'São Paulo / Guarulhos',CGH:'São Paulo / Congonhas',GIG:'Rio de Janeiro / Galeão',SDU:'Rio de Janeiro / Santos Dumont',
  CNF:'Belo Horizonte / Confins',FOR:'Fortaleza',REC:'Recife',SSA:'Salvador',POA:'Porto Alegre',CWB:'Curitiba',MAO:'Manaus',
  ASB:'Reserva no aeroporto',HSB:'Sobreaviso em casa',OFF:'Folga',DO:'Folga',DOF:'Folga',DOP:'Folga',
};
export function visitorCode(value:unknown):string {
  const code=String(value||'').trim().toUpperCase();
  return VISITOR_CODE_LABELS[code] || code;
}
export function visitorRoute(code:string|null):string {
  if(!code)return 'Local não informado';
  const translated=visitorCode(code);
  return translated===code?code:`${translated} (${code})`;
}
