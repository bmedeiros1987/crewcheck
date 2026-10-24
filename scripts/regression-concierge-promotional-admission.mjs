import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createPromotionalConciergeAdmission,CONCIERGE_PROMOTIONAL_BETA_SHIPPING} from '../server/concierge-promotional-admission.mjs';
import {createInfobipProductionStore} from '../server/infobip-whatsapp-store.mjs';
import {createInfobipInboundReceiver} from '../server/infobip-whatsapp-candidate.mjs';
import {fixture,sender,recipient,other,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),programId='synthetic-promotional-program';
const ownerKey=hash('synthetic-owner');
const policy={enabled:true,version:1,approvalId:'synthetic-specific-promotional-approval',programId,ownerAccountKey:ownerKey,sender,recipient,validFrom:epoch-1000,validUntil:epoch+86400000,maxReplies:2,monthlyBudgetMicroUsd:50000};
import {sharedCreditKey as key} from '../server/concierge-shared-credit-candidate.mjs';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_NETWORK');
function setup(){
 const {state,db}=fixture();let engine=0,sends=0,mode='accepted_unconfirmed';
 state.rows.set(key('account',[programId,ownerKey]),{v:1,kind:'account-credit',accountKey:ownerKey,availableMicroUsd:24000,reservedMicroUsd:0});
 state.rows.set(key('global',[programId,'2032-01']),{v:1,kind:'global-credit',period:'2032-01',budgetMicroUsd:50000,knownSpentMicroUsd:4000,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch});
 const resolveTrustedContext=async(_c,j)=>({accountKey:hash(state.owner),linked:state.link?.revoked_at===null,consent:state.link?.consent_concierge===1,bindingStamp:JSON.stringify([state.owner,JSON.stringify([state.link.linked_at,state.link.updated_at]),'infobip',sender,recipient]),sender,recipient,quote:{channel:'whatsapp',currency:'USD',country:'BR',sender,sourceId:'synthetic-fixture-not-current-tariff',verifiedAt:state.clock,category:'service-text',sessionUntil:state.clock+60000,unitMicroUsd:12000,setupMicroUsd:0,markupMicroUsd:0}});
 const admission=p=>createPromotionalConciergeAdmission(p??policy,{now:()=>state.clock,resolveTrustedContext});
 function make(p){return createInfobipProductionStore({db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>state.clock},{admission:admission(p),allowsOwner:id=>hash(id)===ownerKey,concierge:async()=>{engine++;if(mode==='revoke')state.link.consent_concierge=0;return 'SYNTHETIC READ-ONLY RESPONSE';},send:async()=>{sends++;assert.equal(state.rows.get(key('account',[programId,ownerKey])).reservedMicroUsd>=12000,true,'credit committed before provider');return {status:mode};}});}
 const event=id=>({from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(state.clock).toISOString(),messageId:id,message:{type:'TEXT',text:'SYNTHETIC OPERATIONAL QUESTION'}});
 const eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id]));
 async function receive(store,id,mutate=x=>x){const e=mutate(event(id)),rawBody=Buffer.from(JSON.stringify({results:[e]}));return createInfobipInboundReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:secrets.webhookSecret},store,now:()=>state.clock,queueLinkConfirmation:false})({method:'POST',rawBody,rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex')]});}
 return {state,db,make,receive,eventKey,admission,stats:()=>({engine,sends}),setMode:x=>mode=x};
}
assert.equal(CONCIERGE_PROMOTIONAL_BETA_SHIPPING,false);
const off=createPromotionalConciergeAdmission();assert.equal(off.allows({}),false);assert.equal(await off.reserve(new Proxy({},{get(){assert.fail('OFF_NO_SQL');}}),{}),false);
{
 const f=setup(),s=f.make();for(const id of ['one','two','three'])assert.equal((await f.receive(s,id)).accepted,1);
 await Promise.all(['one','one','two','three'].map(id=>s.dispatch(f.eventKey(id))));assert.deepEqual(f.stats(),{engine:2,sends:2});
 assert.equal(f.state.rows.get(key('account',[programId,ownerKey])).availableMicroUsd,0);assert.equal(f.state.rows.get(key('global',[programId,'2032-01'])).reservedMicroUsd,24000);
 const restarted=f.make();await f.receive(restarted,'four');await restarted.dispatch(f.eventKey('four'));assert.deepEqual(f.stats(),{engine:2,sends:2});
 const changed=f.make({...policy,maxReplies:3,validUntil:policy.validUntil+60000});await f.receive(changed,'changed');await changed.dispatch(f.eventKey('changed'));assert.deepEqual(f.stats(),{engine:2,sends:2},'same approval cannot change its manifest and reset quantity');
}
{const f=setup(),s=f.make({...policy,maxReplies:1});for(const id of ['limit-one','limit-two']){await f.receive(s,id);await s.dispatch(f.eventKey(id));}assert.deepEqual(f.stats(),{engine:1,sends:1});assert.equal(f.state.rows.get(key('account',[programId,ownerKey])).availableMicroUsd,12000,'quantity limit is independent of remaining credit');}
for(const mode of ['owner','revoked','missing-credit','expired','rollback','lost-ack','uncertain','revoke']){
 const f=setup(),s=f.make();await f.receive(s,mode);
 if(mode==='owner')f.state.owner='synthetic-other-owner';if(mode==='revoked')f.state.link.consent_concierge=0;
 if(mode==='missing-credit')f.state.rows.delete(key('account',[programId,ownerKey]));if(mode==='expired')f.state.clock=policy.validUntil;
 if(mode==='rollback')f.state.failMarker=true;if(mode==='lost-ack')f.state.lostAck=true;if(['uncertain','revoke'].includes(mode))f.setMode(mode);
 await s.dispatch(f.eventKey(mode));
 if(['uncertain','revoke'].includes(mode)){assert.equal(f.state.rows.get(key('account',[programId,ownerKey])).reservedMicroUsd,12000);assert.equal(f.stats().sends,mode==='uncertain'?1:0);}
 else assert.deepEqual(f.stats(),{engine:0,sends:0});
 if(mode==='rollback')assert.equal(f.state.rows.get(key('account',[programId,ownerKey])).reservedMicroUsd,0);
 if(mode==='lost-ack')assert.equal(f.state.rows.get(key('account',[programId,ownerKey])).reservedMicroUsd,12000);
 await f.make().dispatch(f.eventKey(mode));assert(f.stats().sends<=1,'no replay after unknown or blocked outcome');
}
{
 const f=setup(),s=f.make();await f.receive(s,'foreign',e=>({...e,from:other}));await s.dispatch(f.eventKey('foreign'));assert.deepEqual(f.stats(),{engine:0,sends:0});
 const valid={provider:'infobip',sender,recipient,receivedAt:epoch,eventKey:'a'.repeat(64),bindingStamp:JSON.stringify(['synthetic-owner','revision','infobip',sender,recipient])};
 assert(f.admission().allows(valid));assert(!f.admission().allows({...valid,receivedAt:policy.validFrom-1}));assert(!f.admission().allows({...valid,kind:'link_confirmation'}));
}
console.log(JSON.stringify({suite:'OFF promotional admission through actual HMAC receiver/sealed production store',quantityAndCreditBeforeEngine:true,duplicateRestartAndScopeChangeBlocked:true,rollbackAndUnknownPreserved:true,canonicalOwnerConsentRechecked:true,externalCalls:0,providerCalls:0}));
