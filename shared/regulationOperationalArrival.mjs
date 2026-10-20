// Pure, disconnected consumer boundary. No current radar producer implements
// this envelope. Generic RadarSnapshot.arrival is intentionally unsupported.
const MAX_AGE_MS=15*60_000;
const unavailable=reason=>({state:'unavailable',reason,authorization:'not_assessed'});
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0;
const minutes=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
function instant(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/);
 if(!m)return null;
 const suffix=m[6],h=Number(m[2]),min=Number(m[3]),sec=Number(m[4]||0);
 const offset=suffix==='Z'?0:(suffix[0]==='-'?-1:1)*(Number(suffix.slice(1,3))*60+Number(suffix.slice(4)));
 if(h>23||min>59||sec>59||Math.abs(offset)>840||suffix!=='Z'&&Number(suffix.slice(4))>59)return null;
 const stamp=Date.parse(value);
 return Number.isFinite(stamp)&&new Date(stamp+offset*60_000).toISOString().slice(0,10)===m[1]?stamp:null;
}
function sameOccurrence(left,right){
 return left&&right&&['flight','departureDate','origin','destination'].every(key=>text(left[key])&&left[key]===right[key])
  &&/^\d{4}-\d{2}-\d{2}$/.test(left.departureDate)&&instant(left.departureDate+'T00:00Z')!==null&&/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(left.flight)
  &&/^[A-Z]{3}$/.test(left.origin)&&/^[A-Z]{3}$/.test(left.destination)&&left.origin!==left.destination
  &&instant(left.scheduledDepartureUtc)!==null&&instant(left.scheduledDepartureUtc)===instant(right.scheduledDepartureUtc);
}

/** Proposed host-admitted, field-specific envelope. Admission/owner/revision are
 * supplied by the future authenticated host, never inferred from browser cache.
 * expected.occurrence MUST identify the journey's final operated activity.
 * Gate-in is deliberately not treated as engine stop or landing. */
export function readRegulationOperationalArrival({evidence,expected,admitted=false,now,operation,postFlightMinutes,additionalTasksMinutes,taxiInMinutes}={}){
 if(admitted!==true)return unavailable('host_not_admitted');
 if(evidence?.schema!=='regulation-operational-arrival-v1')return unavailable('producer_contract_unavailable');
 if(!Number.isSafeInteger(now)||!text(expected?.ownerScope)||!text(expected?.revision)
   ||evidence.ownerScope!==expected.ownerScope||evidence.revision!==expected.revision)return unavailable('scope_mismatch');
 if(expected.lastActivity!=='operating'||!sameOccurrence(evidence.occurrence,expected.occurrence))return unavailable('final_occurrence_unproved');
 const field=evidence.field,source=field?.source;
 if(!text(source?.provider)||!text(source?.field))return unavailable('field_source_missing');
 const observed=instant(source.observedAt),received=instant(source.receivedAt),expires=instant(source.expiresAt);
 if(observed===null||received===null||expires===null||observed>received||received>now||observed>now
   ||expires<=now||expires<=observed||expires-observed>MAX_AGE_MS||now-observed>MAX_AGE_MS)return unavailable('field_expired_or_unproved');
 if(!['estimated','actual'].includes(field.kind)||!['engine_stop','landing'].includes(field.milestone))return unavailable('arrival_semantics_unproved');
 const arrival=instant(field.at),departure=instant(expected.occurrence.scheduledDepartureUtc);
 if(arrival===null||arrival<departure||field.kind==='actual'&&arrival>observed)return unavailable('arrival_instant_invalid');
 const minimum=operation==='domestic'?30:operation==='international'?45:null;
 if(minimum===null||!minutes(postFlightMinutes,360)||postFlightMinutes<minimum||!minutes(additionalTasksMinutes,1440))return unavailable('postflight_or_tasks_unproved');
 if(field.milestone==='landing'&&!minutes(taxiInMinutes,240))return unavailable('taxi_unproved');
 const engineStop=arrival+(field.milestone==='landing'?taxiInMinutes:0)*60_000;
 const end=engineStop+(postFlightMinutes+additionalTasksMinutes)*60_000;
 return {state:'available',kind:field.kind,milestone:field.milestone,provider:source.provider,sourceField:source.field,
  observedAt:new Date(observed).toISOString(),expiresAt:new Date(expires).toISOString(),
  engineStopAt:new Date(engineStop).toISOString(),engineStopKind:field.milestone==='engine_stop'?field.kind:'estimated',dutyEndAt:new Date(end).toISOString(),dutyEndKind:'projected',
  postFlightMinutes,additionalTasksMinutes,authorization:'not_assessed'};
}

/** Explicit alternative to manual projection, never an additive delay. This
 * does not change a limit or assess legality. UI wiring awaits a real producer. */
export function regulationOperationalProjection(read){
 if(read?.state!=='available')return null;
 return {state:'operational_projection',missing:[],base:{dutyEnd:read.dutyEndAt},scenario:{dutyEnd:read.dutyEndAt,engineStop:read.engineStopAt},
  source:'operational_arrival',kind:read.kind,authorization:'not_assessed'};
}
