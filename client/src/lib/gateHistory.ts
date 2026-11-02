import {captureAuthSession} from './authClient';
export type GateHistoryIdentity={flight:string;origin:string;destination:string;departureDate:string;scheduledDepartureUtc:string};
export type HistoricalGate={gate:string;provider:string;sourceUpdatedAt:string|null;observedAt:null;receivedAt:string;sequence:number;conflicted:boolean|null;outOfOrder?:boolean};
export type GateHistoryPage={kind:'historical-gate-records';currentConfirmation:false;order:'recorded-sequence';identity:GateHistoryIdentity;cursor:number;nextCursor:number|null;total:number;observations:HistoricalGate[];legacy?:boolean};
export async function readGateHistoryPage(identity:GateHistoryIdentity,cursor=0,legacy=false):Promise<GateHistoryPage|null>{
 const session=captureAuthSession();
 if(!session.token||!session.isCurrent())throw Error('Faça login para consultar o histórico.');
 const params=new URLSearchParams({...identity,cursor:String(cursor),...(legacy?{legacy:'1'}:{})});
 const response=await fetch('/api/radar-history?'+params,{method:'GET',headers:{authorization:'Bearer '+session.token},cache:'no-store'});
 if(!session.isCurrent())throw Error('A sessão mudou. Consulte novamente.');
 const body=await response.json();
 if(!session.isCurrent())throw Error('A sessão mudou. Consulte novamente.');
 if(!response.ok||body?.ok!==true)throw Error('Histórico indisponível. Isso não significa ausência de registros.');
 const page=body.history;
 if(page===null)return null;
 if(page?.kind!=='historical-gate-records'||page.currentConfirmation!==false||page.order!=='recorded-sequence'||page.cursor!==cursor||!Array.isArray(page.observations)||page.observations.length>100||
 !Object.keys(identity).every(k=>page.identity?.[k]===identity[k as keyof GateHistoryIdentity])||
 !Number.isSafeInteger(page.total)||page.total<page.observations.length||
 (page.nextCursor!==null&&page.nextCursor!==cursor+1))throw Error('Histórico sem ocorrência confirmada.');
 return page;
}
