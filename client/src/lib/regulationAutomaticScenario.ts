import {getScheduledDutyLimitReference} from './complianceEngine';
import {regulationAircraftEvidence} from './regulationAircraftEvidence';
import {resolvePerDiemRule} from './financialRules';
import type {RosterDay,FlightLeg} from './pdfParser';
import type {CanonicalRosterEvent} from './canonicalRoster';
import type {LegalProfileSummary} from './actRules';
import {explicitInstant} from '../../../shared/regulationTemporalScenario.mjs';
import {publishedDutyEndpoints} from './canonicalDutyMeasurement';

export const REGULATION_AUTOMATIC_REFERENCE_VERSION='existing-compliance-B1-acd447ea-2026-10-20.1';
const clock=(v:unknown):v is string=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const civilDate=(v:unknown)=>typeof v==='string'&&/^\d{2}\/\d{2}\/\d{4}$/.test(v)?`${v.slice(6)}-${v.slice(3,5)}-${v.slice(0,2)}`:'';
const integer=(v:string,max:number)=>/^\d+$/.test(v)&&Number(v)<=max?Number(v):null;
const civil=(stamp:number)=>new Date(stamp-180*60_000).toISOString().slice(0,16);
export type AutomaticRegulationForm={presentation:string;offset:string;composition:string;acclimatization:string;postFlight:string;tasks:string;taxi:string;delay:string;operation:string;plannedEnd:string;timingChange:string;equipment:string[];workTypes:string[]};
export function regulationAutomaticContext(day:(RosterDay&{regulationJourney?:CanonicalRosterEvent[]})|null|undefined,program?:CanonicalRosterEvent|null){
 const journey=day?.regulationJourney||[];
 const scoped=Boolean(day&&program?.journeyId&&journey.length&&journey.every(e=>e.journeyId===program.journeyId&&e.kind==='flight')&&journey.some(e=>e.id===program.id));
 const legs=scoped?journey.map(e=>e.leg).filter(Boolean) as FlightLeg[]:[];
 const aircraft=regulationAircraftEvidence(legs);
 const publicationReport=scoped&&day?.dutyReportSource==='published'&&clock(day.dutyReport)?day.dutyReport:'';
 const date=civilDate(day?.date);
 const airports=legs.flatMap(leg=>[leg.origin,leg.destination]);
 const geography=airports.map(code=>code?resolvePerDiemRule(code,code,{}).kind:'pending');
 const operation=geography.length&&geography.every(kind=>kind!=='pending')?(geography.includes('international')?'international':'domestic'):'';
 const postFlight=operation==='domestic'?'30':operation==='international'?'45':'';
 const endpoints=scoped&&program?publishedDutyEndpoints(journey,program.id):null;
 const end=endpoints?.end;
 const last=journey.at(-1),scheduledArrival=last&&clock(last.leg?.arrivalTime)?Date.parse(last.endDateTime):NaN;
 const publishedEnd=typeof end==='number'&&Number.isFinite(end)?civil(end):'';
 const plannedEnd=publishedEnd||(Number.isFinite(scheduledArrival)&&postFlight?civil(scheduledArrival+Number(postFlight)*60_000):'');
 const form:AutomaticRegulationForm={presentation:publicationReport&&date?date+'T'+publicationReport:'',offset:'-03:00',composition:aircraft.group==='NB'?'simple':'',acclimatization:'acclimatized',postFlight,tasks:'0',taxi:'',delay:'0',operation,plannedEnd,timingChange:'flight-delay',equipment:legs.map(leg=>leg.aircraftType||''),workTypes:legs.map(leg=>leg.workType||'')};
 return {scoped,journey,legs,aircraft,publicationReport,form,plannedEndSource:publishedEnd?'published_release':plannedEnd?'scheduled_arrival_plus_scenario_postflight':'missing',scheduledArrival:Number.isFinite(scheduledArrival)?scheduledArrival:null};
}

// One existing engine produces the numeric reference. This function does not
// choose a new table or claim operational/legal applicability from defaults.
export function regulationAutomaticAssessment(context:ReturnType<typeof regulationAutomaticContext>,form:AutomaticRegulationForm,profile?:LegalProfileSummary|null){
 const missing:string[]=[],conditions:string[]=[];
 const stamp=explicitInstant(form.presentation+form.offset),date=form.presentation.slice(0,10),report=form.presentation.slice(11,16);
 const legs=context.legs.map((leg,index)=>({...leg,aircraftType:form.equipment[index]??leg.aircraftType,workType:form.workTypes[index]??leg.workType}));
 const aircraft=regulationAircraftEvidence(legs);
 if(!context.scoped)missing.push('Selecione uma jornada publicada');
 if(stamp===null||!clock(report))missing.push('Apresentação com data e fuso');
 if(!legs.length)missing.push('Etapas publicadas da jornada');
 const classifications=legs.map(leg=>String(leg.workType||'').toUpperCase());
 if(classifications.some(type=>!['OP','PS'].includes(type)))missing.push('Classificação OP/PS das etapas');
 if(classifications.includes('PS'))missing.push('Regra para deslocamentos PS não implementada nesta referência');
 const editedPresentation=form.presentation!==context.form.presentation;
 const sourceDay={...(context.journey[0]?.publishedDay||{}),date:`${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`,type:'VOO',dutyReport:report,dutyReportSource:editedPresentation?'unknown':'published',legs} as RosterDay;
 const reference=!missing.length?getScheduledDutyLimitReference(sourceDay,profile):null;
 if(!reference&&!missing.length)missing.push('Referência do motor indisponível para a apresentação');
 if(form.composition&&form.composition!=='simple')conditions.push('A composição informada exige regra própria; B.1 simples é apenas comparação');
 if(form.acclimatization!=='acclimatized')conditions.push('Aclimatação fora da hipótese B.1 implementada');
 if(form.timingChange!=='flight-delay')conditions.push('Apresentação alterada ou reprogramação exige regra específica');
 if(aircraft.group!=='NB')conditions.push(aircraft.group==='WB'?'WB não comprova composição; a referência simples não é aplicabilidade confirmada':aircraft.group==='mixed'?'Equipamentos mistos na jornada; composição não comprovada':'Equipamento não reconhecido; não foi classificado como NB');
 const referenceEnd=reference&&stamp!==null?stamp+reference.maxDutyMinutes*60_000:null;
 const supportedScenario=(!form.composition||form.composition==='simple')&&form.acclimatization==='acclimatized'&&form.timingChange==='flight-delay';
 const post=integer(form.postFlight,360),tasks=integer(form.tasks,1440),delay=integer(form.delay,1440);
 const end=explicitInstant(form.plannedEnd+form.offset);
 const normalEnd=referenceEnd!==null&&supportedScenario?referenceEnd:null;
 const finalOperating=classifications.at(-1)==='OP';
 const minimumPost=form.operation==='domestic'?30:form.operation==='international'?45:null;
 const cut=normalEnd!==null&&finalOperating&&minimumPost!==null&&post!==null&&post>=minimumPost&&tasks!==null&&stamp!==null&&normalEnd-(post+tasks)*60_000>=stamp?normalEnd-(post+tasks)*60_000:null;
 const derivedEnd=context.plannedEndSource==='scheduled_arrival_plus_scenario_postflight'&&form.plannedEnd===context.form.plannedEnd
  ?context.scheduledArrival!==null&&minimumPost!==null&&post!==null&&post>=minimumPost&&tasks!==null?context.scheduledArrival+(post+tasks)*60_000:null:end;
 const validEnd=derivedEnd!==null&&stamp!==null&&derivedEnd>=stamp;
 const projected=validEnd&&delay!==null?derivedEnd!+delay*60_000:null;
 const iso=(value:number|null)=>value===null?null:new Date(value).toISOString();
 const margin=normalEnd!==null&&projected!==null&&tasks!==null?(normalEnd-projected)/60_000:null;
 return {version:REGULATION_AUTOMATIC_REFERENCE_VERSION,reference,referenceDutyEnd:iso(referenceEnd),normalDutyEnd:iso(normalEnd),engineStopLimit:iso(cut),projectedDutyEnd:iso(projected),marginMinutes:margin,missing,conditions,aircraft,
  evidence:{presentation:editedPresentation?'user_scenario':context.publicationReport?'published':'missing',publicationClock:form.offset===context.form.offset?'BRT_convention_not_document_confirmation':'user_scenario',composition:form.composition===context.form.composition&&aircraft.group==='NB'?'NB_scenario_default':form.composition?'user_scenario':'simple_comparison_hypothesis',acclimatization:form.acclimatization===context.form.acclimatization?'scenario_default':'user_scenario',tasks:form.tasks===context.form.tasks?'zero_scenario_default':'user_scenario',postFlight:form.postFlight===context.form.postFlight?'existing_scenario_parameter':'user_scenario'},
  state:normalEnd===null?'unavailable':'conditional',authorization:'not_assessed',operationalCompliance:'not_assessed'};
}
