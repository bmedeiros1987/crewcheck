import {fixture as productionFixture,sender,secrets} from './fixtures/infobip-production-sql.mjs';
import {createInfobipSqlStore} from '../server/infobip-whatsapp-store.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
import {eraseWhatsAppAccountState,installWhatsAppLifecycle} from '../server/whatsapp-lifecycle.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {linkIdentityFixture,schemaIndexes,schemaResult} from './fixtures/whatsapp-link-identity-sql.mjs';
import {assertCanonicalWhatsAppStorage} from '../server/infobip-whatsapp-preflight.mjs';
import {startCanonicalWhatsAppChallenge,completeCanonicalWhatsAppLink,lockCanonicalWhatsAppOwner,canonicalWhatsAppChallengeKey,clearCanonicalWhatsAppChallenge} from '../server/whatsapp-link-proof.mjs';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_NETWORK');
const a='a@synthetic.invalid',b='b@synthetic.invalid';
const f=linkIdentityFixture();f.state.owners.set(a,'owner-a');f.state.owners.set(b,'owner-b');
const start=(email,codeHash,publicId=f.state.owners.get(email))=>f.transaction(c=>startCanonicalWhatsAppChallenge(c,{email,publicId,codeHash}));
const proof=(codeHash,phone='12025550101')=>f.transaction(c=>completeCanonicalWhatsAppLink(c,{codeHash,phone,phoneHash:'synthetic-hash-'+phone,phoneCipher:'synthetic-cipher'}));
await assert.rejects(start(a,'stale-auth','deleted-owner'));assert.equal(f.state.pending.size,0);
await start(a,'one');f.state.owners.set(a,'recreated-owner');assert.equal((await proof('one')).linked,false);assert.equal(f.state.links.size,0);
f.state.owners.set(a,'owner-a');f.state.fences.clear();assert.equal((await proof('one')).linked,false,'legacy pending challenge fails closed');
await start(a,'one');await start(a,'two');assert.equal((await proof('one')).linked,false);assert.equal((await proof('two')).linked,true);assert.equal(f.state.fences.size,0);
await start(b,'three');assert.equal((await proof('three')).conflict,true);assert.equal(f.state.links.get(a).phone_hash,'synthetic-hash-12025550101');
await start(a,'four');const old=structuredClone(f.state.links.get(a));f.state.failWrite=true;await assert.rejects(proof('four','12025550102'));assert.deepEqual(f.state.links.get(a),old);assert(f.state.pending.has(a));f.state.failWrite=false;
f.state.expireAfterWrite=true;await assert.rejects(proof('four','12025550102'));assert.deepEqual(f.state.links.get(a),old);assert(f.state.pending.has(a));f.state.expireAfterWrite=false;
for(const corruption of ['wrong-owner','wrong-phone','revoked','duplicate','empty']){
 f.state.corruptRead=corruption;await assert.rejects(proof('four','12025550102'));assert.deepEqual(f.state.links.get(a),old);assert(f.state.pending.has(a));
}
f.state.corruptRead=false;
f.state.lostAck=true;await assert.rejects(proof('four','12025550102'));assert.equal((await proof('four','12025550102')).linked,false);assert.equal(f.state.links.size,1);assert.equal(f.state.links.get(a).phone_hash,'synthetic-hash-12025550102');
await start(a,'five');const race=await Promise.all([proof('five','12025550103'),proof('five','12025550104')]);assert.equal(race.filter(x=>x.linked).length,1);assert.equal(f.state.links.size,1);
await start(a,'six');await start(b,'seven');const owners=await Promise.all([proof('six','12025550105'),proof('seven','12025550105')]);assert.equal(owners.filter(x=>x.linked).length,1);assert.equal([...f.state.links.values()].filter(x=>x.phone_hash==='synthetic-hash-12025550105').length,1);
for(const invalid of [null,'0000-00-00 00:00:00.000','9999-12-31 23:59:59.999','2032-02-30 00:00:00.000']){
 await start(a,'bad-generation');const valid=structuredClone(f.state.links.get(a));f.state.links.set(a,{...valid,linked_at:invalid});
 const before=structuredClone(f.state.links.get(a));await assert.rejects(proof('bad-generation','12025550106'));assert.deepEqual(f.state.links.get(a),before);assert(f.state.pending.has(a));f.state.links.set(a,valid);
}
await start(a,'eight');await f.transaction(c=>clearCanonicalWhatsAppChallenge(c,'owner-a'));assert.equal((await proof('eight')).linked,false);
for(const missing of schemaIndexes){const indexes=schemaIndexes.filter(x=>x!==missing);await assert.rejects(assertCanonicalWhatsAppStorage({query:async sql=>schemaResult(sql,{indexes})}));}
for(const alteration of [r=>({...r,non_unique:1}),r=>({...r,sub_part:8})]){
 const indexes=schemaIndexes.map((r,i)=>i===0?alteration(r):r);await assert.rejects(assertCanonicalWhatsAppStorage({query:async sql=>schemaResult(sql,{indexes})}));
}
const composite=[...schemaIndexes,{...schemaIndexes[0],column_name:'payload',sequence_no:2}];await assert.rejects(assertCanonicalWhatsAppStorage({query:async sql=>schemaResult(sql,{indexes:composite})}));
const source=fs.readFileSync(new URL('../server/whatsapp.mjs',import.meta.url),'utf8');assert(!source.includes('requireIdentity('));assert.equal((source.match(/requireExistingIdentity\(req, res\)/g)||[]).length,3);
assert(f.state.queries.every(sql=>!/credit|reserve|admission|quota/i.test(sql)),'linking cannot mint or reset credit');
assert.equal(f.state.fences.has(canonicalWhatsAppChallengeKey('owner-a')),false);
// Exercise the existing authentication helper, not a replacement auth stub.
const common=fs.readFileSync(new URL('../server/v139/common.mjs',import.meta.url),'utf8');
const existingStart=common.indexOf('export async function requireExistingIdentity(');
const existingSource=common.slice(existingStart,common.indexOf('\n}',existingStart)+2).replace('export ','');
let authOwner='owner-a',authReads=0;
const existingIdentity=new Function('verifyJwt','requestToken','dbPool','safeEmail','sendJson','isAdminEmail',`return (${existingSource});`)(
 req=>req,req=>req.token,async()=>({query:async()=>{authReads++;return [[authOwner?{email:a,public_id:authOwner}:null].filter(Boolean)];}}),v=>v,
 (_res,status,payload)=>({status,payload}),()=>false);
assert.equal((await existingIdentity({token:{email:a,sub:'owner-a'}},{})).profile.public_id,'owner-a');
authOwner='recreated';assert.equal(await existingIdentity({token:{email:a,sub:'owner-a'}},{}),null);
authOwner=null;assert.equal(await existingIdentity({token:{email:a,sub:'owner-a'}},{}),null);assert.equal(authReads,3);
// OFF and installed lifecycle paths erase only the current opaque fence through
// the supplied deletion client. No new pool, commit or migration is introduced.
for(const installed of [false,true]) {
 const keys=new Set([canonicalWhatsAppChallengeKey('owner-a'),canonicalWhatsAppChallengeKey('other-owner')]);let callbacks=0;
 const uninstall=installed?installWhatsAppLifecycle(async()=>{callbacks++;return 'synthetic-erased';}):()=>{};
 const client={dialect:'mysql',discard:()=>assert.fail('no deadline in fixture'),async query(sql,args){
  if(sql.includes('information_schema.TABLES'))return {rows:['crewcheck_telegram_state','crewcheck_whatsapp_links','crewcheck_whatsapp_link_codes'].map(TABLE_NAME=>({TABLE_NAME}))};
  if(sql.startsWith('SELECT public_id'))return {rows:[{public_id:'owner-a'}]};
  if(sql.startsWith('SELECT state_key'))return {rows:[]};
  if(sql.startsWith('UPDATE crewcheck_whatsapp_links')||sql.startsWith('DELETE FROM crewcheck_whatsapp_link_codes'))return {rows:[]};
  if(sql.startsWith('DELETE FROM crewcheck_telegram_state')){keys.delete(args[0]);return {rows:[]};}
  assert.fail('Unexpected deletion SQL: '+sql);
 }};
 try{assert.equal(await eraseWhatsAppAccountState(a,{client}),installed?'synthetic-erased':undefined);assert.equal(keys.has(canonicalWhatsAppChallengeKey('owner-a')),false);assert.equal(keys.size,1);assert.equal(callbacks,installed?1:0);}finally{uninstall();}
}
// Absent metadata is not evidence of an absent table: actual DML must reject
// permissions/outages. Only 1146 for the exact optional target may be skipped.
for(const failure of ['missing','permission','outage','trigger-dependency']){
 let writes=0;
 const client={dialect:'mysql',discard:()=>assert.fail('no deadline in fixture'),async query(sql){
  if(sql.includes('information_schema.TABLES'))return {rows:[]}; // hidden/absent
  if(sql.startsWith('SELECT public_id'))return {rows:[{public_id:'owner-a'}]};
  if(/^UPDATE|^DELETE/.test(sql)){
   writes++;const target=sql.match(/(?:UPDATE|DELETE FROM) (\w+)/)[1];
   if(failure==='permission')throw Object.assign(Error('synthetic permission denied'),{code:'ER_TABLEACCESS_DENIED_ERROR',errno:1142});
   if(failure==='outage')throw Object.assign(Error('synthetic connection unavailable'),{code:'ECONNRESET'});
   throw Object.assign(Error('synthetic missing table'),{code:'ER_NO_SUCH_TABLE',errno:1146,sqlMessage:`Table 'synthetic.${failure==='missing'?target:'unrelated_trigger_dependency'}' doesn't exist`});
  }
  assert.fail('Unexpected optional-table SQL: '+sql);
 }};
 if(failure==='missing'){await eraseWhatsAppAccountState(a,{client});assert.equal(writes,3);}
 else{await assert.rejects(eraseWhatsAppAccountState(a,{client}));assert.equal(writes,1);}
}
// Reproduce the independently reviewed old-unlink/new-owner interleaving using
// the actual route, lifecycle and store. A delayed hook cannot widen authority.
const unlinkSource=source.slice(source.indexOf('async function handleUnlink('),source.indexOf('\nexport async function handleWhatsAppRoute'));
for(const phase of ['between-transactions','after-quiescence','stale-retry'])for(const installed of [false,true]){
 const {state,db}=productionFixture();const identity={db,email:state.link.email,profile:{public_id:state.owner}};
 const store=createInfobipSqlStore({db,sender,...secrets});let changed=false,writeStart=0;
 const recreate=()=>{state.owner='synthetic-recreated-owner';state.link={...state.link,revoked_at:null,consent_concierge:1};changed=true;writeStart=state.queries.length;};
 const uninstall=installed?installWhatsAppLifecycle(async(email,context)=>{if(phase==='after-quiescence'){await Promise.resolve();recreate();}return store.eraseAccount(email,context);}):()=>{};
 const budget=db=>async fn=>{const result=await createInfobipSqlBudget(db)(fn);if(phase==='between-transactions'||(!installed&&phase==='after-quiescence'))recreate();return result;};
 const unlink=new Function('requireExistingIdentity','sendJson','createInfobipSqlBudget','lockCanonicalWhatsAppOwner','clearCanonicalWhatsAppChallenge','eraseWhatsAppAccountState',`return (${unlinkSource});`)(
  async()=>identity,(_res,status,payload)=>({status,payload}),budget,lockCanonicalWhatsAppOwner,clearCanonicalWhatsAppChallenge,eraseWhatsAppAccountState);
 try{
  if(phase==='stale-retry')recreate();
  const result=await unlink({method:'POST'},{});assert(changed);assert.equal(result.status,503);assert.equal(state.link.revoked_at,null);assert.equal(state.link.consent_concierge,1);
  assert(!state.queries.slice(writeStart).some(sql=>/^\s*(UPDATE|INSERT|DELETE)/i.test(sql)),'stale continuation must reject before destructive SQL');
 }finally{uninstall();}
}
console.log('PASS synthetic link generation, swap rollback, exact-owner postwrite, missing-index deny, legacy deny, lost-ack replay and serialized competition; externalCalls=0; real MySQL concurrency still required.');
