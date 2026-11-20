import assert from 'node:assert/strict';import {createBillingVerificationFlight} from '../server/billing-verification-flight.mjs';
for(const maxConcurrent of [undefined,0,-1,1.5,Infinity,'2'])assert.throws(()=>createBillingVerificationFlight({maxConcurrent}),{code:'BILLING_VERIFICATION_LIMIT_REQUIRED'});
const run=createBillingVerificationFlight({maxConcurrent:1}),key='a'.repeat(64);let entered,release,calls=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
const first=run(key,async()=>{calls++;entered();await gate;return 'SYNTHETIC';});await started;const same=run(key,()=>assert.fail('duplicate must share in-flight work'));assert.equal(first,same);
assert.throws(()=>run('b'.repeat(64),()=>assert.fail('full capacity must not call adapter')),{code:'BILLING_VERIFICATION_BUSY'});release();assert.equal(await first,'SYNTHETIC');assert.equal(await same,'SYNTHETIC');assert.equal(calls,1);
assert.equal(await run(key,async()=>{calls++;return 'NEW';}),'NEW');assert.equal(calls,2,'no post-flight result cache or implicit retention');
await assert.rejects(run(key,async()=>{throw Error('SYNTHETIC_FAILURE');}),/SYNTHETIC_FAILURE/);assert.equal(await run(key,async()=>'RECOVERED'),'RECOVERED');
for(const badKey of ['',key.toUpperCase(),[key],null])assert.throws(()=>run(badKey,()=>{}),{code:'BILLING_VERIFICATION_KEY_INVALID'});
console.log('PASS verification flight: explicit capacity, shared work, saturation, success/failure cleanup, no retained result, strict hash key');
