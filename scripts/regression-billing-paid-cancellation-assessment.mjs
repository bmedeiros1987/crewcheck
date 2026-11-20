import assert from 'node:assert/strict';
import {withPlatformEntitlements} from '../server/platform-entitlement.mjs';
import {createPaidCancellationAssessment} from '../server/billing-paid-cancellation-assessment.mjs';
const owner={email:'synthetic@example.invalid',expectedPublicId:'OWNER_SYNTHETIC'},now=Date.parse('2032-10-15T12:00:00.000Z');
let count=0;
async function run({provider='asaas',status='active',profilePlan='premium_monthly',metadata={lastAsaasPaidPaymentId:'pay_SYNTHETIC'},publicId=owner.expectedPublicId,proofPatch={},rollback=false}={}){
 const log=[],sub={email:owner.email,plan:'premium_monthly',status,provider,provider_ref:provider==='asaas'?'sub_SYNTHETIC':'GPA.SYNTHETIC',current_period_end:'2032-11-01 00:00:00.000',metadata};
 let txClient,reads=0;
 const client={async query(sql){log.push(sql);assert(!/^(?:UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)\b/i.test(sql));if(sql.startsWith('SELECT email'))return {rows:[{email:owner.email}]};if(sql.startsWith('SELECT * FROM crewcheck_platform_profiles'))return {rows:[{email:owner.email,public_id:publicId,plan:profilePlan}]};if(sql.startsWith('SELECT * FROM crewcheck_platform_subscriptions'))return {rows:[sub]};return {rows:[]};},release(){log.push('release');}};
 const db={connect:async()=>{txClient=client;return client;}};
 const assess=createPaidCancellationAssessment({clock:()=>now,readLockedVerifiedCoverage:async(c,s)=>{reads++;assert.equal(c,txClient);assert(Object.isFrozen(s));return {...s,paid:true,start:'2032-10-01T00:00:00.000Z',end:'2032-11-01T00:00:00.000Z',observedAt:'2032-10-15T11:59:00.000Z',validUntil:'2032-10-15T12:01:00.000Z',source:'reviewed_payment_coverage',sourceVersionHash:'b'.repeat(64),refundState:'none',renewalStopped:true,...proofPatch};}});
 const action=()=>withPlatformEntitlements(db,[owner],async c=>{const result=await assess(c,owner);if(rollback)throw Error('synthetic failure');return result;});
 if(publicId!==owner.expectedPublicId){await assert.rejects(action,{code:'ENTITLEMENT_OWNER_MISMATCH'});assert.equal(reads,0);assert(log.includes('ROLLBACK'));count++;return;}
 if(rollback){await assert.rejects(action,/synthetic failure/);assert(log.includes('ROLLBACK'));count++;return;}
 const result=await action();assert(log.includes('COMMIT'));assert.equal(result.accessMutation,'none');count++;return {result,reads,log};
}
assert.equal((await run()).result.state,'preserve_paid_access');
assert.equal((await run({provider:'google_play'})).result.state,'preserve_paid_access');
for(const status of ['trialing','grace_period','pending','refunded','canceled']){const r=await run({status});assert.equal(r.result.reason,'existing_paid_entitlement_unconfirmed');assert.equal(r.reads,0);}
assert.equal((await run({profilePlan:'free'})).reads,0);
assert.equal((await run({profilePlan:'premium_unlimited'})).reads,0);
assert.equal((await run({metadata:{}})).result.reason,'identity_unconfirmed');
assert.equal((await run({proofPatch:{paymentRef:'pay_OTHER'}})).result.reason,'coverage_identity_mismatch');
assert.equal((await run({proofPatch:{refundState:'pending'}})).result.reason,'refund_requires_separate_reconciliation');
await run({publicId:'RECREATED_ACCOUNT'});await run({rollback:true});
const assess=createPaidCancellationAssessment({readLockedVerifiedCoverage:async()=>assert.fail('escaped client cannot read evidence')});await assert.rejects(assess({query(){}},owner),{code:'PROFILE_TX_CLIENT_REQUIRED'});count++;
console.log(`PASS ${count} synthetic transactional assessment cases; real lock helpers, controlled SQL, no access writes/provider calls; not MySQL integration`);
