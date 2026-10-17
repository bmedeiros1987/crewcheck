// Temporal projection only. It neither chooses a legal limit nor authorizes an
// extension. Normal duty end is an explicitly reviewed input from the existing
// engine/operator reference. Absolute instants prevent device-timezone inference.
export function explicitInstant(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::00)?(Z|[+-]\d{2}:\d{2})$/);if(!m)return null;
 const [h,min]=m[2].split(':').map(Number),offset=m[3]==='Z'?0:(m[3][0]==='-'?-1:1)*(Number(m[3].slice(1,3))*60+Number(m[3].slice(4)));
 if(h>23||min>59||Math.abs(offset)>840||m[3]!=='Z'&&Number(m[3].slice(4))>59)return null;
 const stamp=Date.parse(m[1]+'T'+m[2]+':00'+m[3]);
 if(!Number.isFinite(stamp)||new Date(stamp+offset*60000).toISOString().slice(0,16)!==m[1]+'T'+m[2])return null;
 return stamp;
}
const minutes=(value,max,positive=false)=>Number.isSafeInteger(value)&&value>=(positive?1:0)&&value<=max;
export function projectRegulationScenario(input={}){
 const missing=[],takeoff=explicitInstant(input.takeoffAt),normalLimit=explicitInstant(input.normalDutyEndAt);
 if(takeoff===null)missing.push('Decolagem com data e fuso');
 if(normalLimit===null||input.limitReviewed!==true)missing.push('Limite normal revisado');
 if(!minutes(input.flightMinutes,1440,true)||!['published_airborne','user_estimate'].includes(input.flightDurationSource))missing.push('Duração em voo confirmada para a simulação');
 if(!minutes(input.delayMinutes,1440))missing.push('Atraso previsto');
 if(!minutes(input.taxiInMinutes,240))missing.push('Táxi até a parada final dos motores');
 const minimum=input.operation==='domestic'?30:input.operation==='international'?45:null;
 if(minimum===null)missing.push('Tipo de voo');
 if(!minutes(input.postFlightMinutes,360)||minimum!==null&&input.postFlightMinutes<minimum)missing.push('Pós-voo aplicável');
 if(!minutes(input.additionalTasksMinutes,1440))missing.push('Tarefas após o pós-voo');
 if(![0,60].includes(input.extensionMinutes))missing.push('Cenário de extensão (0 ou 60 minutos)');
 if(missing.length)return {state:'indeterminate',missing,authorization:'not_assessed',rest:'indeterminate',accumulatedLimits:'indeterminate',base:null,scenario:null};
 const make=delay=>{const landing=takeoff+(delay+input.flightMinutes)*60000,engineStop=landing+input.taxiInMinutes*60000,dutyEnd=engineStop+(input.postFlightMinutes+input.additionalTasksMinutes)*60000;return {takeoff:new Date(takeoff+delay*60000).toISOString(),landing:new Date(landing).toISOString(),engineStop:new Date(engineStop).toISOString(),dutyEnd:new Date(dutyEnd).toISOString()};};
 const base=make(0),scenario=make(input.delayMinutes),extendedLimit=normalLimit+input.extensionMinutes*60000,marginMinutes=(extendedLimit-Date.parse(scenario.dutyEnd))/60000;
 // Date and night boundaries are flagged for the existing regulatory/historical
 // evaluation; this small comparator does not silently recompute those limits.
 const crossesUtcDate=base.dutyEnd.slice(0,10)!==scenario.dutyEnd.slice(0,10);
 const suffix=input.takeoffAt.endsWith('Z')?'Z':input.takeoffAt.slice(-6),offset=suffix==='Z'?0:(suffix[0]==='-'?-1:1)*(Number(suffix.slice(1,3))*60+Number(suffix.slice(4))),localDate=value=>new Date(Date.parse(value)+offset*60000).toISOString().slice(0,10),crossesReferenceDate=localDate(base.dutyEnd)!==localDate(scenario.dutyEnd);
 return {state:marginMinutes>=0?'within_temporal_reference':'exceeds_temporal_reference',missing:[],base,scenario,normalDutyEnd:new Date(normalLimit).toISOString(),scenarioDutyEndLimit:new Date(extendedLimit).toISOString(),marginMinutes,baseMarginMinutes:(normalLimit-Date.parse(base.dutyEnd))/60000,flightMinutes:input.flightMinutes,postFlightMinimum:minimum,crossesUtcDate,crossesReferenceDate,authorization:'not_assessed',rest:'indeterminate',accumulatedLimits:'indeterminate',assumptions:['delay_applies_to_takeoff_only','taxi_explicit','postflight_explicit','limit_reviewed_by_user']};
}
