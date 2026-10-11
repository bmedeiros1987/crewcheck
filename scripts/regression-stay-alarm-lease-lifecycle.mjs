import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifiedStayLease} from '../shared/stay-alarm-lease-policy.mjs';
import {attachStayAlarmLifecycle,STAY_AUTHORITY_INVALIDATIONS} from '../shared/stay-alarm-lifecycle.mjs';
test('server verified expiry bounds an overnight lease without extending the credential',()=>{
 const serverNow=Date.parse('2030-10-11T00:00:00Z');
 const short=verifiedStayLease({serverNow,exp:(serverNow+8*3600000)/1000});
 assert.equal(short.stayLeaseExpiresAt,serverNow+8*3600000);assert.equal(short.sessionExpiresAt,short.stayLeaseExpiresAt);
 const long=verifiedStayLease({serverNow,exp:(serverNow+30*86400000)/1000});assert.equal(long.stayLeaseExpiresAt,serverNow+18*3600000);
});
test('missing expired or malformed verified expiry never grants authority',()=>{
 const serverNow=Date.parse('2030-10-11T00:00:00Z');
 for(const exp of [undefined,null,'2030',NaN,Infinity,1.1,0,-1,serverNow/1000])assert.equal(verifiedStayLease({serverNow,exp}),null);
 assert.equal(verifiedStayLease({serverNow,exp:serverNow/1000+10,horizonMillis:19*3600000}),null);
});
test('app lifecycle revokes for every known roster/APZ mutation without an editor',()=>{
 const target=new EventTarget();let revoked=0,rearmed=0;
 const detach=attachStayAlarmLifecycle(target,{revoke:async()=>{revoked++;},authenticate:()=>{rearmed++;}});
 for(const name of STAY_AUTHORITY_INVALIDATIONS)target.dispatchEvent(new Event(name));
 assert.equal(revoked,STAY_AUTHORITY_INVALIDATIONS.length);assert.equal(rearmed,0);
 detach();target.dispatchEvent(new Event('crewcheck:roster-updated'));assert.equal(revoked,STAY_AUTHORITY_INVALIDATIONS.length);
});
test('actual app startup loads lifecycle and server me derives proof only from verified payload',()=>{
 assert.match(fs.readFileSync('client/src/main.tsx','utf8'),/import '.\/lib\/stayAlarmHost'/);
 const source=fs.readFileSync('server/v139/auth.mjs','utf8'),me=source.slice(source.indexOf('async function me('));
 assert.ok(me.indexOf('verifyJwt(requestToken(req))')<me.indexOf('stayAlarmLease: verifiedStayLease({ exp: payload.exp })'));
 assert.match(fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmHostAndroid.java','utf8'),/PREPARED_OVERNIGHT_LEASE_ENABLED=false/);
});
test('runtime uses trusted native remaining lease and rejects over-limit duration',async()=>{
 const {createStayHostRuntime}=await import('../shared/stay-alarm-host-runtime.mjs');
 for(const remaining of [8*3600000,19*3600000]){
  const target=new EventTarget(),messages=[],durations=[];
  target.postMessage=raw=>messages.push(JSON.parse(raw));
  const runtime=createStayHostRuntime({port:target,readAccount:()=> 'verified',readToken:()=> 'candidate',setTimer:(fn,duration)=>{durations.push(duration);return durations.length;},clearTimer:()=>{}});
  const promise=runtime.authenticate();
  const payload=JSON.stringify({protocol:'crewcheck-stay-alarm-v1',ownerId:'verified',ownerEpoch:'native-epoch',featureEnabled:true,atomicReplace:true,acknowledgedCancel:true,permissionGranted:true,leaseRemainingMillis:remaining});
  const response=new Event('message');response.data=JSON.stringify({id:messages[0].id,state:'verified',payload});target.dispatchEvent(response);
  assert.equal(await promise,remaining===8*3600000);assert.equal(runtime.ready(),remaining===8*3600000);
  if(remaining===8*3600000)assert.equal(durations.at(-1),remaining);
  else {assert.equal(messages.at(-1).action,'revoke');const revoked=new Event('message');revoked.data=JSON.stringify({id:messages.at(-1).id,state:'revoked',payload:null});target.dispatchEvent(revoked);}
 }
});
test('roster replacement revokes actual runtime readiness with no editor mounted',async()=>{
 const {createStayHostRuntime}=await import('../shared/stay-alarm-host-runtime.mjs');
 const target=new EventTarget(),messages=[];target.postMessage=raw=>messages.push(JSON.parse(raw));
 const runtime=createStayHostRuntime({port:target,readAccount:()=> 'verified',readToken:()=> 'candidate',setTimer:()=>1,clearTimer:()=>{}});
 const promise=runtime.authenticate(),event=new Event('message');event.data=JSON.stringify({id:messages[0].id,state:'verified',payload:JSON.stringify({protocol:'crewcheck-stay-alarm-v1',ownerId:'verified',ownerEpoch:'native-epoch',featureEnabled:true,atomicReplace:true,acknowledgedCancel:true,leaseRemainingMillis:8*3600000})});target.dispatchEvent(event);
 assert.equal(await promise,true);attachStayAlarmLifecycle(target,runtime);
 target.dispatchEvent(new Event('crewcheck:roster-updated'));assert.equal(runtime.ready(),false);assert.equal(messages.at(-1).action,'revoke');
 const ack=new Event('message');ack.data=JSON.stringify({id:messages.at(-1).id,state:'revoked',payload:null});target.dispatchEvent(ack);
 assert.equal(messages.filter(value=>value.action==='authenticate').length,1);
});
