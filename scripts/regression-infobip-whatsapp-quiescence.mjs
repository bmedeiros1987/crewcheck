import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,sender,recipient,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
import {createInfobipProductionStore} from '../server/infobip-whatsapp-store.mjs';
import {createInfobipSendAdmission} from '../server/infobip-whatsapp-admission.mjs';
import {createOfflineInfobipReceiver} from '../server/infobip-whatsapp-candidate.mjs';
import {configureWhatsAppConcierge,invokeConfiguredWhatsAppConcierge} from '../server/whatsapp.mjs';
import {eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';
import {preflightInfobipWhatsAppStorage} from '../server/infobip-whatsapp-preflight.mjs';

globalThis.fetch=()=>assert.fail('external network forbidden');
const policy={id:'synthetic-quiescence',recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+3600000};
for(const scenario of ['settle','cleanup-failure']){
 const {state,db}=fixture();let enter,release,effects=0,sends=0;
 const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
 configureWhatsAppConcierge(async()=>{enter();await hold;effects++;return 'SYNTHETIC REPLY';});
 const make=()=>createInfobipProductionStore({db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>state.clock},
   {concierge:invokeConfiguredWhatsAppConcierge,send:async()=>{sends++;return {status:'accepted_unconfirmed'};},admission:createInfobipSendAdmission(policy,{sender,now:()=>state.clock})});
 const store=make(),event={from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(epoch).toISOString(),messageId:'synthetic-quiescence-id',message:{type:'TEXT',text:'SYNTHETIC QUESTION'}};
 const receive=createOfflineInfobipReceiver({sender,username:'synthetic',password:'synthetic-webhook-password-not-real',store,now:()=>state.clock});
 const packet={method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:synthetic-webhook-password-not-real').toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[event]}))};
 assert.equal((await receive(packet)).accepted,1);
 const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,event.messageId])).digest('hex');
 const running=store.dispatch(eventKey);
 try{
  await entered;
  // No lifecycle owner installed in this process. The durable marker alone
  // must protect authenticated mutation on an otherwise OFF host.
  await assert.rejects(eraseWhatsAppAccountState(state.link.email,{db}));
  await assert.rejects(make().eraseAccount(state.link.email));
  assert.equal((await make().dispatch(eventKey)).status,'preparing');
  assert.equal((await receive(packet)).duplicates,1);assert.equal(effects,0);
  state.link.revoked_at='synthetic-revocation';state.link.consent_concierge=0;
  state.clock=epoch+12*24*3600000;
  await make().maintain({forgetAccountId:state.owner});
  const marker=[...state.rows.values()].find(r=>r.engineActive===true);
  assert(marker);assert.equal(marker.sealed,null);assert(marker.ownerHash);
  await assert.rejects(eraseWhatsAppAccountState(state.link.email,{db}));
  state.failCleanup=scenario==='cleanup-failure';release();await running;
  assert.equal(effects,1);assert.equal(sends,0);
  if(state.failCleanup){
   await assert.rejects(eraseWhatsAppAccountState(state.link.email,{db}));
   await make().maintain();assert([...state.rows.values()].some(r=>r.engineActive===true));
  }else{
   await eraseWhatsAppAccountState(state.link.email,{db});
   await make().eraseAccount(state.link.email);await make().maintain();
   assert(![...state.rows.values()].some(r=>r.engineActive===true));
  }
  const quota=[...state.rows.values()].find(r=>r.kind==='infobip_send_admission');assert.equal(quota.used,1);
 }finally{release();await running;configureWhatsAppConcierge(null);}
}
{
 const {state,db}=fixture();const key='crewcheck-infobip-inbound-v1:'+'a'.repeat(64);
 state.rows.set(key,{v:1,status:'preparing',preparationId:'synthetic-legacy',sealed:null,retainUntil:epoch-1});
 const {createInfobipSqlStore}=await import('../server/infobip-whatsapp-store.mjs');
 const store=createInfobipSqlStore({db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>epoch});
 await store.maintain({forgetAccountId:state.owner});await store.maintain();
 assert(state.rows.has(key));await assert.rejects(eraseWhatsAppAccountState(state.link.email,{db}));
}
for(const missing of [null,'schemaMissing','columnMissing','indexMissing']){
 const {state,db}=fixture();if(missing)state[missing]=true;
 if(missing)await assert.rejects(preflightInfobipWhatsAppStorage(db));else await preflightInfobipWhatsAppStorage(db);
 assert(state.queries.length<=3);assert(state.queries.every(sql=>/^SELECT .*information_schema\./.test(sql)));
}
console.log('PASS durable engine fence across independent hosts, OFF mutation guard, no early revocation success, noncooperative canonical settle, cleanup failure stays closed, content expiry without fence purge, quota recreation; isolated SELECT-only preflight; externalCalls=0');
