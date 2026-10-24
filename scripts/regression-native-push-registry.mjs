import assert from 'node:assert/strict';
import {nativeMutationPlan,nativeRegistryHost,NATIVE_PROJECT,NATIVE_PACKAGE} from '../server/native-push/registry.mjs';
import {sendNativePush} from '../server/native-push/sender.mjs';
const identity={ownerId:'synthetic-owner-a',email:'native-a@example.test'};
export const mutation=(overrides={})=>({identity,installationId:'synthetic-device-a',mutationId:'synthetic-mutation-1',project:NATIVE_PROJECT,package:NATIVE_PACKAGE,action:'register',generation:1,tokenRevision:1,expectedRevision:0,expectedConsentRevision:0,consent:true,token:'SYNTHETIC_NATIVE_TOKEN_A_NOT_REAL',...overrides});
let count=0;const check=(fn)=>{fn();count++};
const first=nativeMutationPlan(null,mutation(),1000).next;
check(()=>assert.equal(first.active,true));
check(()=>assert(!JSON.stringify(first).includes('SYNTHETIC_NATIVE_TOKEN')));
check(()=>assert.equal(nativeMutationPlan(first,mutation(),1100).duplicate,true));
for(const [input,code] of [
 [mutation({mutationId:'synthetic-mutation-1',token:'SYNTHETIC_CHANGED_TOKEN_NOT_REAL'}),'NATIVE_MUTATION_REUSED'],
 [mutation({mutationId:'synthetic-mutation-2',expectedRevision:9}),'NATIVE_REVISION_CHANGED'],
 [mutation({consent:false}),'NATIVE_EXPLICIT_CONSENT_REQUIRED'],
 [mutation({ownerHint:'synthetic-owner-b'}),'NATIVE_OWNER_HINT_MISMATCH'],
 [mutation({package:'untrusted.package'}),'NATIVE_INVALID_MUTATION'],
 [mutation({token:'secret\nbad'}),'NATIVE_INVALID_TOKEN'],
]) check(()=>assert.throws(()=>nativeMutationPlan(input.mutationId==='synthetic-mutation-1'&&code==='NATIVE_MUTATION_REUSED'?first:null,input,1200),e=>e.code===code));
for(const malformed of [false,0,'']) check(()=>assert.throws(()=>nativeMutationPlan(malformed,mutation(),1250),e=>e.code==='NATIVE_REGISTRY_STATE_INVALID'));
check(()=>assert.throws(()=>nativeMutationPlan(first,mutation({mutationId:'synthetic-token-version-reuse',expectedRevision:1,expectedConsentRevision:1,token:'SYNTHETIC_DIFFERENT_TOKEN_NOT_REAL'}),1250),e=>e.code==='NATIVE_TOKEN_VERSION_REUSED'));
check(()=>assert(nativeMutationPlan(first,mutation({mutationId:'synthetic-reconsent-1',expectedRevision:1,expectedConsentRevision:1}),1250).next.active));
const revoked=nativeMutationPlan(first,mutation({action:'revoke',mutationId:'synthetic-revoke-1',expectedRevision:1,expectedConsentRevision:1}),1300).next;
check(()=>assert.equal(revoked.active,false));
check(()=>assert.equal(revoked.sealedToken,null));
check(()=>assert.throws(()=>nativeMutationPlan(revoked,mutation({mutationId:'synthetic-late-enroll',expectedRevision:2,expectedConsentRevision:2,tokenRevision:2}),1400),e=>e.code==='NATIVE_GENERATION_REVOKED'));
const second=nativeMutationPlan(revoked,mutation({mutationId:'synthetic-generation-2',expectedRevision:2,expectedConsentRevision:2,generation:2}),1500).next;
check(()=>assert(second.active));
const rotated=nativeMutationPlan(second,mutation({action:'rotate',mutationId:'synthetic-rotate-2',expectedRevision:3,expectedConsentRevision:3,generation:2,tokenRevision:2,consent:false,token:'SYNTHETIC_NATIVE_TOKEN_ROTATED_NOT_REAL'}),1600).next;
check(()=>assert.equal(rotated.consentRevision,3));
check(()=>assert.throws(()=>nativeMutationPlan(rotated,mutation({action:'rotate',mutationId:'synthetic-stale-rotate',expectedRevision:4,expectedConsentRevision:3,generation:1,tokenRevision:50}),1700),e=>e.code==='NATIVE_STALE_GENERATION'));
const poison=new Proxy({}, {get(){throw Error('OFF must read nothing')}});
assert.deepEqual(await nativeRegistryHost(poison),{enabled:false,configured:false,registryConfirmed:false,received:null});count++;
assert.deepEqual(await sendNativePush(poison),{enabled:false,state:'disabled',providerAccepted:false,received:null});count++;
console.log('PASS '+count+' native registry generation/CAS/consent/tombstone/rotation/OFF checks; synthetic only');
