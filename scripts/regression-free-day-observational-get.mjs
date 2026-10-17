import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {personalConsent,PERSONAL_SCOPE} from '../server/free-day-personal-consent.mjs';
import {voluntarySources,SOURCE_SCOPE,sourceKey} from '../server/free-day-sources.mjs';
import {sourceQueue} from '../server/free-day-source-queue.mjs';
import {simulatedWorker,localProviderStats} from '../server/free-day-simulated-worker.mjs';
import {sourceJobStateKey} from '../server/free-day-source-job-state.mjs';
import {syntheticSourceDatabase} from './fixtures/free-day-source-db.mjs';
const user={email:'synthetic-observe@example.invalid',id:'synthetic-owner'},now=Date.parse('2026-10-10T12:00Z'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const receipt=clock=>({identityDigest:hash(['900001','BSB']),period:'2026-08',documentHash:hash(clock),starts:[12,13,14].map(d=>({date:`2026-08-${d}`,clock,offset:-180,literal:true}))});
const review={scope:SOURCE_SCOPE,action:'review',expectedRevision:0,before:receipt('01:46'),after:receipt('08:30'),sequenceDate:'2026-08-12',confirmed:true,consent:true};
const offer={now,configuration:{offerEnabled:true,ownerIds:[user.id]}};
const putLink=(db,chatId='9000012345')=>{const link={email:user.email,chatId,username:'synthetic_crew',linkedAt:'2026-10-01T12:00Z',code:'synthetic-only'};for(const key of [`link-email:${user.email}`,`link-chat:${chatId}`])db.state.rows.set(key,JSON.stringify(link));};
const seed=async()=>{const db=syntheticSourceDatabase();putLink(db);await voluntarySources(db,user,review,{now});const state=await personalConsent(db,user,null,offer);await personalConsent(db,user,{scope:PERSONAL_SCOPE,action:'grant',context:state.context,expectedRevision:state.revision,confirmed:true,textVersion:state.textVersion},offer);return db;};
const snapshot=db=>JSON.stringify({rows:[...db.state.rows],jobs:[...db.state.jobs]});
for(const scenario of ['expired-source','expired-personal','missing-reverse','rotated','pending','processing','cancelled','uncertain','sent','flags-off']) {
 const db=await seed(),job=[...db.state.jobs.values()][0],metadata=sourceJobStateKey(user,job.job_key);let time=now;
 if(scenario==='expired-source')time=now+31*86400000;
 if(scenario==='expired-personal'){const row=JSON.parse(db.state.rows.get(metadata));row.personalConsent.expiresAt=new Date(now).toISOString();db.state.rows.set(metadata,JSON.stringify(row));}
 if(scenario==='missing-reverse')db.state.rows.delete('link-chat:9000012345');
 if(scenario==='rotated')putLink(db,'9000098765');
 if(['pending','processing','cancelled','uncertain','sent'].includes(scenario))job.status=scenario;
 const before=snapshot(db),connect=db.getConnection;let writes=0;db.getConnection=async()=>{const c=await connect(),q=c.query;c.query=async(sql,args)=>{if(/^(INSERT|UPDATE|DELETE)/.test(sql)){writes++;throw Error('GET attempted mutation');}return q(sql,args);};return c;};
 const personal=await personalConsent(db,user,null,{now:time}),sources=await voluntarySources(db,user,null,{now:time}),queue=await sourceQueue(db,user,null,{now:time}),worker=await simulatedWorker(db,user,null,{now:time});
 assert.equal(writes,0,scenario);assert.equal(snapshot(db),before,scenario+' all four GETs preserve every row/job/receipt/consent');assert.equal(personal.available,false);
 if(!['flags-off'].includes(scenario))assert.equal(personal.consent,false);
 if(['expired-source','missing-reverse','rotated','pending','processing','cancelled','uncertain','sent'].includes(scenario)){assert.equal(queue.eligible,false);assert.equal(worker.eligible,false);}
 if(scenario==='expired-source'){assert.equal(sources.consent,false);assert.equal(sources.review,null);}
 db.getConnection=connect;
 if(['expired-source','missing-reverse','rotated','pending','processing','cancelled','uncertain','sent'].includes(scenario)){
  await assert.rejects(personalConsent(db,user,{scope:PERSONAL_SCOPE,action:'grant',context:personal.context,expectedRevision:personal.revision,confirmed:true,textVersion:personal.textVersion},offer),{code:'CONSENT_CONTEXT_CHANGED'});assert.equal(snapshot(db),before,'rejected grant preserves '+scenario);
 }
}
// Exact transient reverse-link repro: reads must not produce a terminal tombstone.
const transient=await seed(),key=[...transient.state.jobs.keys()][0],reverse=transient.state.rows.get('link-chat:9000012345');transient.state.rows.delete('link-chat:9000012345');const before=snapshot(transient);
await personalConsent(transient,user,null,{now});await sourceQueue(transient,user,null,{now});await voluntarySources(transient,user,null,{now});assert.equal(snapshot(transient),before);transient.state.rows.set('link-chat:9000012345',reverse);
assert.equal((await sourceQueue(transient,user,null,{now})).job.status,'held');assert.equal((await personalConsent(transient,user,null,offer)).consent,true);assert.equal(transient.state.jobs.get(key).status,'held');
// Explicit source revoke is separately authenticated/CAS-scoped and may clean up.
const expired=await seed(),original=snapshot(expired);await assert.rejects(voluntarySources(expired,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:0},{now:now+31*86400000}),{code:'SOURCE_REVISION_CHANGED'});assert.equal(snapshot(expired),original);
await voluntarySources(expired,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1},{now:now+31*86400000});assert.equal([...expired.state.jobs.values()][0].status,'cancelled');assert.ok(!expired.state.rows.get(sourceKey(user)).includes('documentHash'));assert.equal(expired.state.rows.has(sourceJobStateKey(user,[...expired.state.jobs.keys()][0])),false);
// Existing terminal tombstones are never resurrected after repairing the link.
transient.state.jobs.get(key).status='cancelled';const terminal=snapshot(transient);await personalConsent(transient,user,null,offer);await sourceQueue(transient,user,null,{now});assert.equal(snapshot(transient),terminal);assert.equal(transient.state.jobs.get(key).status,'cancelled');assert.equal(localProviderStats.calls,0);
console.log('PASS observational GET: integral rows/jobs preserved, zero INSERT/UPDATE/DELETE for TTL/link drift/terminal/OFF; rejected grant and stale revoke preserve data; transient reverse-link repair retains held job/personal consent; explicit CAS revoke removes; no resurrection/provider');
