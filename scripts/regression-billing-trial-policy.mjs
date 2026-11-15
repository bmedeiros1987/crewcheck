import assert from 'node:assert/strict';
import {createTrialPolicy} from '../server/billing-trial-policy.mjs';
const now=Date.parse('2032-03-12T12:00:00.000Z'),duration=7*86400000;
const owner={email:'synthetic@example.invalid',publicId:'SYNTHETIC'};
const common={...owner,observedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+60000).toISOString(),sourceVersionHash:'a'.repeat(64)};
let count=0;
async function run(h={},e={},identity=owner){const history={...common,state:'never_used',...h},entitlement={...common,kind:'free',...e},before=JSON.stringify([history,entitlement]);const r=await createTrialPolicy({readTrialHistory:async()=>history,readCurrentEntitlement:async()=>entitlement,clock:()=>now})(identity);assert.equal(JSON.stringify([history,entitlement]),before);assert.equal(r.automaticCharge,false);assert.equal(r.providerOperation,'none');assert.equal(r.accessMutation,'none');assert(Object.isFrozen(r));assert(!JSON.stringify(r).includes(owner.email));count++;return r;}
const eligible=await run();assert.equal(eligible.state,'eligible_for_trial');assert.equal(Date.parse(eligible.proposedEnd)-Date.parse(eligible.proposedStart),duration);assert.equal(eligible.requiresAtomicConsumption,true);
const active={state:'consumed',startedAt:new Date(now-1000).toISOString(),endsAt:new Date(now-1000+duration).toISOString()};
assert.equal((await run(active)).state,'trial_already_started');
for(const end of [now,now-1000])assert.equal((await run({state:'consumed',startedAt:new Date(end-duration).toISOString(),endsAt:new Date(end).toISOString()})).state,'trial_already_used');
for(const kind of ['paid','unlimited','trial'])assert.equal((await run({}, {kind})).state,'trial_not_available');
for(const h of [{state:'unknown'},{state:null},{state:'consumed'},{...active,endsAt:new Date(now+31*86400000).toISOString()},{startedAt:active.startedAt},{publicId:'RECREATED'},{email:'other@example.invalid'},{sourceVersionHash:''},{validUntil:new Date(now).toISOString()},{observedAt:new Date(now+1).toISOString()}])assert.equal((await run(h)).state,'reconciliation_required');
for(const e of [{kind:'unknown'},{publicId:'OTHER'},{sourceVersionHash:''},{validUntil:new Date(now).toISOString()}])assert.equal((await run({},e)).state,'reconciliation_required');
assert.equal((await run({}, {},null)).state,'reconciliation_required');
for(const invalid of ['2032-02-30T12:00:00.000Z','2032-13-01T12:00:00.000Z','2032-10-15T24:00:00.000Z']){assert.equal((await run({observedAt:invalid})).state,'reconciliation_required');assert.equal((await run({validUntil:invalid})).state,'reconciliation_required');assert.equal((await run({...active,startedAt:invalid})).state,'reconciliation_required');assert.equal((await run({...active,endsAt:invalid})).state,'reconciliation_required');}
assert.deepEqual(await run(),await run()); // Replay proposes; never consumes or grants.
const concurrent=createTrialPolicy({readTrialHistory:async()=>({...common,state:'never_used'}),readCurrentEntitlement:async()=>({...common,kind:'free'}),clock:()=>now});const proposals=await Promise.all([concurrent(owner),concurrent(owner)]);assert(proposals.every(r=>r.state==='eligible_for_trial'&&r.requiresAtomicConsumption&&r.accessMutation==='none'));count++; // This explicitly does NOT prove atomic single-use.
let time=now;const expires=createTrialPolicy({clock:()=>time,readTrialHistory:async()=>({...common,state:'never_used'}),readCurrentEntitlement:async()=>{time=now+60000;return {...common,kind:'free'};}});assert.equal((await expires(owner)).reason,'evidence_expired');count++;
const failed=createTrialPolicy({readTrialHistory:async()=>{throw Error('PRIVATE');},readCurrentEntitlement:async()=>{throw Error('must not read');},clock:()=>now});assert.equal((await failed(owner)).reason,'evidence_unavailable');count++;
console.log(`PASS ${count} synthetic trial decisions: seven elapsed days, single-use history, exact expiry, identity/freshness, paid/Unlimited preservation and zero charge/access writes`);
