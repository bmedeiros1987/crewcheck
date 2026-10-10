import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import {simulatedWorker,handleSimulatedWorker,simulatedWorkerConfiguration,WORKER_SCOPE,WORKER_CUTOFF_MS,localProviderStats} from '../server/free-day-simulated-worker.mjs';
import {personalConsent,PERSONAL_SCOPE} from '../server/free-day-personal-consent.mjs';
import {voluntarySources,SOURCE_SCOPE} from '../server/free-day-sources.mjs';
import {sourceJobStateKey} from '../server/free-day-source-job-state.mjs';
import {syntheticSourceDatabase} from './fixtures/free-day-source-db.mjs';
const user={email:'synthetic-worker@example.invalid',id:'synthetic-owner'},now=Date.parse('2026-10-10T12:00Z'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const configuration={enabled:true,ownerIds:[user.id]},options={now,configuration},offer={now,configuration:{offerEnabled:true,ownerIds:[user.id]}};
const receipt=clock=>({identityDigest:hash(['900001','BSB']),period:'2026-08',documentHash:hash(clock),starts:[12,13,14].map(d=>({date:`2026-08-${d}`,clock,offset:-180,literal:true}))});
const review=(revision=0,after='08:30')=>({scope:SOURCE_SCOPE,action:'review',expectedRevision:revision,before:receipt('01:46'),after:receipt(after),sequenceDate:'2026-08-12',confirmed:true,consent:true});
const link=(db,chatId='9000012345')=>{const v={email:user.email,chatId,linkedAt:'2026-10-01T12:00Z',username:'synthetic_crew',code:'synthetic-only'};for(const key of [`link-email:${user.email}`,`link-chat:${chatId}`])db.state.rows.set(key,JSON.stringify(v));};
const seed=async({consent=true,chat='9000012345'}={})=>{const db=syntheticSourceDatabase();link(db,chat);await voluntarySources(db,user,review(),{now});const state=await personalConsent(db,user,null,offer);if(consent)await personalConsent(db,user,{scope:PERSONAL_SCOPE,action:'grant',context:state.context,expectedRevision:state.revision,confirmed:true,textVersion:state.textVersion},offer);return db;};
const request=(state,action='enqueue')=>({scope:WORKER_SCOPE,action,context:state.context,expectedPersonalRevision:state.personalRevision,expectedWorkerRevision:state.workerRevision});
const ready=async db=>{const state=await simulatedWorker(db,user,null,options);return simulatedWorker(db,user,request(state),options);};
assert.deepEqual(simulatedWorkerConfiguration({}),{enabled:false,ownerIds:[]});
assert.equal(simulatedWorkerConfiguration({CREWCHECK_FREE_DAY_WORKER_SIMULATION_ENABLED:'true',CREWCHECK_FREE_DAY_PERSONAL_CONSENT_OWNER_IDS:user.id}).enabled,false);
const db=await seed(),start=await simulatedWorker(db,user,null,options);assert.equal(start.phase,'held');assert.equal(start.eligible,true);assert.equal(start.dispatchAllowed,false);
for(const cfg of [{enabled:false,ownerIds:[user.id]},{enabled:true,ownerIds:[]},{enabled:true,ownerIds:['other']}])await assert.rejects(simulatedWorker(db,user,request(start),{now,configuration:cfg}),{code:'WORKER_SIMULATION_NOT_OFFERED'});
for(const extra of [{chatId:'9000012345'},{provider:'telegram'},{outcome:'accepted'},{ownerId:user.id},{url:'https://example.invalid'},{consent:true}])await assert.rejects(simulatedWorker(db,user,{...request(start),...extra},options),{code:'CLIENT_AUTHORITY_REJECTED'});
const snapshot=JSON.stringify([...db.state.rows]);await assert.rejects(simulatedWorker(db,{...user,id:'other'},request(start),options),{code:'OWNER_CHANGED'});assert.equal(JSON.stringify([...db.state.rows]),snapshot);
const enqueued=await Promise.all(Array.from({length:8},()=>simulatedWorker(db,user,request(start),options)));assert.equal(enqueued.filter(x=>!x.duplicate).length,1);
const before=localProviderStats.calls,runs=await Promise.all(Array.from({length:8},()=>simulatedWorker(db,user,request(enqueued[0],'run'),options)));assert.equal(localProviderStats.calls-before,1);assert.ok(runs.some(x=>x.phase==='accepted_unconfirmed'));const persisted=await simulatedWorker(db,user,null,options);assert.equal(persisted.phase,'accepted_unconfirmed');assert.equal(persisted.accepted,false);assert.equal(persisted.delivered,false);assert.equal(persisted.simulation.simulatedAccepted,true);assert.equal([...db.state.jobs.values()][0].status,'held');assert.equal([...db.state.jobs.values()][0].chat_id,null);assert.doesNotMatch(JSON.stringify(persisted),/synthetic_crew|9000012345|example.invalid|01:46|08:30/);
for(const outcome of ['uncertain','rejected']){const d=await seed(),pending=await ready(d),n=localProviderStats.calls;const result=await simulatedWorker(d,user,request(pending,'run'),{...options,outcome});assert.equal(result.phase,outcome);for(let i=0;i<3;i++)assert.equal((await simulatedWorker(d,user,request(pending,'run'),options)).duplicate,true);assert.equal(localProviderStats.calls-n,1);}
const interrupted=await seed(),p=await ready(interrupted),n=localProviderStats.calls;const claim=await simulatedWorker(interrupted,user,request(p,'run'),{...options,interruptAfterClaim:true});assert.equal(claim.phase,'dispatching');assert.equal(localProviderStats.calls,n);assert.equal((await simulatedWorker(interrupted,user,request(p,'run'),options)).phase,'dispatching');const stale=await simulatedWorker(interrupted,user,request(p,'run'),{...options,now:now+WORKER_CUTOFF_MS});assert.equal(stale.phase,'uncertain');assert.equal(localProviderStats.calls,n,'interrupted claims never resume provider');
for(const change of ['revoke','rotate','expiry','replace','allowlist','recreate']){
 const d=await seed(),pending=await ready(d),count=localProviderStats.calls;let opts=options;
 if(change==='revoke'){const c=await personalConsent(d,user,null,offer);await personalConsent(d,user,{scope:PERSONAL_SCOPE,action:'revoke',context:c.context,expectedRevision:c.revision},offer);}
 if(change==='rotate')link(d,'9000098765');
 if(change==='expiry')opts={...options,now:now+31*86400000};
 if(change==='replace')await voluntarySources(d,user,review(1,'09:30'),{now});
 if(change==='allowlist')opts={...options,configuration:{enabled:true,ownerIds:[]}};
 if(change==='recreate')d.state.created=now;
 await assert.rejects(simulatedWorker(d,user,request(pending,'run'),opts));assert.equal(localProviderStats.calls,count);
 if(change==='revoke' || change==='allowlist')assert.equal((await simulatedWorker(d,user,null,opts)).phase,'cancelled');
}
const between=await seed(),bp=await ready(between),bc=localProviderStats.calls;await simulatedWorker(between,user,request(bp,'run'),{...options,interruptAfterClaim:true});const personal=await personalConsent(between,user,null,offer);await personalConsent(between,user,{scope:PERSONAL_SCOPE,action:'revoke',context:personal.context,expectedRevision:personal.revision},offer);await assert.rejects(simulatedWorker(between,user,request(bp,'run'),options),{code:'WORKER_AUTHORIZATION_CHANGED'});assert.equal(localProviderStats.calls,bc);assert.equal((await simulatedWorker(between,user,null,options)).phase,'uncertain');
const group=await seed({chat:'-9000012345'}),gp=await ready(group);assert.equal((await simulatedWorker(group,user,request(gp,'run'),options)).phase,'accepted_unconfirmed');
const noConsent=await seed({consent:false}),nc=await simulatedWorker(noConsent,user,null,options);await assert.rejects(simulatedWorker(noConsent,user,request(nc),options),{code:'WORKER_AUTHORIZATION_CHANGED'});
const cas=await seed(),cs=await simulatedWorker(cas,user,null,options);await assert.rejects(simulatedWorker(cas,user,{...request(cs),expectedWorkerRevision:9},options),{code:'WORKER_REVISION_CHANGED'});await assert.rejects(simulatedWorker(cas,user,{...request(cs),expectedPersonalRevision:0},options),{code:'WORKER_AUTHORIZATION_CHANGED'});
// Before cutoff, rollback leaves held and no invocation. After cutoff, audit
// failure leaves dispatching durably; its later uncertain state cannot replay.
for(const phase of ['pending','accepted_unconfirmed']){
 const d=await seed(),state=phase==='pending'?await simulatedWorker(d,user,null,options):await ready(d),connect=d.getConnection;
 d.getConnection=async()=>{const c=await connect(),q=c.query;c.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO crewcheck_telegram_state') && JSON.parse(args[1]).worker?.phase===phase)throw Error('synthetic audit failure');return q(sql,args);};return c;};
 const count=localProviderStats.calls;await assert.rejects(simulatedWorker(d,user,request(state,phase==='pending'?'enqueue':'run'),options),/audit failure/);
 assert.equal(localProviderStats.calls-count,phase==='pending'?0:1);
 const result=await simulatedWorker(d,user,null,{...options,now:now+WORKER_CUTOFF_MS});assert.equal(result.phase,phase==='pending'?'held':'uncertain');
 if(phase!=='pending'){await simulatedWorker(d,user,request(state,'run'),options);assert.equal(localProviderStats.calls-count,1);}
}
// Wall-clock regressions: advance time while acquiring the connection/locks,
// at durable claim commit, and at the last synchronous provider gate.
for(const stage of ['connection','first-lock','second-lock','claim-commit','pre-provider'])for(const ttl of ['personal','source']) {
 const d=await seed(),pending=await ready(d),job=[...d.state.jobs.values()][0],metadataKey=sourceJobStateKey(user,job.job_key),metadata=JSON.parse(d.state.rows.get(metadataKey));
 let current=now,calls=0;const expires=ttl==='personal'?now+1000:Date.parse(metadata.expiresAt);
 if(ttl==='personal'){metadata.personalConsent.expiresAt=new Date(expires).toISOString();d.state.rows.set(metadataKey,JSON.stringify(metadata));}
 const connect=d.getConnection;d.getConnection=async()=>{const c=await connect();if(stage==='connection')current=expires;let transaction=0;const begin=c.beginTransaction,q=c.query,commit=c.commit;
 c.beginTransaction=async()=>{transaction++;return begin();};
 c.query=async(sql,args)=>{const result=await q(sql,args);if(sql.startsWith('SELECT public_id') && ((stage==='first-lock' && transaction===1)||(stage==='second-lock' && transaction===2)))current=expires;return result;};
 c.commit=async()=>{await commit();if(stage==='claim-commit' && transaction===1)current=expires;};return c;};
 const count=localProviderStats.calls,clock=()=>{calls++;if(stage==='pre-provider' && calls===6)current=expires;return current;};
 let result;try{result=await simulatedWorker(d,user,request(pending,'run'),{configuration,clock});}catch(e){assert.ok(['WORKER_CONTEXT_CHANGED','WORKER_AUTHORIZATION_CHANGED'].includes(e.code));}
 assert.equal(localProviderStats.calls,count,stage+'/'+ttl+' must not invoke expired authorization');if(result)assert.equal(result.eligible,false);
}
for(const stage of ['claim-commit','second-lock','pre-provider']) {
 const d=await seed(),pending=await ready(d);let current=now,calls=0;const connect=d.getConnection;
 d.getConnection=async()=>{const c=await connect(),begin=c.beginTransaction,q=c.query,commit=c.commit;let transaction=0;c.beginTransaction=async()=>{transaction++;return begin();};c.query=async(sql,args)=>{const result=await q(sql,args);if(stage==='second-lock' && transaction===2 && sql.startsWith('SELECT public_id'))current=now+WORKER_CUTOFF_MS;return result;};c.commit=async()=>{await commit();if(stage==='claim-commit' && transaction===1)current=now+WORKER_CUTOFF_MS;};return c;};
 const count=localProviderStats.calls,result=await simulatedWorker(d,user,request(pending,'run'),{configuration,clock:()=>{calls++;if(stage==='pre-provider' && calls===6)current=now+WORKER_CUTOFF_MS;return current;}});assert.equal(result.phase,'uncertain');assert.equal(localProviderStats.calls,count,'expired claim '+stage+' is never invoked');
}
// Exact independent-review repro, using the default production Date.now clock.
const repro=await seed(),rp=await ready(repro),rk=sourceJobStateKey(user,[...repro.state.jobs.values()][0].job_key),rm=JSON.parse(repro.state.rows.get(rk));rm.personalConsent.expiresAt=new Date(now+1000).toISOString();repro.state.rows.set(rk,JSON.stringify(rm));const rc=repro.getConnection;let current=now;repro.getConnection=async()=>{const c=await rc(),commit=c.commit;let commits=0;c.commit=async()=>{await commit();if(++commits===1)current=now+2000;};return c;};const originalDateNow=Date.now,count=localProviderStats.calls;try{Date.now=()=>current;const result=await simulatedWorker(repro,user,request(rp,'run'),{configuration});assert.equal(result.eligible,false);assert.equal(result.phase,'cancelled');assert.equal(localProviderStats.calls,count);}finally{Date.now=originalDateNow;}
console.log('PASS fresh clock: source/personal TTL during connection and first/second locks, claim commit and immediate provider gate; cutoff expiry prevents invocation; independent-review Date.now repro fixed');
// Double failures and lost commit ACKs must preserve original failure and
// report persisted/unknown cutoff honestly through the actual HTTP handler.
for(const fault of ['before-claim','after-provider-save','claim-ack','result-ack']) {
 const d=await seed(),pending=await ready(d),connect=d.getConnection;let faultEnabled=true;
 d.getConnection=async()=>{const c=await connect(),q=c.query,commit=c.commit,rollback=c.rollback;let commits=0;
 const original=()=>Object.assign(new Error('synthetic original audit/commit failure'),{code:'SYNTHETIC_ORIGINAL',status:503});
 c.query=async(sql,args)=>{if(faultEnabled && sql.startsWith('INSERT INTO crewcheck_telegram_state')){const phase=JSON.parse(args[1]).worker?.phase;if((fault==='before-claim' && phase==='dispatching')||(fault==='after-provider-save' && phase==='accepted_unconfirmed'))throw original();}return q(sql,args);};
 c.commit=async()=>{commits++;await commit();if(faultEnabled && ((fault==='claim-ack' && commits===1)||(fault==='result-ack' && commits===2)))throw original();};
 c.rollback=async()=>{if(faultEnabled)throw Error('synthetic connection lost during rollback');return rollback();};return c;};
 const server=http.createServer((req,res)=>handleSimulatedWorker(req,res,{identity:r=>r.headers.authorization==='Bearer synthetic-only'?user:null,dbPool:async()=>d,configuration,clock:()=>now,readJson:async r=>{let raw='';for await(const b of r)raw+=b;return JSON.parse(raw);},sendJson:(r,status,value)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(value));}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const before=localProviderStats.calls;
 try{const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},body:JSON.stringify(request(pending,'run'))}),body=await response.json();assert.equal(response.status,503);assert.equal(body.code,'SYNTHETIC_ORIGINAL');assert.equal(body.rollbackFailed,true);assert.equal(body.claimState,fault==='before-claim'?'not_started':fault==='claim-ack'?'unknown':'persisted');assert.equal(body.claimPersisted,fault==='before-claim'?false:fault==='claim-ack'?null:true);assert.equal(localProviderStats.calls-before,['after-provider-save','result-ack'].includes(fault)?1:0);
 }finally{await new Promise(r=>server.close(r));}
 faultEnabled=false;
 if(fault!=='before-claim'){const result=await simulatedWorker(d,user,request(pending,'run'),{...options,now:now+WORKER_CUTOFF_MS});assert.ok(['uncertain','accepted_unconfirmed'].includes(result.phase));assert.equal(localProviderStats.calls-before,['after-provider-save','result-ack'].includes(fault)?1:0,'lost ACK/rollback cannot replay provider');}
}
console.log('PASS HTTP double failures: original error preserved through rollback failure; cutoff not_started/persisted/unknown with claim ACK lost; audit/result ACK failures after one invocation never replay');
const httpDb=await seed();let access=0;const server=http.createServer((req,res)=>handleSimulatedWorker(req,res,{identity:r=>r.headers.authorization==='Bearer synthetic-only'?user:null,dbPool:async()=>{access++;return httpDb;},readJson:async r=>{let text='';for await(const b of r)text+=b;return JSON.parse(text);},sendJson:(r,status,value)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(value));}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url='http://127.0.0.1:'+server.address().port,headers={authorization:'Bearer synthetic-only','content-type':'application/json'};assert.equal((await fetch(url)).status,401);assert.equal(access,0);const state=await(await fetch(url,{headers})).json();assert.equal(state.available,false);assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(request(state))})).status,403);}finally{await new Promise(r=>server.close(r));}
assert.doesNotMatch(fs.readFileSync('server/free-day-simulated-worker.mjs','utf8'),/fetch\(|setInterval\(|setTimeout\(|https:\/\/api|TELEGRAM_BOT_TOKEN|sendTelegram/);
console.log('PASS held → eligibility → persistent server worker → fixed local provider: exact owner/allowlist/consent, dual destination/groups, TTL/revoke/CAS/8-way dedupe, durable cutoff/crash/audit rollback and uncertain no replay; real queue held NULL, zero external sends');
