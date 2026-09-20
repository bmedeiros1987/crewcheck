import type { TvActivity, TvSnapshot } from '../../../packages/tv-core/src/index';
import { airportCity } from '../../../client/src/lib/airports';

export type TvProgramKind='journey'|'stay'|'rest'|'duty';
export type TvProgram={
  key:string;
  kind:TvProgramKind;
  journeyId:string|null;
  activities:TvActivity[];
  flights:TvActivity[];
  first:TvActivity;
  last:TvActivity;
};

function timeMs(value:string){const n=Date.parse(value);return Number.isFinite(n)?n:0;}
function sortActivities(values:TvActivity[]){return [...values].sort((a,b)=>timeMs(a.startAt)-timeMs(b.startAt)||a.id.localeCompare(b.id));}

export function programsForDay(activities:TvActivity[]=[]):TvProgram[]{
  const buckets=new Map<string,TvActivity[]>();
  const order:string[]=[];
  for(const activity of sortActivities(activities)){
    // Pernoites e repousos precisam ter identidade visual própria; nunca são
    // absorvidos no card de voo mesmo quando compartilham journeyId.
    const separated=activity.kind==='stay'||activity.kind==='rest';
    const key=separated?`${activity.kind}:${activity.id}`:`journey:${activity.journeyId||activity.id}`;
    if(!buckets.has(key)){buckets.set(key,[]);order.push(key);}
    buckets.get(key)!.push(activity);
  }
  return order.map(key=>{
    const list=sortActivities(buckets.get(key)||[]);
    const first=list[0],last=list[list.length-1];
    const flights=list.filter(item=>item.kind==='flight');
    const kind:TvProgramKind=first.kind==='stay'?'stay':first.kind==='rest'?'rest':flights.length?'journey':'duty';
    return{key,kind,journeyId:first.journeyId||null,activities:list,flights,first,last};
  });
}

export function programForKey(snapshot:TvSnapshot,key:string|null):TvProgram|null{
  if(!key)return null;
  for(const day of snapshot.days||[]){
    const found=programsForDay(day.activities).find(program=>program.key===key);
    if(found)return found;
  }
  return null;
}

export function programPresentation(program:TvProgram):string|null{
  for(const activity of program.activities) if(activity.presentation)return activity.presentation;
  return null;
}

export function programRouteCodes(program:TvProgram):string[]{
  if(!program.flights.length){
    const point=program.first.destination||program.first.origin;
    return point?[point]:[];
  }
  const codes:string[]=[];
  for(const leg of program.flights){
    if(leg.origin && codes[codes.length-1]!==leg.origin)codes.push(leg.origin);
    if(leg.destination && codes[codes.length-1]!==leg.destination)codes.push(leg.destination);
  }
  return codes;
}

export function visitorAirportLabel(code:string|null|undefined, visitor=false):string{
  const normalized=String(code||'').trim().toUpperCase();
  if(!normalized)return 'Local não informado';
  const city=airportCity(normalized,normalized);
  return visitor && city!==normalized?`${city} (${normalized})`:normalized;
}

export function programTitle(program:TvProgram,visitor=false):string{
  if(program.kind==='stay'){
    const location=program.first.destination||program.first.origin;
    return location?`Pernoite · ${visitorAirportLabel(location,visitor)}`:'Pernoite publicado';
  }
  if(program.kind==='rest')return 'Repouso / folga publicada';
  if(program.kind==='journey'){
    const route=programRouteCodes(program);
    const routeText=route.map(code=>visitorAirportLabel(code,visitor)).join(' → ');
    return routeText || (program.flights.length===1?'Voo publicado':`Jornada · ${program.flights.length} etapas`);
  }
  return program.first.publishedCode||'Programação publicada';
}

export function programKicker(program:TvProgram):string{
  if(program.kind==='stay')return 'DESCANSO FORA DA BASE';
  if(program.kind==='rest')return 'DESCANSO';
  if(program.kind==='journey')return program.flights.length===1?'VOO · 1 ETAPA':`JORNADA · ${program.flights.length} ETAPAS`;
  return 'PROGRAMAÇÃO';
}

export function simpleCodeExplanation(code:string|null|undefined):string|null{
  const value=String(code||'').trim().toUpperCase();
  const dictionary:Record<string,string>={
    DO:'Folga publicada',DOF:'Folga publicada',DOP:'Folga publicada',
    HSB:'Sobreaviso em casa',HSBE:'Sobreaviso em casa',
    ASB:'Reserva no aeroporto',RES:'Reserva',RSV:'Reserva',
    PS:'Deslocamento como passageiro',PAX:'Deslocamento como passageiro',DH:'Deslocamento como passageiro',
    CRM:'Treinamento',SIM:'Simulador',CHECK:'Treinamento / cheque',
  };
  return dictionary[value]||null;
}

export function isVisitorPresentation(snapshot:TvSnapshot):boolean{
  return snapshot.privacy==='family' || (snapshot as any).audience==='visitor';
}
