// UI hydration only: the existing compliance engine supplies the legal reference.
// Scheduled block duration is deliberately never used as airborne duration.
import {explicitInstant} from './regulationTemporalScenario.mjs';
const clock=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const clockMinutes=value=>{const m=typeof value==='string'&&value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*\(\+\d+\))?$/);return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;};
const sameClock=(a,b)=>clockMinutes(a)!==null&&clockMinutes(a)===clockMinutes(b);
export function regulationCivilDate(value){
 const match=typeof value==='string'&&value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 const date=match?`${match[3]}-${match[2]}-${match[1]}`:value;
 return typeof date==='string'&&explicitInstant(date+'T00:00Z')!==null?date:'';
}
export function regulationScenarioSeed(day,reference,program){
 const seed={takeoff:'',normalEnd:'',offset:'',flight:'',delay:'0',taxi:'',postFlight:'',tasks:'',operation:'',extension:false,reviewed:false,publicationOffsetReviewed:false,composition:'',acclimatization:'unknown',limitSource:'Referência informada para esta simulação',method:'schedule',plannedEnd:'',plannedEndSource:'',scheduledArrival:'',reviewRequired:false};
 const date=regulationCivilDate(day?.date),leg=program?.leg||day?.legs?.[0];
 if(date&&clock(leg?.departureTime))seed.takeoff=date+'T'+leg.departureTime;
 // Canonical roster instants use the existing BRT publication clock, independent
 // of browser zone. Only use a selected event with an actual published clock.
 const programStart=explicitInstant(typeof program?.startDateTime==='string'?program.startDateTime.replace(/\.000Z$/,'Z'):'');
 if(clock(program?.leg?.departureTime)&&programStart!==null){
  seed.takeoff=new Date(programStart-180*60000).toISOString().slice(0,16);
  seed.offset='-03:00';
 }
 if(date&&clock(reference?.startTime)&&Number.isSafeInteger(reference?.maxDutyMinutes)&&reference.maxDutyMinutes>0){
  const start=explicitInstant(date+'T'+reference.startTime+'Z');
  seed.normalEnd=new Date(start+reference.maxDutyMinutes*60000).toISOString().slice(0,16);
  seed.limitSource='Motor existente · '+reference.source+' · aplicabilidade a confirmar';
 }
 return seed;
}
export function regulationDraftForm(draft,key,seed,basis){
 const current=draft?.key===key;
 const form={...seed,...(current?draft.overrides:{})};
 if(form.plannedEndSource.startsWith('Estimativa:')&&form.scheduledArrival){
  const arrival=explicitInstant(form.scheduledArrival+'Z');
  const post=/^\d+$/.test(form.postFlight)?Number(form.postFlight):null;
  const tasks=form.tasks===''?0:/^\d+$/.test(form.tasks)?Number(form.tasks):null;
  const minimum=form.operation==='domestic'?30:form.operation==='international'?45:null;
  form.plannedEnd=arrival!==null&&minimum!==null&&post!==null&&post>=minimum&&post<=360&&tasks!==null&&tasks<=1440?new Date(arrival+(post+tasks)*60000).toISOString().slice(0,16):'';
  form.plannedEndSource='Estimativa: chegada programada + pós-voo '+(form.tasks===''?'; tarefas adicionais não incluídas':'+ tarefas informadas');
 }
 if(!current)return form;
 // A changed publication/profile invalidates confirmation, not user overrides.
 if(draft.basis!==basis){form.reviewed=false;form.publicationOffsetReviewed=false;}
 return form;
}
export function resolveRegulationProgram(events,current,context){
 if(context?.programId)return events.find(event=>event.id===context.programId&&!event.placeholder&&!['stay','rest','journey-rest'].includes(event.kind))||null;
 return current||null;
}
export function regulationProgramDay(events,selected){
 if(!selected)return null;
 const canonical=selected.canonical,day=selected.day;
 if(!canonical?.journeyId||canonical.kind!=='flight')return day||null;
 const journey=events.filter(event=>event.canonical?.journeyId===canonical.journeyId&&event.kind==='flight').map(event=>event.canonical).sort((a,b)=>a.startDateTime.localeCompare(b.startDateTime));
 if(!journey.length)return null;
 const first=journey[0],last=journey.at(-1),firstDay=first.publishedDay,lastDay=last.publishedDay;
 const explicitLegReport=clock(first.leg?.presentationTime);
 const publishedReport=explicitLegReport||first.legIndex===0&&firstDay?.dutyReportSource==='published'&&clock(firstDay.dutyReport);
 // A legacy/estimated clock is useful for a labelled simulation, never for a
 // published-duration proof. Do not borrow the day's report for a later journey.
 const ownReport=explicitLegReport?first.leg.presentationTime:first.legIndex===0&&clock(firstDay?.dutyReport)&&(firstDay.dutyReportSource==='published'||!sameClock(firstDay.dutyReport,first.departure||first.leg?.departureTime))?firstDay.dutyReport:first.legIndex===0&&clock(first.presentation)&&!sameClock(first.presentation,first.departure||first.leg?.departureTime)?first.presentation:'';
 const ownDebrief=last.legIndex===(lastDay?.legs?.length||0)-1&&lastDay?.dutyDebriefSource==='published'?lastDay.dutyDebrief:'';
 const start=explicitInstant(first.startDateTime?.replace(/\.000Z$/,'Z'));
 let date=regulationCivilDate(firstDay?.date);
 if(start!==null&&clock(ownReport)){
  const departure=new Date(start-180*60000),civil=departure.toISOString().slice(0,10);
  const report=explicitInstant(civil+'T'+ownReport+'Z');
  const departClock=departure.toISOString().slice(11,16);
  date=new Date(report-(ownReport>departClock?86400000:0)).toISOString().slice(0,10);
 }
 const rosterDate=date?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):'';
 return {...firstDay,date:rosterDate,regulationJourney:journey,dutyReport:ownReport,dutyReportSource:publishedReport?'published':clock(ownReport)?'estimated':'unknown',dutyDebrief:ownDebrief,dutyDebriefSource:clock(ownDebrief)?'published':'unknown',dutyHours:null,flyingHours:null,legs:journey.map(event=>event.leg),isNextDay:journey.some(event=>event.isNextDay)||firstDay?.date!==lastDay?.date};
}

// Comparison of published/estimated duty end, independent from airborne/taxi.
// No arrival clock is renamed as touchdown or engine stop.
export function regulationScheduleProjection(form){
 const end=explicitInstant(form.plannedEnd+form.offset),limit=explicitInstant(form.normalEnd+form.offset);
 const delay=/^\d+$/.test(form.delay)?Number(form.delay):null;
 const missing=[];
 const departure=explicitInstant(form.takeoff+form.offset);
 if(end!==null&&departure!==null&&end<departure)missing.push('Encerramento anterior à partida da programação');
 if(end===null)missing.push('Encerramento programado ou estimado da jornada');
 if(limit===null)missing.push('Limite normal da jornada');
 const engineLimit=form.limitSource?.startsWith('Motor existente');
 if((!engineLimit||form.reviewRequired===true)&&form.reviewed!==true)missing.push('Limite normal revisado');
 if(delay===null||delay>1440)missing.push('Atraso previsto');
 const manualReviewed=form.reviewed===true&&!form.limitSource?.startsWith('Motor existente');
 if(form.composition&&form.composition!=='simple'&&!manualReviewed)missing.push('Limite aplicável à composição informada');
 if(form.acclimatization==='not_acclimatized'&&!manualReviewed)missing.push('Limite aplicável à aclimatação informada');
 if(missing.length)return {state:'indeterminate',missing,base:{},scenario:{},authorization:'not_assessed'};
 const scenarioEnd=end+delay*60000,marginMinutes=(limit+(form.extension?60:0)*60000-scenarioEnd)/60000;
 return {state:marginMinutes>=0?'within_temporal_reference':'exceeds_temporal_reference',missing:[],marginMinutes,crossesReferenceDate:form.plannedEnd.slice(0,10)!==new Date(scenarioEnd+(form.offset[0]==='-'?-1:1)*(Number(form.offset.slice(1,3))*60+Number(form.offset.slice(4)))*60000).toISOString().slice(0,10),base:{dutyEnd:new Date(end).toISOString()},scenario:{dutyEnd:new Date(scenarioEnd).toISOString()},authorization:'not_assessed'};
}
