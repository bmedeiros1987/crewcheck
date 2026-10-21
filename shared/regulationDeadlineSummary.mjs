import {explicitInstant} from './regulationTemporalScenario.mjs';
import {regulationOperationalInstant} from './regulationOperationalArrival.mjs';
const integer=(value,max)=>typeof value==='string'&&/^\d+$/.test(value)&&Number(value)<=max?Number(value):null;
// Presentation-only projection of a reviewed reference, never a new legal engine.
// Cut deadline derives from DUTY END, never from a scheduled arrival or flight cap.
export function regulationDeadlineSummary(form,result,{lastActivity='unknown',hasPositioning=false}={}) {
 const missing=[],limit=explicitInstant(form.normalEnd+form.offset),engine=form.limitSource?.startsWith('Motor existente');
 const presentation=explicitInstant(form.presentation+form.offset);
 if(limit===null)missing.push('Limite da jornada');
 if(presentation===null||form.presentationReviewed!==true)missing.push('Apresentação e etapas confirmadas');
 if(limit!==null&&presentation!==null&&limit<=presentation)missing.push('Limite posterior à apresentação');
 if(form.reviewed!==true)missing.push('Revisão do limite aplicável');
 if(form.publicationOffsetReviewed!==true)missing.push('Fuso dos horários');
 if(!['rbac117-b1','operator-reviewed'].includes(form.regime))missing.push('Regime aplicável');
 if(!['simple','augmented','relief'].includes(form.composition))missing.push('Composição da tripulação');
 if(!['acclimatized','not_acclimatized'].includes(form.acclimatization))missing.push('Aclimatação');
 if(engine&&form.limitBasis!==JSON.stringify([form.presentation,form.offset]))missing.push('Referência automática atualizada para apresentação e fuso');
 if(engine&&form.acclimatizedClockReviewed!==true)missing.push('Hora de referência aclimatada');
 if(engine&&hasPositioning)missing.push('Regra para deslocamento PS / etapas');
 if(engine&&form.timingChange!=='flight-delay')missing.push('Regra específica de apresentação / reprogramação');
 if(engine&&(form.regime!=='rbac117-b1'||form.composition!=='simple'||form.acclimatization!=='acclimatized'))missing.push('Referência compatível com composição e aclimatação');
 if(form.timingChange!=='flight-delay'&&form.changeReviewed!==true)missing.push('Revisão de apresentação / reprogramação');
 const normalDutyEnd=missing.length?null:new Date(limit).toISOString();
 const post=integer(form.postFlight,360),tasks=integer(form.tasks,1440),minimum=form.operation==='domestic'?30:form.operation==='international'?45:null;
 const cutMissing=[];
 if(minimum===null)cutMissing.push('Tipo de voo');
 if(post===null||minimum!==null&&post<minimum)cutMissing.push('Pós-voo aplicável');
 if(tasks===null)cutMissing.push('Tarefas após o voo (inclusive zero)');
 if(lastActivity!=='operating')cutMissing.push('Última etapa operada e deslocamentos posteriores');
 if(limit!==null&&presentation!==null&&post!==null&&tasks!==null&&limit-(post+tasks)*60000<presentation)cutMissing.push('Pós-voo e tarefas incompatíveis com a janela');
 const engineStopLimit=normalDutyEnd&&!cutMissing.length?new Date(limit-(post+tasks)*60000).toISOString():null;
 const projected=regulationOperationalInstant(result?.scenario?.dutyEnd);
 const projectionValid=projected!==null&&presentation!==null&&projected>=presentation&&tasks!==null;
 const marginMinutes=normalDutyEnd&&projectionValid?(limit-projected)/60000:null;
 return {normalDutyEnd,engineStopLimit,marginMinutes,marginMissing:!projectionValid?[...new Set([...(result?.missing||[]),...(projected===null?['Encerramento previsto']:[]),...(tasks===null?['Tarefas posteriores, inclusive zero']:[]),...(projected!==null&&presentation!==null&&projected<presentation?['Encerramento posterior à apresentação']:[])])]:[],projectedDutyEnd:projected===null?null:new Date(projected).toISOString(),missing:[...new Set(missing)],cutMissing,authorization:'not_assessed'};
}

// A manual declaration is usable only without an imported schedule. Never replace
// an imported OP/PS/unknown classification with a simulation override.
export function regulationLastActivity(scheduleDay,manual='unknown') {
 if(scheduleDay) {
  const leg=scheduleDay.regulationJourney?.at(-1)?.leg||scheduleDay.legs?.at(-1);
  return leg?.workType==='OP'?'operating':leg?.workType==='PS'?'positioning':'unknown';
 }
 return ['operating','positioning'].includes(manual)?manual:'unknown';
}
export function regulationExtensionMargin(summary,extension) {
 return extension===true&&typeof summary?.marginMinutes==='number'&&Number.isFinite(summary.marginMinutes)
  &&!!summary.normalDutyEnd&&summary.missing?.length===0 ? summary.marginMinutes+60 : null;
}
