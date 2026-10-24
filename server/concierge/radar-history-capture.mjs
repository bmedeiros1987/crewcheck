import { requireExistingIdentity } from '../v139/common.mjs';
import { customGateSourceUpdate } from '../gate-source-update.mjs';
import { radarResultDecision, radarFlightId } from '../../shared/gate-query-day.mjs';
import { verifiedRadarFields } from '../../shared/radar-field-evidence.mjs';

export const RADAR_OPERATIONAL_HISTORY_ENABLED = false;
const load = async () => ({ history:await import('./operational-history.mjs'),
  authority:(await import('./telegram-briefing.mjs')).telegramOperationalAuthority });
const sink = () => ({headersSent:false,writableEnded:false,writeHead(){},end(){}});
const sameOccurrence = (a,b) => a && b && radarFlightId(a.flight)===radarFlightId(b.flight) &&
  a.origin===b.origin && a.destination===b.destination && Date.parse(a.scheduledDepartureUtc)===Date.parse(b.scheduledDepartureUtc) &&
  a.departureDate===b.departureDate && (!a.eventId || a.eventId===b.eventId);
// Internal app-request hook only. OFF returns before auth, DB and lazy imports.
// No request body, cache, public gateUpdate or legacy Concierge key is authority.
export async function beginRadarOperationalHistory(req,occurrence,{enabled=RADAR_OPERATIONAL_HISTORY_ENABLED,
  identify=requireExistingIdentity,loadRuntime=load,clock=Date.now}={}) {
  if(enabled!==true)return null;
  try {
    const {history,authority}=await loadRuntime();
    if(history.OPERATIONAL_HISTORY_ENABLED!==true)return null;
    const identity=await identify(req,sink()),who=authority.principal(identity,clock());
    if(!who)return null;
    const ticket=await authority.transaction(identity.db,c=>history.readOperationalHistoryScope(c,who,{enabled:true,now:clock(),lockSource:true}));
    if(!sameOccurrence(occurrence,ticket?.identity))return null;
    let observation=null,finished=false;
    return {
      captureCustom(raw,receipt) {
        if(finished || observation || !Number.isSafeInteger(receipt))return undefined;
        const proof=customGateSourceUpdate(raw,receipt);
        if(!proof)return undefined;
        const value={ok:true,provider:'custom',flight:proof.flight,origin:proof.origin,destination:proof.destination,
          scheduledDepartureUtc:proof.scheduledDepartureUtc,gate:proof.gate,sourceReceivedAt:receipt,
          departureGateUpdate:Object.fromEntries(['schema','flight','origin','destination','scheduledDepartureUtc','gate','updatedAt'].map(k=>[k,raw.departureGateUpdate[k]]))};
        if(!radarResultDecision(value,ticket.identity,receipt).allowed)return undefined;
        observation=value;return receipt;
      },
      async commit(result) {
        if(finished)return {status:'skipped',stored:false};
        finished=true;
        try {
          const now=clock(),proof=result?.gateUpdate;
          if(!observation || result?.ok!==true || result.querySuppressed || result.operationalConflicts?.includes('gate') ||
            verifiedRadarFields(result,ticket.identity,now).gate!==observation.gate || proof?.provider!=='custom' ||
            Date.parse(proof.sourceUpdatedAt)!==Date.parse(observation.departureGateUpdate.updatedAt) ||
            (result.gateEvidenceReceivedAt ?? result.sourceReceivedAt)!==observation.sourceReceivedAt)return {status:'unconfirmed',stored:false};
          // Revalidate the existing request identity as well as locked canonical
          // source. A delayed response for a replaced session cannot write.
          const fresh=await identify(req,sink()),current=authority.principal(fresh,now);
          if(!current || current.email!==who.email || current.owner!==who.owner)return {status:'context_changed',stored:false};
          return await history.recordOperationalGateObservation(identity.db,who,{expectedScope:ticket,field:'gate',observation},
            {enabled:true,clock});
        }catch{return {status:'unavailable',stored:false};}
      },
    };
  }catch{return null;}
}
