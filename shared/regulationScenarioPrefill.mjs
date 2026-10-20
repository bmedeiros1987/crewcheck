// UI hydration only: the existing compliance engine supplies the legal reference.
// Scheduled block duration is deliberately never used as airborne duration.
import {explicitInstant} from './regulationTemporalScenario.mjs';
const clock=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function regulationCivilDate(value){
 const match=typeof value==='string'&&value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 const date=match?`${match[3]}-${match[2]}-${match[1]}`:value;
 return typeof date==='string'&&explicitInstant(date+'T00:00Z')!==null?date:'';
}
export function regulationScenarioSeed(day,reference,program){
 const seed={takeoff:'',normalEnd:'',offset:'',flight:'',delay:'0',taxi:'',postFlight:'',tasks:'',operation:'',extension:false,reviewed:false,publicationOffsetReviewed:false,composition:'',acclimatization:'unknown',limitSource:'Referência informada para esta simulação'};
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
 if(draft?.key!==key)return seed;
 const form={...seed,...draft.overrides};
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
 const ownReport=clock(first.leg?.presentationTime)?first.leg.presentationTime:first.legIndex===0&&firstDay?.dutyReportSource==='published'?firstDay.dutyReport:'';
 const ownDebrief=last.legIndex===(lastDay?.legs?.length||0)-1&&lastDay?.dutyDebriefSource==='published'?lastDay.dutyDebrief:'';
 const start=explicitInstant(first.startDateTime?.replace(/\.000Z$/,'Z'));
 let date=regulationCivilDate(firstDay?.date);
 if(start!==null&&clock(ownReport)){
  const departure=new Date(start-180*60000),civil=departure.toISOString().slice(0,10);
  const report=explicitInstant(civil+'T'+ownReport+'Z');
  const departClock=departure.toISOString().slice(11,16);
  date=new Date(report-(ownReport>departClock?86400000:0)).toISOString().slice(0,10);
 }
 return {...firstDay,date,dutyReport:ownReport,dutyReportSource:clock(ownReport)?'published':'unknown',dutyDebrief:ownDebrief,dutyDebriefSource:clock(ownDebrief)?'published':'unknown',dutyHours:null,flyingHours:null,legs:journey.map(event=>event.leg),isNextDay:journey.some(event=>event.isNextDay)||firstDay?.date!==lastDay?.date};
}
