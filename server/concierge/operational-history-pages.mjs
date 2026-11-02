import {createHash} from 'node:crypto';
import {normalizeRadarGate} from '../../shared/radar-field-evidence.mjs';
import {originFlightDate} from '../../shared/gate-query-day.mjs';
export const GATE_ARCHIVE_PAGE_SIZE=100;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const deny=()=>Object.assign(new Error('Gate archive unavailable'),{code:'GATE_ARCHIVE_UNAVAILABLE'});
const iso=x=>typeof x==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString()===x;
export function gateArchiveIdentity(input){
 const value=input && Object.fromEntries(['flight','origin','destination','departureDate','scheduledDepartureUtc'].map(k=>[k,input[k]]));
 if(!value || !/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(value.flight||'') || !/^[A-Z]{3}$/.test(value.origin||'') || !/^[A-Z]{3}$/.test(value.destination||'') || value.origin===value.destination ||
 !/^\d{4}-\d{2}-\d{2}$/.test(value.departureDate||'') || typeof value.scheduledDepartureUtc!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.scheduledDepartureUtc) ||
 !Number.isFinite(Date.parse(value.scheduledDepartureUtc)) || new Date(value.scheduledDepartureUtc).toISOString().slice(0,19)!==value.scheduledDepartureUtc.slice(0,19) || originFlightDate(value.scheduledDepartureUtc,value.origin)!==value.departureDate)throw deny();
 value.scheduledDepartureUtc=new Date(value.scheduledDepartureUtc).toISOString();return value;
}
function namespace(context,identity){
 if(typeof context?.email!=='string' || !context.email || context.email.length>320 || typeof context.owner!=='string' || !/^[A-Za-z0-9_-]{8,160}$/.test(context.owner))throw deny();
 return {prefix:'operational-source-history:archive:'+hash(context.owner)+':'+hash(identity),email:context.email,owner:context.owner};
}
function bound(record,ns,kind){if(!record || record.version!==1 || record.kind!==kind || record.email!==ns.email || record.owner!==ns.owner)throw deny();return record;}
const make=(ns,kind,values)=>({version:1,kind,email:ns.email,owner:ns.owner,...values});
const proofKey=(prefix,e)=>prefix+':proof:'+hash([e.provider,e.sourceUpdatedAt??e.receivedAt]);
export const validArchiveGate=value=>typeof value==='string' && normalizeRadarGate(value)===value && /^[A-Z0-9][A-Z0-9 .-]{0,11}$/.test(value) && !/\b(?:PÁTIO|PATIO|REMOTA|REMOTO|REMOTE|BUS)\b/.test(value);
function entry(input,revision){
 if(!input || input.observedAt!==null || !validArchiveGate(input.gate) || !['custom','cirium-flex','flightaware'].includes(input.provider) ||
 (input.sourceUpdatedAt!==null && !iso(input.sourceUpdatedAt)) || !iso(input.receivedAt) || (input.sourceUpdatedAt!==null && Date.parse(input.sourceUpdatedAt)>Date.parse(input.receivedAt)) || !/^[a-f0-9]{64}$/.test(revision||''))throw deny();
 return {gate:input.gate,provider:input.provider,observedAt:null,sourceUpdatedAt:input.sourceUpdatedAt,receivedAt:input.receivedAt,rosterRevision:revision};
}
function metadata(record,ns,identity){
 if(!record)return null;bound(record,ns,'gate-archive-index');
 if(hash(gateArchiveIdentity(record.identity))!==hash(identity) || !Number.isSafeInteger(record.total) || record.total<1 || record.total>=Number.MAX_SAFE_INTEGER || record.pages!==Math.ceil(record.total/GATE_ARCHIVE_PAGE_SIZE))throw deny();return record;
}
// Caller owns the SQL transaction and account-incarnation lock. Every row is
// bounded; append reads at most five indexed records and touches one fixed page.
export async function appendGateArchivePage(c,context,scope,observation,{readState,writeState}){
 if(scope?.ownerId!==context?.owner)throw deny();
 const identity=gateArchiveIdentity(scope.identity),ns=namespace(context,identity),e=entry(observation,scope.rosterRevision);
 const meta=metadata(await readState(c,ns.prefix),ns,identity);
 const marker=ns.prefix+':event:'+hash([e.provider,e.gate,e.sourceUpdatedAt??e.receivedAt]);
 const duplicate=await readState(c,marker);
 if(duplicate){bound(duplicate,ns,'gate-archive-event');if(!meta||!Number.isSafeInteger(duplicate.page)||duplicate.page<0||duplicate.page>=meta.pages)throw deny();return {status:'duplicate',stored:false};}
 const headKey=ns.prefix+':head:'+e.provider,head=await readState(c,headKey);
 if(head){bound(head,ns,'gate-archive-head');entry(head,head.rosterRevision);}
 if(head && (!iso(head.maxReceivedAt) || (head.maxSourceUpdatedAt!==null&&!iso(head.maxSourceUpdatedAt)) || typeof head.ambiguous!=='boolean'))throw deny();
 if(e.sourceUpdatedAt===null && head?.sourceUpdatedAt===null && !head.ambiguous && head.gate===e.gate && Date.parse(head.receivedAt)<=Date.parse(e.receivedAt))return {status:'duplicate',stored:false};
 const groupKey=proofKey(ns.prefix,e),group=await readState(c,groupKey);
 if(group){bound(group,ns,'gate-archive-proof');if(!validArchiveGate(group.firstGate)||typeof group.conflicted!=='boolean')throw deny();}
 const count=meta?.total||0,page=Math.floor(count/GATE_ARCHIVE_PAGE_SIZE),pageKey=ns.prefix+':page:'+page;
 const previous=await readState(c,pageKey);
 if(previous)bound(previous,ns,'gate-archive-page');
 const entries=previous?.entries||[];
 if(!Array.isArray(entries) || entries.length!==count%GATE_ARCHIVE_PAGE_SIZE)throw deny();
 for(const existing of entries)entry(existing,existing.rosterRevision);
 const outOfOrder=Boolean(head && (Date.parse(head.maxReceivedAt)>Date.parse(e.receivedAt) || (head.maxSourceUpdatedAt!==null && e.sourceUpdatedAt!==null && Date.parse(head.maxSourceUpdatedAt)>Date.parse(e.sourceUpdatedAt))));
 const conflicted=group?.conflicted===true || Boolean(group && group.firstGate!==e.gate);
 await writeState(c,pageKey,make(ns,'gate-archive-page',{page,entries:[...entries,{...e,sequence:count+1,outOfOrder}]}));
 await writeState(c,groupKey,make(ns,'gate-archive-proof',{firstGate:group?.firstGate||e.gate,conflicted}));
 await writeState(c,marker,make(ns,'gate-archive-event',{page}));
 const latest=!head||Date.parse(head.receivedAt)<=Date.parse(e.receivedAt)?e:entry(head,head.rosterRevision);
 // Independent index watermarks are not a synthesized source observation.
 const maxReceivedAt=!head||Date.parse(head.maxReceivedAt)<Date.parse(e.receivedAt)?e.receivedAt:head.maxReceivedAt;
 const maxSourceUpdatedAt=!head?.maxSourceUpdatedAt || (e.sourceUpdatedAt!==null&&Date.parse(head.maxSourceUpdatedAt)<Date.parse(e.sourceUpdatedAt))?e.sourceUpdatedAt:head.maxSourceUpdatedAt;
 const ambiguous=latest===e || (head&&proofKey(ns.prefix,head)===groupKey)?conflicted:head.ambiguous;
 await writeState(c,headKey,make(ns,'gate-archive-head',{...latest,maxReceivedAt,maxSourceUpdatedAt,ambiguous}));
 await writeState(c,ns.prefix,make(ns,'gate-archive-index',{identity,total:count+1,pages:Math.ceil((count+1)/GATE_ARCHIVE_PAGE_SIZE)}));
 return {status:'archived',stored:true};
}
export async function readGateArchivePage(c,context,input,{cursor=0,readState}={}){
 if(!Number.isSafeInteger(cursor)||cursor<0)throw deny();
 const identity=gateArchiveIdentity(input),ns=namespace(context,identity),meta=metadata(await readState(c,ns.prefix),ns,identity);
 if(!meta)return null;
 if(cursor>=meta.pages)throw deny();
 const page=bound(await readState(c,ns.prefix+':page:'+cursor),ns,'gate-archive-page');
 const expected=cursor===meta.pages-1 ? (meta.total-1)%GATE_ARCHIVE_PAGE_SIZE+1 : GATE_ARCHIVE_PAGE_SIZE;
 if(page.page!==cursor || !Array.isArray(page.entries) || page.entries.length!==expected)throw deny();
 const groups=new Map(),observations=[];
 for(const raw of page.entries){
  const e=entry(raw,raw.rosterRevision),key=proofKey(ns.prefix,e);
  if(!groups.has(key)){
   const proof=bound(await readState(c,key),ns,'gate-archive-proof');
   if(typeof proof.conflicted!=='boolean'||!validArchiveGate(proof.firstGate))throw deny();
   groups.set(key,proof);
  }
  if(raw.sequence!==cursor*GATE_ARCHIVE_PAGE_SIZE+observations.length+1)throw deny();
  observations.push({...e,sequence:raw.sequence,outOfOrder:raw.outOfOrder===true,conflicted:groups.get(key).conflicted===true});
 }
 return {kind:'historical-gate-records',currentConfirmation:false,order:'recorded-sequence',identity,cursor,nextCursor:cursor+1<meta.pages?cursor+1:null,total:meta.total,pageSize:GATE_ARCHIVE_PAGE_SIZE,observations};
}
