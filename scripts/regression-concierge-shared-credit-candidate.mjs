import assert from 'node:assert/strict';
import {createSharedCreditCandidate,sharedCreditKey as key,boundedQuoteReservation,CONCIERGE_SHARED_CREDIT_SHIPPING} from '../server/concierge-shared-credit-candidate.mjs';
// Serializable transaction model only. No MySQL isolation/restart claim.
// External network, transport, credentials, schema and production bootstrap absent.
globalThis.fetch=()=>assert.fail('NETWORK_FORBIDDEN');
const at=Date.parse('2032-10-24T12:00:00Z'),programId='synthetic-credit-program';
const account='a'.repeat(64),other='b'.repeat(64),event=n=>n.toString(16).padStart(64,'0');
const quote=channel=>({channel,currency:'USD',country:'BR',sender:'12025550100',sourceId:'synthetic-quote-never-real-tariff',verifiedAt:at,category:'service-text',sessionUntil:at+60000,unitMicroUsd:9909,markupMicroUsd:2091,setupMicroUsd:0,...(channel==='voice'?{unitMicroUsd:30000,markupMicroUsd:10000,setupMicroUsd:5000,maxDurationSeconds:61,quantumSeconds:60}:{})});
const job=(n,channel='whatsapp')=>({accountKey:account,sender:'12025550100',recipient:'12025550101',bindingStamp:'synthetic-current-binding',eventKey:event(n),channel});
function fixture({balance=1000000,budget=20000000,spent=0}={}){
 const state=new Map();let tail=Promise.resolve(),failUpdate=0,lostAck=false,clockHook=()=>{},quoteOverride={};
 const grant=a=>state.set(key('account',[programId,a]),{v:1,kind:'account-credit',accountKey:a,availableMicroUsd:balance,reservedMicroUsd:0});
 grant(account);grant(other);
 const globalKey=key('global',[programId,'2032-10']);
 state.set(globalKey,{v:1,kind:'global-credit',period:'2032-10',budgetMicroUsd:budget,knownSpentMicroUsd:spent,reservedMicroUsd:0,reconciled:true,reconciledAt:at});
 const transaction=fn=>{
  const work=tail.then(async()=>{
   const next=structuredClone(state);let updates=0;
   const c={query:async(sql,args)=>{clockHook(sql,args);
    if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){if(!next.has(args[0]))next.set(args[0],JSON.parse(args[1]));return [{affectedRows:1}];}
    if(sql.startsWith('SELECT payload'))return [[...(next.has(args[0])?[{payload:JSON.stringify(next.get(args[0]))}]:[])]];
    if(sql.startsWith('UPDATE crewcheck_telegram_state')){
     if(++updates===failUpdate)throw Error('SYNTHETIC_ROLLBACK');
     if(!next.has(args[1]))return [{affectedRows:0}];next.set(args[1],JSON.parse(args[0]));return [{affectedRows:1}];
    }assert.fail(sql);
   }};
   const result=await fn(c);state.clear();for(const [k,v]of next)state.set(k,v);
   if(lostAck){lostAck=false;throw Error('SYNTHETIC_COMMIT_ACK_LOST');}return result;
  });tail=work.catch(()=>{});return work;
 };
 let context={accountKey:account,linked:true,consent:true,bindingStamp:'synthetic-current-binding',sender:'12025550100',recipient:'12025550101'};
 const policy={enabled:true,budgetApproved:true,monthlyBudgetMicroUsd:budget,programId,allowedChannels:['whatsapp','voice']};
 const make=(clock=at)=>createSharedCreditCandidate(policy,{now:typeof clock==='function'?clock:()=>clock,resolveTrustedContext:async(_c,j)=>({...context,quote:{...quote(j.channel),...quoteOverride}})});
 const reserve=(n,channel='whatsapp',candidate=make())=>transaction(c=>candidate.reserve(c,{...job(n,channel),accountKey:context.accountKey}));
 return {state,globalKey,transaction,policy,make,reserve,context,setFail:n=>failUpdate=n,loseAck:()=>lostAck=true,setClockHook:fn=>clockHook=fn,setQuoteOverride:v=>quoteOverride=v};
}
assert.equal(CONCIERGE_SHARED_CREDIT_SHIPPING,false);
{const f=fixture();const impostor=createSharedCreditCandidate(f.policy,{now:()=>at,resolveTrustedContext:async()=>({...f.context,accountKey:other,quote:quote('whatsapp')})});assert.equal(await f.transaction(c=>impostor.reserve(c,job(9))),false,'canonical owner must equal the server-stamped job owner');}
assert.equal(boundedQuoteReservation(quote('whatsapp'),'whatsapp',at),12000);
assert.equal(boundedQuoteReservation(quote('voice'),'voice',at),75000,'61 seconds rounds to two 60-second quanta plus setup/buffer, never 1:1');
for(const malformed of [{...quote('voice'),maxDurationSeconds:null},{...quote('voice'),quantumSeconds:0},{...quote('voice'),verifiedAt:at-900001}])assert.equal(boundedQuoteReservation(malformed,'voice',at),null);
for(const malformed of [null,{...quote('whatsapp'),currency:'BRL'},{...quote('whatsapp'),unitMicroUsd:0},{...quote('whatsapp'),sessionUntil:at},{...quote('whatsapp'),verifiedAt:at+1},{...quote('voice'),maxDurationSeconds:121},{...quote('voice'),unitMicroUsd:Number.MAX_SAFE_INTEGER}])assert.equal(boundedQuoteReservation(malformed,malformed?.channel||'whatsapp',at),null);
{
 const f=fixture({balance:36000,budget:100000});
 const outcomes=await Promise.all(Array.from({length:30},(_,i)=>f.reserve(i+1)));
 assert.equal(outcomes.filter(Boolean).length,3);assert.equal(f.state.get(f.globalKey).reservedMicroUsd,36000);
 assert.equal(f.state.get(key('account',[programId,account])).availableMicroUsd,0);
 assert.equal(await f.reserve(1),false,'Same event never gets another reservation');
}
{
 const f=fixture({balance:1000000,budget:50000,spent:14000});
 const users=Array.from({length:35},(_,i)=>i.toString(16).padStart(64,'0'));
 for(const a of users)f.state.set(key('account',[programId,a]),{v:1,kind:'account-credit',accountKey:a,availableMicroUsd:1000000,reservedMicroUsd:0});
 const candidate=createSharedCreditCandidate(f.policy,{now:()=>at,resolveTrustedContext:async(_c,j)=>({...f.context,accountKey:users[Number.parseInt(j.eventKey,16)-1],quote:quote(j.channel)})});
 const results=await Promise.all(users.map((a,i)=>f.transaction(c=>candidate.reserve(c,{...job(i+1),accountKey:a}))));
 assert.equal(results.filter(Boolean).length,3,'35 users share one budget, not a budget per user');
 assert.equal(f.state.get(f.globalKey).reservedMicroUsd+14000,50000);
}
{
 const f=fixture({balance:100000,budget:1000000});
 assert(await f.reserve(1));assert(await f.reserve(2,'voice'));
 const a=f.state.get(key('account',[programId,account]));assert.equal(a.availableMicroUsd,13000);assert.equal(a.reservedMicroUsd,87000);
 assert.equal(await f.reserve(1,'voice'),false,'Changing channel cannot mint a second debit permit for the same event');
 assert.equal(await f.reserve(3,'voice'),false);assert(await f.reserve(4));assert.equal(a.availableMicroUsd,13000,'Old snapshot is not authority');
}
{
 for(const boundary of [1,2,3]){
  const f=fixture();f.setFail(boundary);await assert.rejects(f.reserve(1),/ROLLBACK/);
  assert.equal(f.state.get(f.globalKey).reservedMicroUsd,0);
  assert.equal(f.state.get(key('account',[programId,account])).availableMicroUsd,1000000);
  f.setFail(0);assert(await f.reserve(1),'Rolled back event may reserve once, not twice');
 }
}
{
 const f=fixture();f.loseAck();await assert.rejects(f.reserve(1),/ACK_LOST/);
 assert.equal(await f.reserve(1,'whatsapp',f.make()),false,'Recreated candidate/reentry cannot repeat unknown committed reservation');
 assert.equal(f.state.get(f.globalKey).reservedMicroUsd,12000,'No refund for unknown/failed/no-I/O result');
}
{
 const f=fixture();f.context.consent=false;assert.equal(await f.reserve(1),false);f.context.consent=true;
 f.state.delete(key('account',[programId,account]));assert.equal(await f.reserve(2),false,'No implicit initial grant');
 assert.equal(await f.reserve(3,'whatsapp',f.make(at+31*86400000)),false,'Month turnover cannot manufacture unreconciled new global budget');
}
{
 const f=fixture();let queried=0;
 const disabled=createSharedCreditCandidate({...f.policy,budgetApproved:false},{resolveTrustedContext:()=>assert.fail('OFF before context')});
 assert.equal(await disabled.reserve({query(){queried++;}},job(1)),false);assert.equal(queried,0);
}
{
 for(const spent of [95000,110000]){
  const f=fixture({budget:100000,spent});assert.equal(await f.reserve(1),false);
  assert.equal(f.state.get(key('account',[programId,account])).availableMicroUsd,1000000,'Insufficient global budget must not debit account');
 }
 const f=fixture();f.state.get(f.globalKey).reconciledAt=at-900001;assert.equal(await f.reserve(1),false);
 const mismatched=createSharedCreditCandidate({...f.policy,monthlyBudgetMicroUsd:30000000},{now:()=>at,resolveTrustedContext:async()=>({...f.context,quote:quote('whatsapp')})});
 f.state.get(f.globalKey).reconciledAt=at;assert.equal(await f.reserve(2,'whatsapp',mismatched),false,'Policy changes cannot reset or silently enlarge reconciled budget');
}
for(const boundary of ['locked-read','request-insert','last-update','stale-quote','stale-reconciliation']){
 const f=fixture();let clock=at,reads=0,updates=0;
 if(boundary==='stale-quote')f.setQuoteOverride({sessionUntil:at+86400000});
 if(boundary==='stale-reconciliation')f.state.get(f.globalKey).reconciledAt=at-899999;
 f.setClockHook(sql=>{if(sql.startsWith('SELECT payload')&&++reads===2&&['locked-read','stale-quote','stale-reconciliation'].includes(boundary))clock=at+(boundary==='stale-quote'?900001:boundary==='stale-reconciliation'?2:60000);if(sql.startsWith('INSERT INTO')&&boundary==='request-insert')clock=at+60000;if(sql.startsWith('UPDATE')&&++updates===3&&boundary==='last-update')clock=at+60000;});
 const run=()=>f.reserve(71,'whatsapp',f.make(()=>clock));
 if(['request-insert','last-update'].includes(boundary))await assert.rejects(run(),/EXPIRED/);else assert.equal(await run(),false);
 assert.equal(f.state.get(key('account',[programId,account])).availableMicroUsd,1000000);assert.equal(f.state.get(f.globalKey).reservedMicroUsd,0);assert.equal(f.state.has(key('request',[programId,event(71)])),false,'expired request has no committed marker/debit');
}
console.log(JSON.stringify({suite:'Unwired shared-credit candidate',shipping:false,syntheticTransactionalModel:true,realMysqlOrRestartTested:false,concurrentUsers:35,accountCreditAndGlobalBudgetAtomic:true,sharedMessageVoiceBalance:true,channelPreferenceDoesNotMintCredits:true,uncertainReservationRetained:true,externalCalls:0,providerCalls:0}));
