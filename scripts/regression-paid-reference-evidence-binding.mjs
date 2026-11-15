// Test-only reviewed reference ledger. This is NOT a production coverage adapter,
// schema, receipt store, commercial rule or provider freshness guarantee.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createAsaasCurrentReadAdapter} from '../server/billing-current-read-adapters.mjs';
import {createReferencePaymentPolicy} from '../server/billing-paid-cancellation-policy.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),now=Date.parse('2032-10-15T12:00:00.000Z');
const owner={email:'synthetic@example.invalid',publicId:'SYNTHETIC_OWNER',provider:'asaas',providerRef:'sub_SYNTHETIC',paymentRef:'pay_SYNTHETIC'};
const base={email:owner.email,publicId:owner.publicId,plan:'free',sourceVersionHash:'b'.repeat(64),validUntil:'2032-10-15T12:01:00.000Z'};
function fixture(){return {payment:{id:owner.paymentRef,subscription:owner.providerRef,status:'CONFIRMED',deleted:false,paymentDate:'2032-10-15'},subscription:{id:owner.providerRef,status:'ACTIVE',deleted:false},rows:[{...owner,paid:true,start:'2032-10-01T00:00:00.000Z',end:'2032-11-01T00:00:00.000Z',observedAt:'2032-10-15T11:59:00.000Z',validUntil:base.validUntil,source:'reviewed_payment_coverage',sourceVersionHash:'a'.repeat(64),refundState:'none'}]};}
let count=0;
async function run(change=()=>{}){
 const f=fixture();change(f);const before=JSON.stringify(f);let reads=0;
 const provider=createAsaasCurrentReadAdapter({readJson:async path=>{reads++;return {status:200,body:path.startsWith('/payments/')?f.payment:f.subscription};}});
 const policy=createReferencePaymentPolicy({clock:()=>now,readBaselineGrant:async()=>base,readVerifiedCoverage:async selected=>{
  const observed=await provider({paymentRef:selected.paymentRef,subscriptionRef:selected.providerRef});
  assert.equal(observed.entitlementDecision,'not_made');assert.equal(observed.atomicProviderSnapshot,false);
  if(!['CONFIRMED','RECEIVED'].includes(observed.paymentStatus)||observed.paymentDeleted||observed.subscriptionDeleted||!observed.paymentDate||observed.paymentDate>'2032-10-15')throw Error('synthetic financial state unconfirmed');
  // Explicit fictional reference bounds exist independently of payment/receipt dates.
  // A real implementation needs a reviewed/versioned trusted record, not this fixture.
  const matches=f.rows.filter(r=>r.email===selected.email&&r.publicId===selected.publicId&&r.provider===selected.provider&&hash(r.providerRef)===observed.subscriptionRefHash&&hash(r.paymentRef)===observed.paymentRefHash);
  if(matches.length!==1)throw Error('synthetic ledger missing or ambiguous');return matches[0];
 }});
 const result=await policy(owner);assert.equal(result.accessMutation,'none');assert.equal(JSON.stringify(f),before);assert(reads<=2);count++;return result;
}
assert.equal((await run()).state,'reference_access_available');
const old=await run(f=>{f.rows[0].start='2032-09-01T00:00:00.000Z';f.rows[0].end='2032-10-01T00:00:00.000Z';});assert.equal(old.state,'new_payment_required');assert.equal(old.referenceEnd,'2032-10-01T00:00:00.000Z');
for(const status of ['PENDING','OVERDUE','REFUNDED','REFUND_IN_PROGRESS','CHARGEBACK_DISPUTE'])assert.equal((await run(f=>f.payment.status=status)).state,'reconciliation_required');
for(const change of [f=>f.payment.id='pay_OTHER',f=>f.payment.subscription='sub_OTHER',f=>f.subscription.id='sub_OTHER',f=>f.payment.deleted=true,f=>f.subscription.deleted=true,f=>delete f.payment.paymentDate,f=>f.payment.paymentDate='2032-10-16',f=>f.rows=[],f=>f.rows.push({...f.rows[0]}),f=>f.rows[0].publicId='OTHER_OWNER',f=>f.rows[0].paymentRef='pay_OTHER',f=>f.rows[0].providerRef='sub_OTHER',f=>f.rows[0].source='legacy_31_366_days',f=>f.rows[0].sourceVersionHash='',f=>f.rows[0].refundState='pending'])assert.equal((await run(change)).state,'reconciliation_required');
const first=await run(),second=await run();assert.deepEqual(first,second);
console.log(`PASS ${count} synthetic payment/reference binding cases using real Asaas read adapter and reference policy; fixture ledger only, no provider/access/storage writes`);
