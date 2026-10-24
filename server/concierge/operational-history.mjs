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
function same(left,right) { return hash(left) === hash(right); }
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
  const kept={ok:true,provider:observation.provider,flight:observation.flight,origin:observation.origin,destination:observation.destination,
    scheduledDepartureUtc:observation.scheduledDepartureUtc,gate:observation.gate,sourceReceivedAt:observation.sourceReceivedAt,
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
          await writeState(c,key(context.owner),{...prior,conflict:true});
          return {status:'conflict',stored:true};
        }
        return {status:prior.conflict?'conflict':'duplicate',stored:false}; // no freshness renewal
      }
      // A conflict invalidates both sides. The next later proof starts baseline.
      if(!prior.conflict)previousObservation=old;
    }
    const source={ownerId:current.ownerId,rosterRevision:current.rosterRevision,observation:next.observation,previousObservation};
    await writeState(c,key(context.owner),{version:1,email:context.email,owner:context.owner,field:'gate',scope:current,source,conflict:false});
    return {status:previousObservation?'advanced':'baseline',stored:true};
  });
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
