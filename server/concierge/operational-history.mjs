import { telegramOperationalAuthority as authority } from './telegram-briefing.mjs';
import { readOperationalBriefingPreview } from './operational-briefing-source.mjs';
import { inspectOperationalChange } from './operational-change-source.mjs';
import { originFlightDate } from '../../shared/gate-query-day.mjs';

// Server-only persistence, no route, timer, network, migration or shipping caller.
// Gate and trigger remain OFF. Status has no real temporal source contract yet.
export const OPERATIONAL_HISTORY_ENABLED = false;
const { hash, readState, writeState, transaction, deny } = authority;
const key = owner => 'operational-source-history:' + hash(owner);
const copy = value => structuredClone(value);
const archiveIdentity = identity => identity && Object.fromEntries(['flight','origin','destination','departureDate','scheduledDepartureUtc'].map(k=>[k,identity[k]]));
function archiveKey(identity) {
  const value=archiveIdentity(identity);
  if(!value || !/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(value.flight||'') ||
    !/^[A-Z]{3}$/.test(value.origin||'') || !/^[A-Z]{3}$/.test(value.destination||'') ||
    value.origin===value.destination || !/^\d{4}-\d{2}-\d{2}$/.test(value.departureDate||'') ||
    !Number.isFinite(Date.parse(value.scheduledDepartureUtc)) || originFlightDate(value.scheduledDepartureUtc,value.origin)!==value.departureDate) throw deny();
  value.scheduledDepartureUtc=new Date(value.scheduledDepartureUtc).toISOString();
  return {identity:value,key:hash(value)};
}
function archived(prior,current,next) {
  const archive=copy(prior?.archive || {}),{key,identity}=archiveKey(current.identity);
  const previous=archive[key];
  if(previous && (archiveKey(previous.identity).key!==key || !Array.isArray(previous.observations)))throw deny();
  const observations=previous?.observations || [];
  const observation={gate:next.observation.gate,provider:next.observation.provider,
    observedAt:new Date(next.at).toISOString(),receivedAt:new Date(next.receipt).toISOString(),rosterRevision:current.rosterRevision};
  // Deduplication is evidence-based; saving never renews a receipt or observation.
  if(!observations.some(item=>item.gate===observation.gate && item.provider===observation.provider && item.observedAt===observation.observedAt))observations.push(observation);
  archive[key]={identity,observations};
  return archive;
}
function validContext(context) {
  return typeof context?.email === 'string' && context.email &&
    typeof context.owner === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(context.owner);
}
async function scope(c, context, now) {
  if (!validContext(context) || !Number.isSafeInteger(now)) throw deny();
  const [owners] = await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE', [context.email]);
  if (owners.length !== 1 || owners[0].public_id !== context.owner || ![false,0,'0'].includes(owners[0].must_change_password)) throw deny();
  await c.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=? AND active=TRUE FOR UPDATE', [context.email]);
  const result = await readOperationalBriefingPreview({ ok:true, db:c, email:context.email, publicId:context.owner }, { now:()=>now, includeInternal:true, lockSource:true });
  const legs = result.internal?.preview?.duty?.legs;
  // Deliberately one occurrence: first leg of the canonical next duty. No URL,
  // lastRadar cache or client event can select a different monthly occurrence.
  if (result.status !== 200 || !Array.isArray(legs) || !legs.length) throw deny();
  const leg = legs[0];
  const identity = { flight:leg.flight, origin:leg.origin, destination:leg.destination,
    scheduledDepartureUtc:leg.departureAt, departureDate:originFlightDate(leg.departureAt,leg.origin), eventId:leg.eventId };
  const source = result.body.source;
  return { ownerId:context.owner, rosterRevision:hash([source.rosterId,source.rosterKey,source.revisionAt,source.contentDigest]), identity };
}
// MySQL JSON normalizes object-key order. Compare scope fields, never insertion order.
function same(left,right) {
  return Boolean(left && right && left.ownerId===right.ownerId && left.rosterRevision===right.rosterRevision &&
    ['flight','origin','destination','scheduledDepartureUtc','departureDate','eventId'].every(k=>left.identity?.[k]===right.identity?.[k]));
}
function bound(record, context, current) {
  return record?.version===1 && record.email===context.email && record.owner===context.owner &&
    record.field==='gate' && same(record.scope,current) && record.source?.ownerId===current.ownerId && record.source.rosterRevision===current.rosterRevision;
}
function checked(observation,current,now) {
  // Admission is the existing custom source contract, not a relabelled public
  // gateUpdate or generic provider timestamp. Never synthesize a source proof.
  const source={ownerId:current.ownerId,rosterRevision:current.rosterRevision,observation};
  const result=inspectOperationalChange(source,current,'gate',now);
  if(result.status!=='baseline')throw deny();
  const proof=observation.departureGateUpdate;
  const kept={ok:true,provider:observation.provider,flight:result.current.flight,origin:result.current.origin,destination:result.current.destination,
    scheduledDepartureUtc:result.current.scheduledDepartureUtc,gate:result.current.gate,sourceReceivedAt:result.current.sourceReceivedAt,
    departureGateUpdate:Object.fromEntries(['schema','flight','origin','destination','scheduledDepartureUtc','gate','updatedAt'].map(k=>[k,proof[k]]))};
  return {observation:kept,at:Date.parse(result.current.sourceUpdatedAt),receipt:result.current.sourceReceivedAt};
}
export async function readOperationalHistoryScope(c,context,{enabled=OPERATIONAL_HISTORY_ENABLED,now=Date.now(),lockSource=false}={}) {
  if(enabled!==true)return null;
  if(lockSource!==true)throw deny();
  return scope(c,context,now); // caller owns the transaction/locks
}
export async function recordOperationalGateObservation(db,context,input,{enabled=OPERATIONAL_HISTORY_ENABLED,clock=Date.now}={}) {
  if(enabled!==true)return {status:'disabled',stored:false};
  // expectedScope is a trusted server ticket read BEFORE a provider request;
  // current scope is re-read on receipt. No HTTP endpoint accepts this object.
  if(!input?.expectedScope || input.field!=='gate')throw deny();
  return transaction(db,async c=>{
    const now=clock(),current=await scope(c,context,now);
    if(!same(current,input.expectedScope))throw deny();
    const next=checked(input.observation,current,now);
    const prior=await readState(c,key(context.owner));
    if(prior && (prior.email!==context.email || prior.owner!==context.owner || prior.version!==1 || prior.field!=='gate'))throw deny();
    let previousObservation=null;
    if(prior && bound(prior,context,current)) {
      const old=prior.source?.observation;
      if(!old)throw deny();
      // Validate the persisted observation at its original receipt instant.
      // It may now be stale, but cannot silently become a new baseline.
      const oldProof=checked(old,current,old.sourceReceivedAt);
      if(next.at<oldProof.at || next.receipt<oldProof.receipt)return {status:'older',stored:false};
      if(next.at===oldProof.at) {
        if(next.observation.gate!==old.gate) {
          // Persist ambiguity, rather than retain a sendable prior observation.
          await writeState(c,key(context.owner),{...prior,conflict:true,archive:archived(prior,current,next)});
          return {status:'conflict',stored:true};
        }
        return {status:prior.conflict?'conflict':'duplicate',stored:false}; // no freshness renewal
      }
      // A conflict invalidates both sides. The next later proof starts baseline.
      if(!prior.conflict)previousObservation=old;
    }
    const source={ownerId:current.ownerId,rosterRevision:current.rosterRevision,observation:next.observation,previousObservation};
    await writeState(c,key(context.owner),{version:1,email:context.email,owner:context.owner,field:'gate',scope:current,source,conflict:false,archive:archived(prior,current,next)});
    return {status:previousObservation?'advanced':'baseline',stored:true};
  });
}

/** Historical evidence only: does not plan, confirm a current gate or call a source.
 * Authentication/transaction belong to the existing server caller; require current
 * profile incarnation again, without requiring an active/upcoming publication.
 */
export async function readArchivedOperationalGateHistory(c,context,identity,{enabled=OPERATIONAL_HISTORY_ENABLED,lockSource=false}={}) {
  if(enabled!==true)return null;
  if(lockSource!==true || !validContext(context))throw deny();
  const occurrence=archiveKey(identity);
  const [owners]=await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE',[context.email]);
  if(owners.length!==1 || owners[0].public_id!==context.owner || ![false,0,'0'].includes(owners[0].must_change_password))throw deny();
  const record=await readState(c,key(context.owner));
  if(!record)return null;
  if(record.email!==context.email || record.owner!==context.owner || record.version!==1 || record.field!=='gate')throw deny();
  const entry=record.archive?.[occurrence.key];
  if(!entry)return null;
  if(archiveKey(entry.identity).key!==occurrence.key || !Array.isArray(entry.observations))throw deny();
  if(entry.observations.some(item=>!item || !/^[A-Z]?\d{1,3}[A-Z]?$/.test(item.gate||'') || item.provider!=='custom' ||
    !Number.isFinite(Date.parse(item.observedAt)) || !Number.isFinite(Date.parse(item.receivedAt)) ||
    Date.parse(item.observedAt)>Date.parse(item.receivedAt) || !/^[a-f0-9]{64}$/.test(item.rosterRevision||'')))throw deny();
  const observations=entry.observations.map(item=>({...item,conflicted:entry.observations.some(other=>
    other.provider===item.provider && other.observedAt===item.observedAt && other.gate!==item.gate)}));
  return copy({kind:'historical-gate-records',currentConfirmation:false,identity:entry.identity,observations});
}
export async function readOperationalGateHistory(c,context,{enabled=OPERATIONAL_HISTORY_ENABLED,now=Date.now(),lockSource=false}={}) {
  if(enabled!==true)return null;
  if(lockSource!==true)throw deny();
  const current=await scope(c,context,now),record=await readState(c,key(context.owner));
  if(!bound(record,context,current) || record.conflict)return null;
  const inspected=inspectOperationalChange(record.source,current,'gate',now);
  if(!['baseline','unchanged','change'].includes(inspected.status))return null;
  return copy({scope:current,source:record.source});
}
