import {useEffect,useState} from 'react';
import {captureAuthSession} from './authClient';
import type {CanonicalRosterEvent} from './canonicalRoster';
import {ciriumRegulationArrivalEvidence,readRegulationOperationalArrival,regulationOperationalProjection} from '../../../shared/regulationOperationalArrival.mjs';
import {originFlightDate} from '../../../shared/gate-query-day.mjs';

// Same admitted host contract used by the detailed view. This hook creates no
// source/auth admission, subscription or fetch; it only shares the read fences.
export type RegulationOperationalArrivalInput={candidate:unknown;session:ReturnType<typeof captureAuthSession>;ownerScope:string;revision:string;receivedAt:string;isCurrent:()=>boolean};
export function useRegulationOperationalArrival({input,sourceAllowed,finalProgram,lastActivity,form}:{input?:RegulationOperationalArrivalInput|null;sourceAllowed:boolean;finalProgram?:CanonicalRosterEvent;lastActivity:string;form:{operation:string;postFlight:string;tasks:string;taxi:string}}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{if(!input)return;setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[input]);
 const number=(value:string)=>/^\d+$/.test(value)?Number(value):null;
 const current=()=>{try{const session=captureAuthSession();return Boolean(sourceAllowed&&input?.session.token&&input.session.owner&&input.session.isCurrent()&&input.session.owner===session.owner&&input.session.token===session.token&&input.isCurrent());}catch{return false;}};
 const admitted=current();
 const evidence=admitted?ciriumRegulationArrivalEvidence(input?.candidate,{ownerScope:input?.ownerScope,revision:input?.revision,receivedAt:input?.receivedAt}):null;
 const read=readRegulationOperationalArrival({evidence,admitted,expected:{ownerScope:input?.ownerScope,revision:input?.revision,lastActivity,occurrence:finalProgram?{flight:finalProgram.flightNumber,departureDate:originFlightDate(finalProgram.startDateTime,finalProgram.origin),origin:finalProgram.origin,destination:finalProgram.destination,scheduledDepartureUtc:finalProgram.startDateTime}:null},now,operation:form.operation,postFlightMinutes:number(form.postFlight),additionalTasksMinutes:number(form.tasks),taxiInMinutes:number(form.taxi)});
 return {read,projection:current()?regulationOperationalProjection(read):null};
}
