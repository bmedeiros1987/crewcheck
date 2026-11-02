import { telegramOperationalAuthority as authority } from './telegram-briefing.mjs';
import { readOperationalBriefingPreview } from './operational-briefing-source.mjs';
import { inspectOperationalChange } from './operational-change-source.mjs';
import { originFlightDate, gateQueryDay, radarResultDecision } from '../../shared/gate-query-day.mjs';
import { resolveOwnedGatePublication } from '../radar-publication-authority.mjs';
import { operationalRosterContentDigest } from './operational-briefing-source.mjs';
import {appendGateArchivePage,readGateArchivePage,gateArchiveIdentity,GATE_ARCHIVE_PAGE_SIZE,validArchiveGate} from './operational-history-pages.mjs';
import { normalizeRadarGate,verifiedRadarFields } from '../../shared/radar-field-evidence.mjs';
import {customGateSourceUpdate} from '../gate-source-update.mjs';

// Server-only persistence, no route, timer, network, migration or shipping caller.
// Gate and trigger remain OFF. Status has no real temporal source contract yet.
export const OPERATIONAL_HISTORY_ENABLED = false;
const { hash, readState, writeState, transaction, deny } = authority;
const legacyKey=owner=>'operational-source-history:'+hash(owner);
const key = owner => 'operational-source-history:live:' + hash(owner);
const copy = value => structuredClone(value);
const archiveKey=identity=>({identity:gateArchiveIdentity(identity),key:hash(gateArchiveIdentity(identity))});
const archiveEntry=next=>({gate:next.observation.gate,provider:next.observation.provider,observedAt:null,sourceUpdatedAt:next.at===null?null:new Date(next.at).toISOString(),receivedAt:new Date(next.receipt).toISOString()});
async function readSnapshotState(c,owner){
 const current=await readState(c,key(owner));if(current)return current;
 // Fixed projection from the immutable legacy JSON row; never load its archive.
 const fields=['version','email','owner','field','scope','source','conflict'];
 const projection=fields.map(field=>`'${field}',JSON_EXTRACT(payload,'$.${field}')`).join(',');
 const [rows]=await c.query(`SELECT JSON_OBJECT(${projection}) AS payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE`,[legacyKey(owner)]);
 if(!Array.isArray(rows)||rows.length>1)throw deny();return authority.parse(rows[0]);
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
  return transaction(db,c=>recordOperationalAt(c,context,input,clock()));
}
async function recordOperationalAt(c,context,input,now){
    const current=await scope(c,context,now);
    if(!same(current,input.expectedScope))throw deny();
    const next=checked(input.observation,current,now);
    const prior=await readSnapshotState(c,context.owner);
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
          await appendGateArchivePage(c,context,current,archiveEntry(next),{readState,writeState});
          await writeState(c,key(context.owner),{...prior,conflict:true});
          return {status:'conflict',stored:true};
        }
        return {status:prior.conflict?'conflict':'duplicate',stored:false}; // no freshness renewal
      }
      // A conflict invalidates both sides. The next later proof starts baseline.
      if(!prior.conflict)previousObservation=old;
    }
    const source={ownerId:current.ownerId,rosterRevision:current.rosterRevision,observation:next.observation,previousObservation};
    await appendGateArchivePage(c,context,current,archiveEntry(next),{readState,writeState});
    await writeState(c,key(context.owner),{version:1,email:context.email,owner:context.owner,field:'gate',scope:current,source,conflict:false});
    return {status:previousObservation?'advanced':'baseline',stored:true};
}

/** Historical evidence only: does not plan, confirm a current gate or call a source.
 * Authentication/transaction belong to the existing server caller; require current
 * profile incarnation again, without requiring an active/upcoming publication.
 */
export async function readArchivedOperationalGateHistory(c,context,identity,{enabled=OPERATIONAL_HISTORY_ENABLED,lockSource=false,cursor=0,legacy=false}={}) {
  if(enabled!==true)return null;
  if(lockSource!==true || !validContext(context))throw deny();
  const occurrence=archiveKey(identity);
  const [owners]=await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE',[context.email]);
  if(owners.length!==1 || owners[0].public_id!==context.owner || ![false,0,'0'].includes(owners[0].must_change_password))throw deny();
  if(legacy===true)return readLegacyArchivePage(c,context,occurrence,cursor);
  const page=await readGateArchivePage(c,context,identity,{cursor,readState});
  if(page)return page;
  return readLegacyArchivePage(c,context,occurrence,cursor);
}
export async function readOperationalGateHistory(c,context,{enabled=OPERATIONAL_HISTORY_ENABLED,now=Date.now(),lockSource=false}={}) {
  if(enabled!==true)return null;
  if(lockSource!==true)throw deny();
  const current=await scope(c,context,now),record=await readSnapshotState(c,context.owner);
  if(!bound(record,context,current) || record.conflict)return null;
  const inspected=inspectOperationalChange(record.source,current,'gate',now);
  if(!['baseline','unchanged','change'].includes(inspected.status))return null;
  return copy({scope:current,source:record.source});
}

// All-occurrence archive admission reuses the shipping owner/competence resolver.
// It does not change the first-next-duty contract used by operational notifications.
export async function readRadarGateArchiveScope(c,context,{enabled=OPERATIONAL_HISTORY_ENABLED,now=Date.now(),lockSource=false,identity}={}) {
  if(enabled!==true)return null;
  if(lockSource!==true || !validContext(context) || !Number.isSafeInteger(now))throw deny();
  const occurrence=archiveKey(identity).identity;
  if(!gateQueryDay(occurrence,now).allowed)throw deny(); // no historical provider backfill
  const [owners]=await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE',[context.email]);
  if(owners.length!==1 || owners[0].public_id!==context.owner || ![false,0,'0'].includes(owners[0].must_change_password))throw deny();
  const [rows]=await c.query('SELECT id,owner_email,roster_key,roster,active,updated_at FROM crewcheck_platform_rosters WHERE owner_email=? ORDER BY roster_key DESC LIMIT 73 FOR UPDATE',[context.email]);
  const {buildCanonicalRosterEvents}=await import('./generated/canonicalRoster.mjs');
  const publication=resolveOwnedGatePublication(rows,context.email,occurrence,buildCanonicalRosterEvents);
  if(!publication)throw deny();
  return {ownerId:context.owner,rosterRevision:hash([publication.id,publication.revision,operationalRosterContentDigest(publication.roster)]),identity:occurrence};
}
function reportedObservation(observation,current,now) {
  const gate=normalizeRadarGate(observation?.gate),field=observation?.provenance?.fields?.departureGate;
  if(!['cirium-flex','flightaware'].includes(observation?.provider) || !radarResultDecision(observation,current.identity,now).allowed ||
    observation.querySuppressed || observation.operationalConflicts?.includes('gate') || observation.gateUpdate!=null ||
    !validArchiveGate(gate) ||
    field?.provider!==observation.provider || normalizeRadarGate(field.value)!==gate || field.observedAt!==null ||
    field.coverageState!=='provided_no_source_freshness' || Date.parse(field.receivedAt)!==observation.sourceReceivedAt ||
    !Number.isSafeInteger(observation.sourceReceivedAt) || observation.sourceReceivedAt<=0)throw deny();
  return {observation:{gate,provider:observation.provider},at:null,receipt:observation.sourceReceivedAt};
}
function archiveCustomObservation(observation,current,now){
 const proof=customGateSourceUpdate(observation,now);
 const admitted=verifiedRadarFields({...observation,gateUpdate:proof},current.identity,now);
 const gate=normalizeRadarGate(observation?.gate);
 if(!proof || !validArchiveGate(gate) || admitted.gate!==gate || !radarResultDecision(observation,current.identity,now).allowed)throw deny();
 return {observation:{gate,provider:'custom'},at:Date.parse(proof.sourceUpdatedAt),receipt:observation.sourceReceivedAt};
}
export async function recordRadarGateArchive(db,context,input,{enabled=OPERATIONAL_HISTORY_ENABLED,clock=Date.now,revalidate=async()=>true}={}) {
  if(enabled!==true)return {status:'disabled',stored:false};
  if(!input?.expectedScope || input.field!=='gate')throw deny();
  return transaction(db,async c=>{
    const now=clock(),current=await readRadarGateArchiveScope(c,context,{enabled:true,now,lockSource:true,identity:input.expectedScope.identity});
    if(!same(current,input.expectedScope))throw deny();
    const next=input.observation?.provider==='custom' ? archiveCustomObservation(input.observation,current,clock()) : reportedObservation(input.observation,current,clock());
    if(!gateQueryDay(current.identity,clock()).allowed || !await revalidate())throw deny();
    if(input.observation?.provider==='custom'){
      let operational;
      try{operational=await scope(c,context,clock());}catch(error){if(error.code!=='BRIEFING_CONTEXT_UNAVAILABLE')throw error;}
      let operationalAdmitted=false;
      if(operational && archiveKey(operational.identity).key===archiveKey(current.identity).key){
        try{checked(input.observation,operational,clock());operationalAdmitted=true;}catch(error){if(error.code!=='BRIEFING_CONTEXT_UNAVAILABLE')throw error;}
      }
      if(operationalAdmitted)await recordOperationalAt(c,context,{...input,expectedScope:operational},clock());
    }
    const result=await appendGateArchivePage(c,context,current,archiveEntry(next),{readState,writeState});
    if(!gateQueryDay(current.identity,clock()).allowed || !await revalidate())throw deny();
    return result;
  });
}

async function readLegacyArchivePage(c,context,occurrence,cursor){
 if(!Number.isSafeInteger(cursor)||cursor<0||cursor>Math.floor(Number.MAX_SAFE_INTEGER/GATE_ARCHIVE_PAGE_SIZE))throw deny();
 const root=`$.archive."${occurrence.key}"`,paths=Array.from({length:GATE_ARCHIVE_PAGE_SIZE},(_,i)=>`${root}.observations[${cursor*GATE_ARCHIVE_PAGE_SIZE+i}]`);
 const sql=`SELECT JSON_OBJECT('email',JSON_EXTRACT(payload,'$.email'),'owner',JSON_EXTRACT(payload,'$.owner'),'identity',JSON_EXTRACT(payload,?),'total',JSON_LENGTH(JSON_EXTRACT(payload,?)),'observations',JSON_EXTRACT(payload,${paths.map(()=>'?').join(',')})) AS payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE`;
 const [rows]=await c.query(sql,[root+'.identity',root+'.observations',...paths,legacyKey(context.owner)]);
 if(!Array.isArray(rows)||rows.length>1)throw deny();const record=authority.parse(rows[0]);
 if(!record?.identity)return null;
 if(record.email!==context.email||record.owner!==context.owner||archiveKey(record.identity).key!==occurrence.key||!Number.isSafeInteger(record.total)||record.total<1||!Array.isArray(record.observations)||record.observations.length>GATE_ARCHIVE_PAGE_SIZE)throw deny();
 if(cursor*GATE_ARCHIVE_PAGE_SIZE>=record.total)throw deny();
 const observations=record.observations.map((item,i)=>{
  if(item?.provider!=='custom'||!/^[A-Z]?\d{1,3}[A-Z]?$/.test(item.gate||'')||!Number.isFinite(Date.parse(item.observedAt))||!Number.isFinite(Date.parse(item.receivedAt))||Date.parse(item.observedAt)>Date.parse(item.receivedAt)||!/^[a-f0-9]{64}$/.test(item.rosterRevision||''))throw deny();
  return {gate:item.gate,provider:item.provider,observedAt:null,sourceUpdatedAt:item.observedAt,receivedAt:item.receivedAt,rosterRevision:item.rosterRevision,sequence:cursor*GATE_ARCHIVE_PAGE_SIZE+i+1,conflicted:null};
 });
 return {kind:'historical-gate-records',currentConfirmation:false,order:'recorded-sequence',legacy:true,conflictState:'not-indexed-legacy',identity:occurrence.identity,cursor,total:record.total,pageSize:GATE_ARCHIVE_PAGE_SIZE,nextCursor:(cursor+1)*GATE_ARCHIVE_PAGE_SIZE<record.total?cursor+1:null,observations};
}
