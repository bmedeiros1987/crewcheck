import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {readPlatformEntitlement,readLockedPlatformEntitlement,withPlatformEntitlements} from '../server/platform-entitlement.mjs';
// Frozen current-main original function is test input, not a second production resolver.
const source=fs.readFileSync(new URL('./fixtures/subscription-status-main561e3a05.txt',import.meta.url),'utf8');
const now=Date.parse('2026-10-25T16:00:00Z');
let count=0;
for(const trust of [false,true])for(const profilePlan of ['free','premium_monthly','premium_annual','premium_unlimited','unknown'])for(const status of [null,'active','trialing','grace_period','pending','canceled'])for(const plan of ['free','premium_monthly','premium_annual','premium_unlimited','unknown'])for(const period of [null,new Date(now-1).toISOString(),new Date(now+1).toISOString(),'invalid']){
 const profile={email:'owner@example.test',plan:profilePlan,public_id:'OWNER',timezone:'UTC'};
 const subscription=status?{email:profile.email,plan,status,current_period_end:period,provider:'synthetic',cancel_at_period_end:1}:null;
 const db={async query(sql){return {rows:sql.includes('subscriptions')?(subscription?[subscription]:[]):[{used:7}]};}};
 const sandbox={Date:class extends Date{static now(){return now;}},PLAN_IDS:new Set(['free','premium_monthly','premium_annual','premium_unlimited']),env:()=>String(trust),currentMonthKey:()=> '2026-10',planLimit:()=>20};
 const originalFn=vm.runInNewContext(source+';subscriptionStatus',sandbox);
 const {usage,...expected}=await originalFn(db,profile);
 const actual=await readPlatformEntitlement(db,profile,{trustLegacyPremiumProfile:trust,now});
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));count++;
}
const queries=[];
const profile={email:'owner@example.test',public_id:'OWNER',plan:'free'};
const client={async query(sql,params){queries.push([sql,params]);return {rows:sql.includes('profiles')?[profile]:[]};}};
assert.equal((await readLockedPlatformEntitlement(client,{email:profile.email,expectedPublicId:'OWNER',now})).billing.premiumAccess,false);
assert(queries.every(([sql])=>sql.endsWith('FOR UPDATE')));
assert.deepEqual(queries.map(([,params])=>params),[[profile.email],[profile.email]]);
await assert.rejects(readLockedPlatformEntitlement(client,{email:profile.email,expectedPublicId:'STALE'}),{code:'ENTITLEMENT_OWNER_MISMATCH'});
await assert.rejects(readLockedPlatformEntitlement(client,{email:profile.email}),{code:'ENTITLEMENT_OWNER_REQUIRED'});
console.log(`PASS ${count} differential canonical entitlement cases + locked SQL/identity contracts; not MySQL gap proof`);

const composedQueries=[];let clock=100,connections=0;
const originalNow=Date.now;
const owners=[{email:'z@example.test',expectedPublicId:'Z'},{email:'a@example.test',expectedPublicId:'A'}];
const transaction={async query(sql,params){
 composedQueries.push([sql,params]);
 const owner=owners.find(owner=>owner.email===params?.[0]);
 if(sql.includes('profiles'))return {rows:owner?[{email:owner.email,public_id:owner.expectedPublicId,plan:'free'}]:[]};
 if(sql.includes('subscriptions'))return {rows:[{email:owner.email,plan:'premium_monthly',status:'active',current_period_end:new Date(150).toISOString()}]};
 return {rows:[]};
},release(){composedQueries.push(['release']);}};
try{
 Date.now=()=>clock;
 const value=await withPlatformEntitlements({async connect(){connections++;return transaction;}},owners,async(client,states,refresh)=>{
  assert.equal(client,transaction);assert.deepEqual([...states.keys()],['a@example.test','z@example.test']);
  assert.equal(states.get('a@example.test').billing.premiumAccess,true);clock=200;
  assert.equal((await refresh()).get('a@example.test').billing.premiumAccess,false,'refresh observes expiry on same locked rows');
  return 'committed';
 });
 assert.equal(value,'committed');assert.equal(connections,1);
 assert.equal(composedQueries[0][0],'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 assert.equal(composedQueries[1][0],'BEGIN');assert.equal(composedQueries[2][1][0],'a@example.test');assert.equal(composedQueries[3][1][0],'z@example.test');
 assert.equal(composedQueries.at(-2)[0],'COMMIT');assert.equal(composedQueries.at(-1)[0],'release');
 await assert.rejects(withPlatformEntitlements({},[{email:'a@example.test'}],()=>{}),{code:'ENTITLEMENT_OWNER_REQUIRED'});
 await assert.rejects(withPlatformEntitlements({},[owners[0],owners[0]],()=>{}),{status:400});
}finally{Date.now=originalNow;}
console.log('PASS composed same-client/RR/sorted-owner/current-expiry-refresh/invalid-owner boundary');
