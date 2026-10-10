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
const httpDb=await seed();let access=0;const server=http.createServer((req,res)=>handleSimulatedWorker(req,res,{identity:r=>r.headers.authorization==='Bearer synthetic-only'?user:null,dbPool:async()=>{access++;return httpDb;},readJson:async r=>{let text='';for await(const b of r)text+=b;return JSON.parse(text);},sendJson:(r,status,value)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(value));}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url='http://127.0.0.1:'+server.address().port,headers={authorization:'Bearer synthetic-only','content-type':'application/json'};assert.equal((await fetch(url)).status,401);assert.equal(access,0);const state=await(await fetch(url,{headers})).json();assert.equal(state.available,false);assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(request(state))})).status,403);}finally{await new Promise(r=>server.close(r));}
assert.doesNotMatch(fs.readFileSync('server/free-day-simulated-worker.mjs','utf8'),/fetch\(|setInterval\(|setTimeout\(|https:\/\/api|TELEGRAM_BOT_TOKEN|sendTelegram/);
console.log('PASS held → eligibility → persistent server worker → fixed local provider: exact owner/allowlist/consent, dual destination/groups, TTL/revoke/CAS/8-way dedupe, durable cutoff/crash/audit rollback and uncertain no replay; real queue held NULL, zero external sends');
