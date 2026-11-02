import { requireExistingIdentity, requestToken } from '../v139/common.mjs';
import { customGateSourceUpdate } from '../gate-source-update.mjs';
import { radarResultDecision, radarFlightId } from '../../shared/gate-query-day.mjs';
import { verifiedRadarFields,normalizeRadarGate } from '../../shared/radar-field-evidence.mjs';

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
    let archiveMode=typeof history.readRadarGateArchiveScope==='function',ticket;
    try {
      ticket=await authority.transaction(identity.db,c=>(archiveMode?history.readRadarGateArchiveScope:history.readOperationalHistoryScope)(c,who,{enabled:true,now:clock(),lockSource:true,identity:occurrence}));
    } catch(error) {
      if(!archiveMode||error.code!=='BRIEFING_CONTEXT_UNAVAILABLE')throw error;
      // Preserve the existing custom/first-duty path for legacy rosters lacking
      // the stronger all-publication crew binding. Never admit reported gates here.
      archiveMode=false;
      ticket=await authority.transaction(identity.db,c=>history.readOperationalHistoryScope(c,who,{enabled:true,now:clock(),lockSource:true}));
    }
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
          if(result?.ok!==true || result.querySuppressed || result.operationalConflicts?.includes('gate'))return {status:'unconfirmed',stored:false};
          const reported=archiveMode && ['cirium-flex','flightaware'].includes(result.provider);
          if(!reported && (!observation ||
            verifiedRadarFields(result,ticket.identity,now).gate!==normalizeRadarGate(observation.gate) || proof?.provider!=='custom' ||
            Date.parse(proof.sourceUpdatedAt)!==Date.parse(observation.departureGateUpdate.updatedAt) ||
            (result.gateEvidenceReceivedAt ?? result.sourceReceivedAt)!==observation.sourceReceivedAt))return {status:'unconfirmed',stored:false};
          // Revalidate the existing request identity as well as locked canonical
          // source. A delayed response for a replaced session cannot write.
          const fresh=await identify(req,sink()),current=authority.principal(fresh,now);
          if(!current || current.email!==who.email || current.owner!==who.owner)return {status:'context_changed',stored:false};
          const credential=archiveMode?requestToken(req):'';
          return await (archiveMode?history.recordRadarGateArchive:history.recordOperationalGateObservation)(identity.db,who,{expectedScope:ticket,field:'gate',observation:reported?result:observation},
            {enabled:true,clock,revalidate:async()=>{
              // Reuse the already authenticated canonical identity and its exact
              // credential. Profile incarnation is locked by the writer. Do not
              // acquire a second pooled DB connection while holding those locks.
              const current=authority.principal(fresh,clock());
              return Boolean(credential&&requestToken(req)===credential&&current&&current.email===who.email&&current.owner===who.owner);
            }});
        }catch{return {status:'unavailable',stored:false};}
      },
    };
  }catch{return null;}
}

// Explicit user-initiated historical read. No provider, planner or source reader.
export async function handleRadarGateHistory(req,res,url,{enabled=RADAR_OPERATIONAL_HISTORY_ENABLED,identify=requireExistingIdentity,loadRuntime=load,clock=Date.now}={}) {
  const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
  if(enabled!==true)return reply(503,{ok:false,code:'GATE_HISTORY_DISABLED'});
  if(req.method!=='GET')return reply(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  try {
    const {history,authority}=await loadRuntime();
    if(history.OPERATIONAL_HISTORY_ENABLED!==true)return reply(503,{ok:false,code:'GATE_HISTORY_DISABLED'});
    const identity=await identify(req,res),who=authority.principal(identity,clock());
    if(!who)return res.writableEnded?undefined:reply(401,{ok:false,code:'AUTH_REQUIRED'});
    const occurrence=Object.fromEntries(['flight','origin','destination','departureDate','scheduledDepartureUtc'].map(k=>[k,url.searchParams.get(k)||'']));
    const rawCursor=url.searchParams.get('cursor')||'0';
    if(!/^\d{1,16}$/.test(rawCursor)||!Number.isSafeInteger(Number(rawCursor)))return reply(400,{ok:false,code:'INVALID_HISTORY_CURSOR'});
    const legacy=url.searchParams.get('legacy');
    if(legacy && legacy!=='1')return reply(400,{ok:false,code:'INVALID_HISTORY_CURSOR'});
    const page=await authority.transaction(identity.db,c=>history.readArchivedOperationalGateHistory(c,who,occurrence,{enabled:true,lockSource:true,cursor:Number(rawCursor),legacy:legacy==='1'}));
    const fresh=await identify(req,sink()),current=authority.principal(fresh,clock());
    if(!current||current.email!==who.email||current.owner!==who.owner)return reply(401,{ok:false,code:'AUTH_REQUIRED'});
    return reply(200,{ok:true,history:page});
  } catch {if(!res.writableEnded)return reply(503,{ok:false,code:'GATE_HISTORY_UNAVAILABLE'});}
}
