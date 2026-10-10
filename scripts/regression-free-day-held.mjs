import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FREE_DAY_SCOPE as scope, freeDayConsentKey, heldSourceReceipt, mutateFreeDayHeld, readFreeDayHeldState, handleFreeDayHeld } from '../server/free-day-held.mjs';
import { dispatchClaimedJob, safeScheduleJob, safeCancelJob } from '../server/notification-job-safety.mjs';
import { notificationStateDeletionStatements } from '../server/v139/notificationStateDeletion.mjs';
globalThis.fetch = () => { throw Error('Network forbidden'); };
const now = Date.parse('2026-08-01T12:00:00Z');
const user = { email:'synthetic@example.invalid', id:'synthetic-owner' };
function roster(clock) { return { year:2026,month:8,crewId:'900001',base:'BSB',rank:'CCM',rawText:'',days:[12,13,14].map(n=>({ date:`${n}/08/2026`, type:n===12?'DO':'DR', legs:[], freeDayStartEvidence:{ date:`${n}/08/2026`,code:n===12?'DO':'DR',clock,clockSource:'published',timeZoneSource:'published',utcOffsetMinutes:-180,origin:'AIMS published rest tokens',tokenExcerpt:`${n===12?'DO':'DR'} ${clock} BSB` } })) }; }
function database() {
 const state = { owner:user.id, states:new Map(), jobs:new Map(), source:{id:'synthetic-source',active:1,roster:JSON.stringify(roster('01:46'))}, link:{email:user.email,chatId:'synthetic-link',linkedAt:new Date(now).toISOString(),code:'synthetic-code'}, writes:0, commits:0, rollbacks:0 };
 let serial=Promise.resolve();
 return {state,getConnection:async()=>{
  let snapshot,release;const waiting=serial;serial=new Promise(r=>release=r);
  const connection={
   beginTransaction:async()=>{await waiting;snapshot=structuredClone(state);},
   commit:async()=>{state.commits++;snapshot=null;},
   rollback:async()=>{if(snapshot){const rollbacks=state.rollbacks+1;Object.assign(state,snapshot,{rollbacks});snapshot=null;}},
   release:()=>release(),
   query:async(sql,args=[])=>{
    if(sql.startsWith('SELECT public_id'))return [[{public_id:state.owner,created_epoch:Date.parse('2020-01-01T00:00:00Z')}]];
    if(sql.startsWith('SELECT payload'))return [[...(args[0]===`link-email:${user.email}`?[{payload:JSON.stringify(state.link)}]:state.states.has(args[0])?[{payload:state.states.get(args[0])}]:[])]];
    if(sql.startsWith('SELECT id,roster'))return [[...(args[0]===user.email&&args[1]===state.source.id?[structuredClone(state.source)]:[])]];
    if(sql.startsWith('SELECT id,status'))return [[...(state.jobs.has(args[1])?[structuredClone(state.jobs.get(args[1]))]:[])]];
    if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){state.states.set(args[0],args[1]);state.writes++;return[{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO crewcheck_notification_jobs')){assert.match(sql,/'held'/);assert.match(sql,/NULL,NULL,NULL/);state.jobs.set(args[1],{id:state.jobs.size+1,status:'held',email:args[0],job_key:args[1],message:args[3]});state.writes++;return[{affectedRows:1}];}
    if(sql.startsWith('UPDATE crewcheck_notification_jobs')){let affectedRows=0;for(const job of state.jobs.values())if(job.email===args[0]&&(!sql.includes('job_key=?')||job.job_key===args[1])&&['held','pending','processing'].includes(job.status)){job.status='cancelled';affectedRows++;}return[{affectedRows}];}
    throw Error('Unexpected SQL: '+sql);
   }
  };return connection;
 }};
}
const body=(action,expectedRevision,extra={})=>({scope,action,expectedRevision,...extra});
const mutate=(db,action,revision,extra={},options={})=>mutateFreeDayHeld(db,user,body(action,revision,extra),{now,configured:true,...options});
const db=database();
await assert.rejects(mutate(db,'reference',0,{sourceId:'synthetic-source'}),{code:'CONSENT_REQUIRED_OR_EXPIRED'});
assert.equal(db.state.states.size,0);assert.equal(db.state.jobs.size,0);
assert.equal((await mutate(db,'grant',0)).revision,1);
const restarted={...db,getConnection:db.getConnection};assert.equal((await readFreeDayHeldState(restarted,user,{now})).consent,true,'consent survives module/process recreation via DB');
assert.equal((await readFreeDayHeldState(restarted,user,{now:now+30*86400000})).consent,false);
const foreignStatus=await readFreeDayHeldState(db,{email:'other@example.invalid',id:user.id},{now});assert.equal(foreignStatus.consent,false,'other account state is distinct');
assert.equal(JSON.parse(db.state.states.get(freeDayConsentKey(user.email,user.id))).dispatchAllowed,false);
await assert.rejects(mutate(db,'grant',0),{code:'CONSENT_REVISION_CHANGED'});
assert.equal((await mutate(db,'reference',1,{sourceId:'synthetic-source'})).revision,2);
const receipt=JSON.parse(db.state.states.get(freeDayConsentKey(user.email,user.id))).reference;
assert.equal(receipt.sourceVerified,false);assert.equal(receipt.provenance,'stored-client-snapshot');assert.doesNotMatch(JSON.stringify(receipt),/900001|SYNTHETIC NAME|rawText|rank|tokenExcerpt/);
db.state.source.roster=JSON.stringify(roster('08:30'));
const prepared=await mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'});
assert.equal(prepared.delayMinutes,404);assert.equal(prepared.status,'held');assert.equal(prepared.possibleAmount,null);assert.equal(prepared.sourceVerified,false);assert.equal(prepared.dispatchAllowed,false);
assert.equal((await readFreeDayHeldState(db,user,{now,configured:true})).referenceAvailable,true);
assert.equal((await mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})).duplicate,true);assert.equal(db.state.jobs.size,1);
const concurrent=await Promise.all(Array.from({length:4},()=>mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})));assert.ok(concurrent.every(x=>x.duplicate));assert.equal(db.state.jobs.size,1);
for(const extra of [{sourceId:'foreign-source',sequenceDate:'2026-08-12'},{sourceId:'synthetic-source',sequenceDate:'2026-02-31'},{sourceId:'synthetic-source',sequenceDate:'2026-08-13'}])await assert.rejects(mutate(db,'prepare',2,extra));
for(const extra of [{chatId:'foreign'},{ownerId:'foreign'},{configured:true},{sourceVerified:true},{alert:{delayMinutes:999}},{possibleAmount:700}])await assert.rejects(mutate(db,'prepare',2,extra),{code:'CLIENT_AUTHORITY_REJECTED'});
await assert.rejects(mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'},{configured:false}),{code:'CONFIGURATION_REQUIRED'});
db.state.link.email='foreign@example.invalid';await assert.rejects(mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}),{code:'VERIFIED_LINK_REQUIRED'});db.state.link.email=user.email;
db.state.link.linkedAt='2019-01-01T00:00:00Z';await assert.rejects(mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}),{code:'VERIFIED_LINK_REQUIRED'});db.state.link.linkedAt=new Date(now+1000).toISOString();
assert.equal((await mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})).status,'cancelled','same-chat re-link timestamp invalidates held receipt');db.state.link.chatId='renewed-synthetic-link';assert.equal((await mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})).status,'cancelled');
assert.equal((await mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})).status,'cancelled','terminal never reactivated');
assert.equal((await mutate(db,'renew',2)).revision,3);
assert.equal(JSON.parse(db.state.states.get(freeDayConsentKey(user.email,user.id))).reference,undefined,'renewal clears reference and held jobs');
await assert.rejects(mutate(db,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}),{code:'CONSENT_REVISION_CHANGED'});
assert.equal((await mutate(db,'revoke',3)).consent,false);await assert.rejects(mutate(db,'renew',4),{code:'CONSENT_REQUIRED_OR_EXPIRED'});
const expiry=database();await mutate(expiry,'grant',0);await assert.rejects(mutate(expiry,'reference',1,{sourceId:'synthetic-source'},{now:now+30*86400000}),{code:'CONSENT_REQUIRED_OR_EXPIRED'});
const recreated=database();await mutate(recreated,'grant',0);recreated.state.owner='recreated-owner';await assert.rejects(mutate(recreated,'revoke',1),{code:'OWNER_CHANGED'});
const newOwner={email:user.email,id:'recreated-owner'};assert.equal((await mutateFreeDayHeld(recreated,newOwner,body('grant',0),{now})).revision,1,'account recreation cannot inherit consent');
assert.notEqual(freeDayConsentKey(user.email,user.id),freeDayConsentKey(user.email,newOwner.id));
const shifted=database();await mutate(shifted,'grant',0);await mutate(shifted,'reference',1,{sourceId:'synthetic-source'});
const expanded=roster('08:30');const earlier=structuredClone(expanded.days[0]);earlier.date='11/08/2026';earlier.freeDayStartEvidence.date=earlier.date;expanded.days.unshift(earlier);shifted.state.source.roster=JSON.stringify(expanded);
await assert.rejects(mutate(shifted,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}),{code:'SEQUENCE_CORRESPONDENCE_PENDING'});assert.equal(shifted.state.jobs.size,0,'earlier current sequence cannot create false404min held');
const removed=roster('08:30');removed.days.shift();shifted.state.source.roster=JSON.stringify(removed);await assert.rejects(mutate(shifted,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}),{code:'SEQUENCE_CORRESPONDENCE_PENDING'});assert.equal(shifted.state.jobs.size,0);
const isolated=roster('08:30');const unrelated=structuredClone(isolated.days[0]);unrelated.date='10/08/2026';unrelated.freeDayStartEvidence.date=unrelated.date;isolated.days.unshift(unrelated);shifted.state.source.roster=JSON.stringify(isolated);assert.equal((await mutate(shifted,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})).delayMinutes,404,'nonconsecutive preceding rest leaves12Aug boundary intact');
const changed=database();await mutate(changed,'grant',0);await mutate(changed,'reference',1,{sourceId:'synthetic-source'});const foreign=roster('08:30');foreign.crewId='900002';changed.state.source.roster=JSON.stringify(foreign);await assert.rejects(mutate(changed,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}),{code:'IDENTITY_OR_PERIOD_PENDING'});
for(const change of ['missing','date','zone','token']){const source=roster('08:30');if(change==='missing')delete source.days[0].freeDayStartEvidence;if(change==='date')source.days[0].date='31/02/2026';if(change==='zone')source.days[0].freeDayStartEvidence.utcOffsetMinutes=null;if(change==='token')source.days[0].freeDayStartEvidence.tokenExcerpt='DO 09:30 BSB';changed.state.source.roster=JSON.stringify(source);await assert.rejects(mutate(changed,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}));}
// Consent and prepare share the owner lock: revocation first prevents the queued request.
const race=database();await mutate(race,'grant',0);await mutate(race,'reference',1,{sourceId:'synthetic-source'});race.state.source.roster=JSON.stringify(roster('08:30'));
const results=await Promise.allSettled([mutate(race,'revoke',2),mutate(race,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'})]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(race.state.jobs.size,0);
const revokeHeld=database();await mutate(revokeHeld,'grant',0);await mutate(revokeHeld,'reference',1,{sourceId:'synthetic-source'});revokeHeld.state.source.roster=JSON.stringify(roster('08:30'));await mutate(revokeHeld,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'});await mutate(revokeHeld,'revoke',2);assert.ok([...revokeHeld.state.jobs.values()].every(x=>x.status==='cancelled'));
// Failed receipt write rolls back the queue reservation.
const broken=database();await mutate(broken,'grant',0);await mutate(broken,'reference',1,{sourceId:'synthetic-source'});broken.state.source.roster=JSON.stringify(roster('08:30'));const get=broken.getConnection;broken.getConnection=async()=>{const c=await get();const query=c.query;c.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO crewcheck_telegram_state')&&args[0].startsWith('notification-free-day-job:'))throw Error('Synthetic write failure');return query(sql,args);};return c;};await assert.rejects(mutate(broken,'prepare',2,{sourceId:'synthetic-source',sequenceDate:'2026-08-12'}));assert.equal(broken.state.jobs.size,0);
let deliveries=0;const dispatchDb={query:async sql=>sql.startsWith('SELECT *')?[[{id:1,job_key:prepared.jobKey,status:'processing'}]]:[{affectedRows:1}]};assert.equal((await dispatchClaimedJob(dispatchDb,{id:1},{deliver:()=>deliveries++})).status,'cancelled');assert.equal(deliveries,0,'even forged processing free-day jobs cannot dispatch');
const res={};await safeScheduleJob({req:{},res,identity:()=>user,readJson:async()=>({scheduledAt:new Date(Date.now()+60000).toISOString(),jobKey:prepared.jobKey}),dbPool:async()=>({query:async(sql)=>sql.startsWith('SELECT public_id')?[[{public_id:user.id}]]:[[]]}),ensureNotificationTable:async()=>{},linkedTelegramRecord:async()=>({chatId:'synthetic'}),sendJson:(_r,status,payload)=>Object.assign(res,{status,payload})});assert.equal(res.status,409,'manual alarm cannot bypass reserved namespace');
const response={};await handleFreeDayHeld({},response,{identity:()=>null,readJson:()=>{throw Error('Should not read');},dbPool:()=>{throw Error('Should not connect');},sendJson:(_r,status,payload)=>Object.assign(response,{status,payload})});assert.equal(response.status,401);
for(const row of notificationStateDeletionStatements(user.email).filter(([sql])=>sql.includes('telegram_state')))assert.match(row[0],/notification-free-day:/);
assert.match(fs.readFileSync('server/notification-job-safety.mjs','utf8'),/status IN \('held','pending','processing'\)/);
assert.doesNotMatch(fs.readFileSync('server/free-day-held.mjs','utf8'),/fetch\(|setInterval\(|setTimeout\(|sendTelegram|TELEGRAM_BOT_TOKEN/);
fs.mkdirSync('artifacts/free-day-held',{recursive:true});fs.writeFileSync('artifacts/free-day-held/report.json',JSON.stringify({synthetic:true,scope,prepared,checks:['consent30dayExpiry','ownerRecreation','staleRevision','renewAndRevoke','linkIdentityAndRotation','referenceServerReceipt','404minNoACTClaim','bothVersionSequenceBoundaries','earlierCurrentSequencePendingWithoutReservation','dateClockTimezonePending','transactionsRollback','concurrentIdempotency','revokeRace','reservedManualNamespace','forgedProcessingNeverDispatch'],delivered:false,productionWrites:false},null,2));
console.log('PASS synthetic held queue: consent/expiry/renew/revoke, server owner/reference metadata404min, idempotency/races/rollback, link rotation, no ACT value/source proof, reserved namespace and zero dispatch');
