import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import {SOURCE_SCOPE,sourceKey,validateReceipt,compareSources,voluntarySources,handleVoluntarySources} from '../server/free-day-sources.mjs';
import {notificationStateDeletionStatements} from '../server/v139/notificationStateDeletion.mjs';
const user={email:'synthetic-source@example.invalid',id:'synthetic-owner'};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identityDigest=hash(['900001','BSB']);
const receipt=(clock,documentHash=hash(clock))=>({identityDigest,period:'2026-08',documentHash,starts:[12,13,14].map(d=>({date:`2026-08-${d}`,clock,offset:-180,literal:true}))});
const body=(revision=0,extra={})=>({scope:SOURCE_SCOPE,action:'review',expectedRevision:revision,before:receipt('01:46'),after:receipt('08:30'),sequenceDate:'2026-08-12',confirmed:true,consent:true,...extra});
import {syntheticSourceDatabase} from './fixtures/free-day-source-db.mjs';

const db=syntheticSourceDatabase();
const first=await voluntarySources(db,user,body());assert.equal(first.review.delayMinutes,404);assert.equal(first.review.possibleAmount,null);assert.equal(first.officialVerified,false);assert.equal(first.dispatchAllowed,false);assert.equal(first.delivered,false);assert.equal(first.linkVerified,false);
assert.equal(first.review.sourceStatus,'user-confirmed-declaration');assert.equal(first.review.before.origin,'voluntary-upload-declared');
assert.equal((await voluntarySources(db,user,body(1))).duplicate,true);assert.equal(db.state.rows.size,1);
// Monthly sync overwrites the current roster; receipts retain the exact prior versions.
db.state.roster={crewId:'900001',base:'BSB',days:[]};assert.equal((await voluntarySources(db,user)).review.before.starts[0].clock,'01:46');
await assert.rejects(voluntarySources(db,user,body(1,{officialVerified:true})),{code:'CLIENT_AUTHORITY_REJECTED'});
await assert.rejects(voluntarySources(db,user,body(1,{before:{...receipt('01:46'),rawText:'forbidden'}})),{code:'SOURCE_IDENTITY_PENDING'});
await assert.rejects(voluntarySources(db,user,body(1,{consent:false})),{code:'SPECIFIC_CONFIRMATION_REQUIRED'});
await assert.rejects(voluntarySources(db,user,body(1,{confirmed:false})),{code:'SPECIFIC_CONFIRMATION_REQUIRED'});
await assert.rejects(voluntarySources(db,user,body(0)),{code:'SOURCE_REVISION_CHANGED'});
await assert.rejects(voluntarySources(db,user,body(1,{before:{...receipt('01:46'),identityDigest:hash(['900002','BSB'])}})),{code:'SOURCE_IDENTITY_PENDING'});
assert.throws(()=>validateReceipt({...receipt('01:46'),starts:[{date:'2026-02-31',clock:'01:46',offset:-180,literal:true}]},identityDigest),{code:'SOURCE_DATE_PENDING'});
assert.throws(()=>validateReceipt({...receipt('01:46'),starts:[...receipt('01:46').starts,receipt('01:46').starts[0]]},identityDigest),{code:'DUPLICATE_SOURCE_DATE'});
const pending=receipt(null);assert.equal(compareSources(validateReceipt(pending,identityDigest),validateReceipt(receipt('08:30'),identityDigest),'2026-08-12').reason,'LITERAL_START_PENDING');
const shifted=receipt('08:30');shifted.starts.unshift({date:'2026-08-11',clock:'08:30',offset:-180,literal:true});assert.equal(compareSources(validateReceipt(receipt('01:46'),identityDigest),validateReceipt(shifted,identityDigest),'2026-08-12').reason,'SEQUENCE_CORRESPONDENCE_PENDING');
const identical=receipt('08:30');assert.equal(compareSources(validateReceipt(identical,identityDigest),validateReceipt(identical,identityDigest),'2026-08-12').reason,'DISTINCT_VERSIONS_REQUIRED');
const beforeZone=receipt('01:46');beforeZone.starts[0].offset=-120;assert.equal(compareSources(validateReceipt(beforeZone,identityDigest),validateReceipt(receipt('08:30'),identityDigest),'2026-08-12').delayMinutes,464);
const expired=await voluntarySources(db,user,null,{now:Date.parse(first.expiresAt)+1});assert.equal(expired.review,null);assert.equal(expired.consent,false);assert.ok(db.state.rows.get(sourceKey(user)).includes('documentHash'),'expiry GET preserves stored receipts');
await voluntarySources(db,user,body(expired.revision),{now:Date.parse(first.expiresAt)+1});await voluntarySources(db,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:expired.revision+1});assert.ok(!db.state.rows.get(sourceKey(user)).includes('documentHash'));
// Expiry alone never changes persisted CAS or data; stale mutations cannot
// perform cleanup. Current explicit revocation is independently scoped.
const ttlDb=syntheticSourceDatabase(),initial=await voluntarySources(ttlDb,user,body()),expiredNow=Date.parse(initial.expiresAt)+1;
const beforeExpired=JSON.stringify([...ttlDb.state.rows]);
await assert.rejects(voluntarySources(ttlDb,user,body(0),{now:expiredNow}),{code:'SOURCE_REVISION_CHANGED'});
await assert.rejects(voluntarySources(ttlDb,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:0},{now:expiredNow}),{code:'SOURCE_REVISION_CHANGED'});
assert.equal(JSON.stringify([...ttlDb.state.rows]),beforeExpired);
const revokedExpired=await voluntarySources(ttlDb,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1},{now:expiredNow});assert.equal(revokedExpired.revision,2);assert.equal(revokedExpired.consent,false);assert.equal(revokedExpired.review,null);
assert.ok(!ttlDb.state.rows.get(sourceKey(user)).includes('documentHash'));
await voluntarySources(ttlDb,user,body(2),{now:expiredNow});
await assert.rejects(voluntarySources(ttlDb,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1},{now:expiredNow}),{code:'SOURCE_REVISION_CHANGED'});
assert.equal((await voluntarySources(ttlDb,user,null,{now:expiredNow})).consent,true);
const recreated=syntheticSourceDatabase();recreated.state.owner='new-account';await assert.rejects(voluntarySources(recreated,user,body()),{code:'OWNER_CHANGED'});
assert.equal((await voluntarySources(db,{email:'other@example.invalid',id:user.id})).review,null,'owner-key isolation');
const concurrent=syntheticSourceDatabase();const results=await Promise.allSettled(Array.from({length:8},()=>voluntarySources(concurrent,user,body())));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.state.rows.size,1);
const race=await Promise.allSettled([voluntarySources(concurrent,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1}),voluntarySources(concurrent,user,body(1))]);assert.equal(race[0].status,'fulfilled');assert.equal(race[1].status,'rejected');assert.equal((await voluntarySources(concurrent,user)).review,null);
const broken=syntheticSourceDatabase(),original=broken.getConnection;broken.getConnection=async()=>{const c=await original();const query=c.query;c.query=async(s,a)=>{if(s.startsWith('INSERT'))throw Error('synthetic rollback');return query(s,a);};return c;};await assert.rejects(voluntarySources(broken,user,body()));assert.equal(broken.state.rows.size,0);
const httpDb=syntheticSourceDatabase();let access=0;
const server=http.createServer((req,res)=>handleVoluntarySources(req,res,{identity:r=>r.headers.authorization==='Bearer synthetic-only'?user:null,dbPool:async()=>{access++;return httpDb;},readJson:async r=>{let text='';for await(const chunk of r)text+=chunk;return JSON.parse(text);},sendJson:(r,status,data)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(data));}}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));try {
 const url=`http://127.0.0.1:${server.address().port}/api/notifications/free-day-sources`;
 assert.equal((await fetch(url)).status,401);assert.equal(access,0);
 const headers={authorization:'Bearer synthetic-only','content-type':'application/json'};
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body())});assert.equal(response.status,200);assert.equal((await response.json()).review.delayMinutes,404);
 assert.equal((await (await fetch(url,{headers})).json()).review.state,'simulated-delay');
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1})})).status,200);
 assert.equal((await (await fetch(url,{headers})).json()).review,null);
}finally{await new Promise(r=>server.close(r));}
assert.match(notificationStateDeletionStatements(user.email)[1][0],/notification-free-day-sources:%/);
assert.doesNotMatch(fs.readFileSync('server/free-day-sources.mjs','utf8'),/fetch\(|setInterval\(|setTimeout\(|sendTelegram|TELEGRAM_BOT_TOKEN|notification_jobs/);
console.log('PASS voluntary sources: HTTP401/review404min/revoke, minimal data, account/recreation isolation, both boundaries, literal/date/timezone pendencies, consent CAS/races/rollback, monthly overwrite, observational expiry and explicit deletion and zero queue/provider');
