import assert from 'node:assert/strict';import {createReferencePaymentPolicy} from '../server/billing-paid-cancellation-policy.mjs';
const now=Date.parse('2032-10-15T12:00:00.000Z'),owner={email:'synthetic@example.invalid',publicId:'SYNTHETIC_OWNER',provider:'asaas',providerRef:'sub_SYNTHETIC',paymentRef:'pay_SYNTHETIC'};
const proof={...owner,paid:true,start:'2032-10-01T00:00:00.000Z',end:'2032-11-01T00:00:00.000Z',observedAt:'2032-10-15T11:59:00.000Z',validUntil:'2032-10-15T12:01:00.000Z',source:'reviewed_payment_coverage',sourceVersionHash:'a'.repeat(64),refundState:'none'};
const baseline={email:owner.email,publicId:owner.publicId,plan:'free',sourceVersionHash:'b'.repeat(64),validUntil:proof.validUntil};let count=0;
async function run(p={},b={},selected=owner){const coverage={...proof,...p},base={...baseline,...b},before=JSON.stringify([coverage,base]);const policy=createReferencePaymentPolicy({clock:()=>now,readVerifiedCoverage:async()=>coverage,readBaselineGrant:async()=>base});const r=await policy(selected);assert.equal(r.accessMutation,'none');assert.equal(JSON.stringify([coverage,base]),before);if(r.state!=='reconciliation_required'){assert.equal(r.automaticExtension,false);assert.equal(r.referenceEnd,coverage.end);}count++;return r;}
assert.equal((await run()).state,'reference_access_available');
for(const plan of ['free','premium_unlimited']){
 const old=await run({start:'2032-09-01T00:00:00.000Z',end:'2032-10-01T00:00:00.000Z'},{plan});assert.equal(old.state,'new_payment_required');assert.equal(old.baselinePlan,plan);assert.equal(old.paymentRequirementScope,'paid_reference_only');
 const ended=await run({end:'2032-10-15T12:00:00.000Z'},{plan});assert.equal(ended.state,'new_payment_required');
 const active=await run({}, {plan});assert.equal(active.state,'reference_access_available');assert.equal(active.baselinePlan,plan);
}
// Payment receipt arrives now, but the reference remains September: no +30 days.
assert.equal((await run({start:'2032-09-01T00:00:00.000Z',end:'2032-10-01T00:00:00.000Z',paymentDate:'2032-10-15'})).state,'new_payment_required');
assert.equal((await run({paid:false})).reason,'paid_coverage_unconfirmed');
assert.equal((await run({source:'legacy_31_366_days'})).reason,'paid_coverage_unconfirmed');
assert.equal((await run({paymentRef:'pay_OTHER'})).reason,'coverage_identity_mismatch');
assert.equal((await run({start:'2032-10-16T00:00:00.000Z'})).state,'reference_not_started');
for(const refundState of ['pending','partial','completed','unknown'])assert.equal((await run({refundState})).reason,'refund_requires_separate_reconciliation');
for(const b of [{plan:'premium_monthly'},{publicId:'OTHER'},{sourceVersionHash:''},{validUntil:'2032-10-15T12:00:00.000Z'}])assert.equal((await run({},b)).reason,'baseline_grant_unconfirmed');
assert.equal((await run({provider:'google_play'},{},{...owner,provider:'google_play'})).state,'reference_access_available');
assert.equal((await run({start:'2032-01-01T00:00:00.000Z',end:'2033-01-01T00:00:00.000Z'})).state,'reference_access_available');
let time=now;const delayed=createReferencePaymentPolicy({clock:()=>time,readVerifiedCoverage:async()=>proof,readBaselineGrant:async()=>{time=Date.parse(proof.validUntil);return baseline;}});assert.equal((await delayed(owner)).reason,'coverage_time_unconfirmed');count++;
let endReads=0,planReads=0;const changingProof={...proof},changingBase={...baseline};Object.defineProperty(changingProof,'end',{get(){endReads++;return endReads===1?proof.end:'2099-01-01T00:00:00.000Z';}});Object.defineProperty(changingBase,'plan',{get(){planReads++;return planReads===1?'free':'premium_unlimited';}});const stable=createReferencePaymentPolicy({clock:()=>now,readVerifiedCoverage:async()=>changingProof,readBaselineGrant:async()=>changingBase});const projected=await stable(owner);assert.equal(projected.referenceEnd,proof.end);assert.equal(projected.baselinePlan,'free');assert.equal(endReads,1);assert.equal(planReads,1);count++;
console.log(`PASS ${count} synthetic reference-payment/fallback decisions; no rollover, new payment, benefit changes or access writes`);
