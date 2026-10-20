import {useEffect,useMemo,useRef,useState} from 'react';
import type {CrewRoster} from './pdfParser';
import {startupOwner,startupKey} from './rosterStartup';
import {financialRateOwner,financialRateSession} from './financialStatementLearning';
import {isCurrentPlannedRoster,loadOwnedPlannedRoster} from './plannedRosterStore';
import {freeDayVersion,reviewFreeDayPostponements,verifiedCabinAct} from './freeDayPostponement';

/** One mounted Home producer; presentation consumers never evaluate or deliver. */
export function useFreeDayPostponementReview(roster:CrewRoster,source:string){
 const [revision,setRevision]=useState(0),authBoundary=useRef(false);
 const session=financialRateSession(),owner=financialRateOwner(),version=freeDayVersion(roster);
 useEffect(()=>{const update=(event?:Event)=>{if(event?.type==='crewcheck:auth-will-change'||event?.type==='crewcheck:auth-expired')authBoundary.current=true;else if(event?.type==='crewcheck:auth-changed')authBoundary.current=false;setRevision(value=>value+1);};const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:planned-roster-updated'];events.forEach(name=>window.addEventListener(name,update));const storage=(event:StorageEvent)=>{if(!event.key||['crewcheck_auth_token','crewcheck_auth_user',startupKey()].includes(event.key)||event.key.startsWith('crewcheck_planned_roster_snapshot_v2:'))update();};window.addEventListener('storage',storage);return()=>{events.forEach(name=>window.removeEventListener(name,update));window.removeEventListener('storage',storage);};},[]);
 return useMemo(()=>{
  const planned=loadOwnedPlannedRoster();let boundCurrent=false;
  try{const choice=JSON.parse(localStorage.getItem(startupKey())||'null');boundCurrent=Boolean(!authBoundary.current&&sessionStorage.getItem('crewcheck_admin_audit_mode')!=='1'&&owner&&startupOwner()===owner.toLowerCase()&&choice?.owner===startupOwner()&&choice?.cacheSchema==='p0-operational-date-anchor-v2'&&choice.roster?.days?.length&&freeDayVersion(choice.roster)===freeDayVersion(roster));}catch{/* Unbound input never gains an owner. */}
  const review=reviewFreeDayPostponements(planned&&isCurrentPlannedRoster(planned)?planned:null,roster,source,boundCurrent?owner||'':'',verifiedCabinAct(roster)&&Boolean(planned&&verifiedCabinAct(planned.roster)));
  const year=Number(roster.year),month=Number(roster.month);
  const period=Number.isInteger(year)&&year>=1900&&year<=9998&&Number.isInteger(month)&&month>=1&&month<=12?`${year}-${String(month).padStart(2,'0')}`:null;
  return {session:authBoundary.current?null:session,owner,boundCurrent,review,revision,period};
 },[session,owner,roster,source,version,revision]);
}
export type FreeDayPostponementEvaluation=ReturnType<typeof useFreeDayPostponementReview>;
