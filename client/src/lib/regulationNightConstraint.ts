import type {CrewRoster, RosterDay, FlightLeg} from './pdfParser';
import type {CanonicalRosterEvent} from './canonicalRoster';
import {buildCanonicalRosterEvents} from './canonicalRoster';
import {measureCanonicalDuty} from './canonicalDutyMeasurement';
import {getRosterCodeDefinition} from './rosterCodes';
import {getActRulesForProfile, type LegalProfileSummary} from './actRules';
import {airportTimeZone} from '../../../shared/airport-timezones.mjs';

const MIN=60_000,HOUR=60*MIN,DAY=24*HOUR;
const clock=(v:unknown)=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function dateKey(value:unknown){const s=String(value||''),m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),iso=m?`${m[3]}-${m[2]}-${m[1]}`:s;if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return '';const n=Date.parse(iso+'T12:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===iso?iso:'';}
const legKey=(date:unknown,l:FlightLeg)=>JSON.stringify([dateKey(date),...[l.flightNumber,l.origin,l.destination,l.departureTime,l.arrivalTime].map(v=>String(v||'').trim().toUpperCase())]);
const activityKey=(d:RosterDay)=>JSON.stringify([dateKey(d.date),d.type||d.pairingCode||'OTHER',d.dutyReport,d.dutyDebrief]);
function localParts(ms:number,zone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms);const v=(k:string)=>p.find(x=>x.type===k)!.value;return {date:`${v('year')}-${v('month')}-${v('day')}`,hour:Number(v('hour')),minute:Number(v('minute'))};}
function wall(date:string,hour:number,zone:string){const target=Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00Z`);let ms=target;for(let i=0;i<4;i++){const p=localParts(ms,zone),represented=Date.parse(`${p.date}T${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}:00Z`);ms+=target-represented;}const p=localParts(ms,zone);return p.date===date&&p.hour===hour&&p.minute===0?ms:null;}
function bands(start:number,end:number,zone:string){const from=Date.parse(localParts(start,zone).date+'T12:00:00Z')-DAY,to=Date.parse(localParts(end,zone).date+'T12:00:00Z')+DAY;const result:{date:string;start:number;end:number}[]=[];for(let d=from;d<=to;d+=DAY){const date=new Date(d).toISOString().slice(0,10),s=wall(date,0,zone),e=wall(date,6,zone);if(s===null||e===null)return null;if(start<e&&end>=s)result.push({date,start:s,end:e});}return result;}

export type NightConstraint={state:'unknown'|'below'|'at'|'restricted';reason:string;basis:string;zone:string|null;latestDutyEnd:string|null;deadlineExclusive:string|null;consecutive:number|null;in168h:number|null;windowAnchor:string|null;projectedNight:boolean|null;thirdExtraException:boolean;applicability:'supported_act_comparison'|'unverified';};
/** A separate Law/ACT comparison, not proof that the B.1/GRF regime applies.
 * Full published duty endpoints count; a flight-only intersection cannot prove
 * absence of night work. Never substitutes estimated release for publication. */
export function regulationNightConstraint({roster,journey,start,referenceEnd,projectedEnd,profile,workTypes}:{roster?:CrewRoster|null;journey:readonly CanonicalRosterEvent[];start:number|null;referenceEnd:number|null;projectedEnd:number|null;profile?:LegalProfileSummary|null;workTypes:readonly string[]}):NightConstraint{
 const basis='Lei 13.475/2017 art.42 + ACT Comissários 3.3.14';
 const result:NightConstraint={state:'unknown',reason:'Histórico, perfil e fuso da base precisam ser comprovados',basis,zone:null,latestDutyEnd:null,deadlineExclusive:null,consecutive:null,in168h:null,windowAnchor:null,projectedNight:null,thirdExtraException:false,applicability:'unverified'};
 if(!roster?.days?.length||!journey.length||start===null||!Number.isFinite(start))return result;
 const rule=profile&&['cabin','pilot'].includes(profile.role)?getActRulesForProfile(profile):null;
 // Do not infer operator GRF approval, Appendix B clock or an ACT from B.1.
 if(!profile||profile.role!=='cabin'||profile.confidence!=='alta'||!rule||profile.actName!==rule.actName||!profile.sourceFiles?.includes(rule.sourceFile))return {...result,reason:'Aplicabilidade do ACT/perfil não comprovada; B.1 não comprova GRF'};
 if(rule.nightOps.maxConsecutive!==2||rule.nightOps.maxIn168h!==4||rule.nightOps.resetAfterFreeHours!==48)return {...result,reason:'Regra ACT diferente do contrato implementado'};
 if(roster.airline!=='LATAM')return {...result,reason:'Operador/ACT da publicação não comprovado'};
 const zone=airportTimeZone(roster.base);if(!zone)return {...result,reason:'Fuso da base contratual não comprovado'};result.zone=zone;result.applicability='supported_act_comparison';
 const scenarioDate=localParts(start,zone).date;if(scenarioDate<'2025-12-01'||scenarioDate>'2027-11-30')return {...result,state:'unknown',reason:'Vigência do ACT não comprovada para a data',applicability:'unverified'};
 const events=buildCanonicalRosterEvents(roster),selectedIds=new Set(journey.map(e=>e.journeyId));
 const representedLegs=new Set(events.filter(e=>e.kind==='flight'&&e.leg).map(e=>legKey(e.publishedDay.date,e.leg!)));
 const representedActivities=new Set(events.filter(e=>e.kind==='duty').map(e=>activityKey(e.publishedDay)));
 const recordMissing=(record:unknown):boolean=>{
  if(!object(record)||!dateKey(record.date)||!Array.isArray(record.legs))return true;
  if(record.legs.length)return record.legs.some((l:FlightLeg)=>!object(l)||!clock(l.departureTime)||!clock(l.arrivalTime)||!representedLegs.has(legKey(record.date,l)));
  return getRosterCodeDefinition(record.type)?.category!=='DAY_OFF'&&!representedActivities.has(activityKey(record as RosterDay));
 };
 const retainedMissing=(value:unknown):boolean=>!object(value)||(value.records!==undefined?(!Array.isArray(value.records)||!value.records.length||value.records.some(recordMissing)):recordMissing(value));
 const from=start-168*HOUR,firstDate=localParts(from,zone).date,lastDate=localParts(start,zone).date;
 const days=roster.days.filter(d=>!(d as any).continuityInferred&&dateKey(d.date)>=firstDate&&dateKey(d.date)<=lastDate);
 const dates=new Set(days.map(d=>dateKey(d.date)));
 for(let d=Date.parse(firstDate+'T12:00Z');d<=Date.parse(lastDate+'T12:00Z');d+=DAY){if(!dates.has(new Date(d).toISOString().slice(0,10)))return {...result,reason:'Histórico diário incompleto na janela anterior de 168h'};}
 if(days.some(recordMissing)||days.some(d=>Object.hasOwn(d,'publishedClockEvidence')&&retainedMissing((d as any).publishedClockEvidence))||Object.hasOwn(roster,'publishedActivityEvidence')&&retainedMissing((roster as any).publishedActivityEvidence))return {...result,reason:'Atividade publicada sem cobertura/temporização íntegra'};
 const groups=new Map<string,CanonicalRosterEvent[]>();for(const e of events){if(!['flight','duty'].includes(e.kind)||selectedIds.has(e.journeyId))continue;const group=groups.get(e.journeyId)||[];group.push(e);groups.set(e.journeyId,group);}
 const previous:{id:string;start:number;end:number;night:boolean;availability:boolean}[]=[];
 for(const [id,group] of groups){const selected=group[0],estimate=Date.parse(selected.startDateTime);if(estimate>=start||estimate<from-DAY)continue;const m=measureCanonicalDuty(events,selected.id);if(m?.state!=='available'||!m.start||!m.end)return {...result,reason:'Início/fim de jornada anterior não comprovado'};const s=Date.parse(m.start),end=Date.parse(m.end);if(end>start)return {...result,reason:'Jornadas publicadas sobrepostas'};if(end<from)continue;const touched=bands(s,end,zone);if(touched===null)return {...result,reason:'Transição do fuso sem extremos verificáveis'};const category=getRosterCodeDefinition(selected.publishedDay.type)?.category;previous.push({id,start:s,end,night:touched.length>0,availability:category==='STANDBY'||category==='RESERVE'});}
 previous.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
 // The Law/ACT 168h anchor is PRESENTATION, not first midnight touch.
 // A reset requires a proven activity-free gap; availability blocks that gap.
 const coverageStart=wall(firstDate,0,zone);if(coverageStart===null)return result;
 let busyEnd=coverageStart,anchor:number|null=null,consecutive=0,count=0;
 for(const j of previous){if(j.start-busyEnd>=48*HOUR){anchor=j.start;count=0;consecutive=0;}if(anchor===null)anchor=j.start;if(j.start-anchor>=168*HOUR){anchor=j.start;count=0;}if(!j.availability){if(j.night){count++;consecutive++;}else consecutive=0;}busyEnd=Math.max(busyEnd,j.end);}
 if(start-busyEnd>=48*HOUR){anchor=start;count=0;consecutive=0;}if(anchor===null)anchor=start;if(start-anchor>=168*HOUR){anchor=start;count=0;}
 const end=referenceEnd??projectedEnd;if(end===null||!Number.isFinite(end)||end<start)return {...result,reason:'Encerramento da jornada não calculável'};
 const potential=bands(start,end,zone),projected=projectedEnd===null?null:bands(start,projectedEnd,zone);if(potential===null||projected===null&&projectedEnd!==null)return {...result,reason:'Intervalo/fuso do cenário não comprovado'};
 const finalDestination=journey.at(-1)?.destination;
 const extra=workTypes.length>0&&workTypes.every(t=>t==='PS')&&!!roster.base&&finalDestination===roster.base;
 const thirdExtra=consecutive===2&&extra;
 const banConsecutive=consecutive>=2&&!thirdExtra,banWindow=count>=4;
 const forbidden=(banConsecutive||banWindow)?potential[0]:null;
 const deadline=forbidden?forbidden.start:null;
 // Minute-resolution display is strictly before midnight, with an explicit
 // exclusive threshold retained for callers. No fabricated 30min tolerance.
 const latest=deadline!==null&&deadline>start?Math.floor((deadline-1)/MIN)*MIN:null;
 return {...result,state:forbidden?'restricted':(potential.length&&(consecutive+1===2||count+1===4))?'at':'below',reason:forbidden?(banWindow?'Quinta madrugada excederia quatro no período de 168h':'Nova madrugada excederia a sequência admitida'):(thirdExtra&&potential.length?'Terceira madrugada exclusivamente extra de retorno à base; teto diário ainda depende de regra PS':'Comparação de madrugadas com histórico publicado; não é autorização operacional'),latestDutyEnd:latest===null?null:new Date(latest).toISOString(),deadlineExclusive:deadline===null?null:new Date(deadline).toISOString(),consecutive:consecutive+(potential.length?1:0),in168h:count+(potential.length?1:0),windowAnchor:new Date(anchor).toISOString(),projectedNight:projected===null?null:projected.length>0,thirdExtraException:thirdExtra&&potential.length>0};
}

export function nightDutyTouches(start:number,end:number,base:string){const zone=airportTimeZone(base);if(!zone)return null;const touched=bands(start,end,zone);return touched===null?null:touched.length>0;}
