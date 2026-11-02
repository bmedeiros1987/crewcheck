import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import RosterLaunchView from '../../client/src/components/v1391/RosterLaunchView';
import { AimsDocumentView } from '../../client/src/components/v1391/AimsDocumentView';
import { AimsRosterTable } from '../../client/src/components/v1391/AimsRosterTable';
import { rosterProgramMode, rosterModeMeta } from '../../client/src/lib/rosterPresentation';
import { HomeRosterPreview } from '../../client/src/components/v1391/HomeRosterPreview';
import { RosterLegend, useRosterCategoryFilter } from '../../client/src/components/v1391/RosterLegend';
import { rosterInstantIso, ROSTER_DISPLAY_TIME_ZONE } from '../../client/src/lib/rosterDisplayDate';
const win = window as any;
const today = rosterInstantIso(new Date(), ROSTER_DISPLAY_TIME_ZONE)!;
const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
const nextDay = next.toISOString().slice(0,10);
function make(id:string,type:string,extra:any={}) { return {id,kind:'duty',origin:'BSB',destination:'BSB',date:new Date(`${today}T15:30:00Z`),day:{date:today,type,pairingCode:type},canonical:{id,kind:'duty',date:today,publishedDay:{type,date:today},startDateTime:`${today}T15:30:00Z`,endDateTime:`${today}T16:30:00Z`},...extra}; }
const input = [
 make('base','DESCANSO_BASE_CONTINUIDADE',{kind:'stay',departure:'12:30',arrival:'04:10',presentation:'12:30',canonical:{id:'base',kind:'stay',date:today,publishedDay:{type:'DESCANSO_BASE_CONTINUIDADE'},startDateTime:`${today}T15:30:00Z`,endDateTime:`${nextDay}T07:10:00Z`}}),
 make('night','PERNOITE_CONTINUIDADE',{kind:'stay',origin:'CGH',destination:'CGH',departure:'13:00',arrival:'05:20(+1)',presentation:'13:00',canonical:{id:'night',kind:'stay',date:today,publishedDay:{type:'PERNOITE_CONTINUIDADE'},startDateTime:`${today}T16:00:00Z`,endDateTime:`${nextDay}T08:20:00Z`}}),
 make('off','DO',{kind:'rest',departure:'00:00',arrival:'23:59',presentation:'00:00'}),
 make('flight','FLIGHT',{kind:'flight',flightNumber:'QA0001',origin:'AAA',destination:'BBB',departure:'10:00',arrival:'11:00',presentation:'09:00',leg:{workType:'OP'}}),
 make('extra','FLIGHT',{kind:'flight',flightNumber:'QA0002',origin:'BBB',destination:'CCC',departure:'12:00',arrival:'13:00',presentation:'11:00',leg:{workType:'PS'}}),
 make('reserve','ASB',{departure:'06:30',arrival:'12:30',presentation:'06:30'}),make('standby','HSB'),make('training','CRM'),
 make('unknown','ZZZ'),
 make('tomorrow','ASB',{day:{type:'ASB',date:nextDay},canonical:{id:'tomorrow',kind:'duty',date:nextDay,publishedDay:{type:'ASB',date:nextDay}}}),
 make('unconfirmed','ASB',{date:undefined,day:{type:'ASB',date:'invalid'},canonical:{id:'unconfirmed',kind:'duty',date:'invalid',publishedDay:{type:'ASB',date:'invalid'}}}),
];
input.find(event=>event.id==='off')!.canonical.groundBeforeMinutes=120; // Deliberate residual operational metadata on formal DO.
const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze)}return v;};freeze(input);
const finance={perdiem:{rows:[{iso:today,label:'Refeição sintética',value:100,currency:'BRL',convertedBRL:100}]},salary:{configured:true,rows:[{id:'flight',timeKnown:true,distanceKnown:true,km:100,dayKm:100,nightKm:0,dayRateApplied:1,nightRateApplied:0,total:100},{id:'extra',timeKnown:true,distanceKnown:true,km:50,dayKm:50,nightKm:0,dayRateApplied:1,nightRateApplied:0,total:50}]}};
freeze(finance);win.__initial=input;win.__before=JSON.stringify(input);win.__today=today;win.__nextDay=nextDay;
function Probe({events}:{events:any[]}) { const filter=useRosterCategoryFilter(events);win.__choose=filter.choose;win.__filter=filter.filter;return <RosterLegend events={events} selected={filter.filter} onSelect={filter.choose} periodLabel="Período sintético"/>; }
function Harness() {
 const [events,setEvents]=useState<any[]>(input),[surface,setSurface]=useState('home'),[,refresh]=useState(0);
 win.__setSurface=setSurface;win.__setEvents=(next:any[])=>setEvents(next);win.__refresh=()=>refresh(v=>v+1);
 win.__setOwner=(id:string,token='synthetic-'+id)=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id}));localStorage.setItem('crewcheck_auth_token',token);window.dispatchEvent(new Event('crewcheck:auth-changed'));refresh(v=>v+1);};
 return <main className="cz-app" data-fixture-surface={surface} data-version="synthetic" data-view={surface==='home'?'cockpit':'roster'}>{surface==='home'?<HomeRosterPreview events={events} onNavigate={view=>win.__navigation=view}/>:surface==='hook'?<Probe events={events}/>:surface==='document'?<AimsDocumentView events={events} month={today.slice(0,7)} describe={event=>{const mode=rosterProgramMode(event);return {mode,label:rosterModeMeta[mode].label}}}/>:surface==='table'?<AimsRosterTable events={events} showHistory={false}/>:<RosterLaunchView events={events} finance={finance} setView={view=>win.__navigation=view}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
