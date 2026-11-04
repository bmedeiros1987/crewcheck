import { normalizeRadarGate } from '../shared/radar-field-evidence.mjs';
import { radarSourceEpoch } from '../shared/gate-query-day.mjs';

const PROVIDERS = Object.freeze(['flightaware','custom','aviationstack','airlabs','aerodatabox','cirium-sky','cirium-flex','oag']);
const INSTRUMENTED = Object.freeze(['flightaware','custom','aviationstack','airlabs','aerodatabox']);
const COUNTERS = Object.freeze(['networkAttempts','httpResponses','httpErrorResponses','transportFailures','timeouts','invalidJsonResponses','normalizedResults','matchedWithGateResults','matchedWithoutGateResults','rejectedOccurrenceResults','unavailableResults']);
const REASONS = new Set(['source-unverified','source-origin-date-unverified','source-other-flight-or-route','source-instant-unverified','source-other-day','source-other-occurrence','source-stale','source-occurrence-confirmed']);
const format = value => value == null ? 'missing' : typeof value !== 'string' ? 'non-string' : !value.trim() ? 'empty'
  : Number.isFinite(radarSourceEpoch(value)) ? 'absolute-valid'
  : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value.trim()) ? 'zone-less' : 'invalid';

// Process-local observations only. Fixed provider/counter sets; never URLs, identities,
// headers, payloads or billing claims. Cached/coalesced result reads are not new requests.
export function createRadarAttemptDiagnostics({now=Date.now}={}) {
  const since=now(), states=new Map(INSTRUMENTED.map(provider=>[provider,{counts:Object.fromEntries(COUNTERS.map(key=>[key,0])),saturated:false,lastHttpStatus:null,lastReason:null,lastScheduleFormat:null}]));
  const increment=(state,key)=>{if(state.counts[key]===Number.MAX_SAFE_INTEGER)state.saturated=true;else state.counts[key]++;};
  return Object.freeze({
    transport(provider,event,status) {
      const state=states.get(provider);if(!state)return;
      if(event==='attempt')increment(state,'networkAttempts');
      else if(event==='http'&&Number.isInteger(status)&&status>=100&&status<=599){increment(state,'httpResponses');state.lastHttpStatus=status;if(status<200||status>=300)increment(state,'httpErrorResponses');}
      else if(event==='transport'||event==='timeout'){increment(state,'transportFailures');if(event==='timeout')increment(state,'timeouts');}
      else if(event==='invalid-json')increment(state,'invalidJsonResponses');
    },
    result(provider,value,decision) {
      const state=states.get(provider);if(!state||!value||typeof value!=='object')return;
      increment(state,'normalizedResults');
      state.lastReason=REASONS.has(decision?.reason)?decision.reason:'unclassified';
      state.lastScheduleFormat=format(value.scheduledDepartureUtc);
      if(value.ok!==true)increment(state,'unavailableResults');
      else if(decision?.allowed!==true)increment(state,'rejectedOccurrenceResults');
      else increment(state,typeof value.gate==='string'&&normalizeRadarGate(value.gate)?'matchedWithGateResults':'matchedWithoutGateResults');
    },
    snapshot() {
      return {scope:'process-local',sinceEpochMs:Number.isFinite(since)?since:null,
        resultReadSemantics:'Normalized results exclude cache/coalesced replay. These local counters are not quota usage or an invoice. A matching gate is not operational proof.',
        providers:PROVIDERS.map(provider=>{const state=states.get(provider);return {provider,instrumented:Boolean(state),counts:state?{...state.counts}:null,confirmedBilledUsage:{state:'unknown',units:null},
          saturated:state?state.saturated:null,lastHttpStatus:state?.lastHttpStatus??null,lastReason:state?.lastReason??null,lastScheduleFormat:state?.lastScheduleFormat??null};})};
    }
  });
}

export const radarAttemptDiagnostics=createRadarAttemptDiagnostics();
