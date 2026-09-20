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

const ICAO_TO_IATA:Record<string,string>={
  SBBR:'BSB',SBGR:'GRU',SBSP:'CGH',SBKP:'VCP',SBRJ:'SDU',SBGL:'GIG',SBCF:'CNF',SBCT:'CWB',
  SBPA:'POA',SBFL:'FLN',SBSV:'SSA',SBRF:'REC',SBFZ:'FOR',SBBE:'BEL',SBEG:'MAO',SBSL:'SLZ',
  SBSG:'NAT',SBMO:'MCZ',SBAR:'AJU',SBPJ:'PMW',SBTE:'THE',SBVT:'VIX',SBGO:'GYN',SBCY:'CGB',
  SBCG:'CGR',SBRP:'RAO',SBCX:'CXJ',SBFI:'IGU',SBNF:'NVT',SBJP:'JPA',
  SCEL:'SCL',SPJC:'LIM',SAEZ:'EZE',SABE:'AEP',SUMU:'MVD',SGAS:'ASU',SKBO:'BOG',KMIA:'MIA',KMCO:'MCO',
};
export function airportCodeExplanation(code:string|null|undefined):{iata:string;icao:string|null;city:string}|null{
  const raw=String(code||'').trim().toUpperCase();
  if(!raw)return null;
  const iata=raw.length===4?(ICAO_TO_IATA[raw]||''):raw;
  const icao=raw.length===4?raw:null;
  if(!iata)return{ iata:raw, icao, city:raw };
  return{ iata, icao, city:airportCity(iata,iata) };
}

export function visitorAirportLabel(code:string|null|undefined, visitor=false):string{
  const normalized=String(code||'').trim().toUpperCase();
  if(!normalized)return 'Local não informado';
  if(!visitor)return normalized;
  const explained=airportCodeExplanation(normalized);
  if(!explained)return normalized;
  if(explained.city===explained.iata && !explained.icao)return explained.iata;
  const codes=explained.icao?`${explained.iata} · ${explained.icao}`:explained.iata;
  return explained.city!==explained.iata?`${explained.city} (${codes})`:`${codes}`;
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

export function calendarProgramSummary(activities:TvActivity[]=[],visitor=false):{kind:TvProgramKind;title:string;meta:string;programs:number}{
  const programs=programsForDay(activities);
  if(!programs.length)return{kind:'duty',title:'Sem programação',meta:'',programs:0};
  if(programs.length===1){
    const program=programs[0];
    const meta=program.kind==='journey'
      ? (program.flights.length===1?'1 etapa':`${program.flights.length} etapas`)
      : program.kind==='stay'?'Pernoite'
      : program.kind==='rest'?'Descanso':'Programação';
    return{kind:program.kind,title:programTitle(program,visitor),meta,programs:1};
  }
  const flightPrograms=programs.filter(program=>program.kind==='journey');
  const stayPrograms=programs.filter(program=>program.kind==='stay');
  const totalLegs=flightPrograms.reduce((sum,program)=>sum+program.flights.length,0);
  const parts=[totalLegs?`${totalLegs} etapas`:'',stayPrograms.length?`${stayPrograms.length} pernoite${stayPrograms.length>1?'s':''}`:''].filter(Boolean);
  return{kind:flightPrograms.length?'journey':programs[0].kind,title:`${programs.length} programações`,meta:parts.join(' · '),programs:programs.length};
}
