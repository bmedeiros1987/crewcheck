import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import fs from 'node:fs';
import {createInfobipWhatsAppProduction} from '../server/infobip-whatsapp-production.mjs';
import {createInfobipProductionTextTransport} from '../server/infobip-whatsapp-transport.mjs';
import {createInfobipProductionStore} from '../server/infobip-whatsapp-store.mjs';
import {createInfobipSendAdmission} from '../server/infobip-whatsapp-admission.mjs';
import {createInfobipInboundReceiver} from '../server/infobip-whatsapp-candidate.mjs';
import {configureWhatsAppConcierge} from '../server/whatsapp.mjs';
import {eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';
import {fixture,sender,recipient,other,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_NETWORK');
const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
const configuration={sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',
  credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/encryption',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},
  deploymentBinding:{profileId:'synthetic-profile',subscriptionIds:['synthetic-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}};
const policy={id:'synthetic-approval-1',maxAttempts:2,validFrom:epoch-1000,validUntil:epoch+3600000,recipients:[recipient]};
const event=id=>({from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(epoch).toISOString(),messageId:id,message:{type:'TEXT',text:'SYNTHETIC QUESTION'}});
const key=id=>createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex');
function setup() {
  const {state,db}=fixture();const stats={resolved:0,scheduled:0,cleared:0,attempts:0,engine:0};
  configureWhatsAppConcierge(async()=>{stats.engine++;return 'SYNTHETIC REPLY';});
  const options={enabled:true,configuration:structuredClone(configuration),db,now:()=>state.clock,admission:structuredClone(policy),
    ingress:{mode:'direct-tls',publicOrigin},credentials:{async resolve(_ref,{purpose}){stats.resolved++;return secrets[purpose];}},
    scheduler:{set(){stats.scheduled++;return 1;},clear(){stats.cleared++;}},
    request:async(url,{body})=>{stats.attempts++;assert.equal(url,baseUrl+'/whatsapp/1/message/text');const m=JSON.parse(body);return new Response(JSON.stringify({to:m.to,messageId:m.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));}};
  return {state,db,stats,options};
}
function packet(items){const rawBody=Buffer.from(JSON.stringify({results:items}));return {method:'POST',rawBody,rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex')]};}
async function route(runtime,items,{tls=true,host=new URL(publicOrigin).host,headers={},attested}={}) {
  const p=packet(items),req=Readable.from([p.rawBody]);Object.assign(req,{method:'POST',rawHeaders:p.rawHeaders,headers:{host,'content-type':'application/json',...headers},socket:{encrypted:tls}});attested?.add(req);
  const res={writeHead(status){this.status=status;},end(value){this.body=value;this.writableEnded=true;}};
  await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));return res;
}
const quotaRows=state=>[...state.rows.values()].filter(r=>r.kind==='infobip_send_admission');
{
 const forbidden=new Proxy({},{get(){assert.fail('OFF_MUST_NOT_READ_DEPENDENCIES');}});
 const off=await createInfobipWhatsAppProduction();assert.equal(off.health().enabled,false);
 const held=await createInfobipWhatsAppProduction({enabled:false,get configuration(){return forbidden.any;},get db(){return forbidden.any;}});assert.equal(held.health().enabled,false);
 const source=fs.readFileSync('scripts/p1-infobip-whatsapp-off/compose.mjs','utf8');assert(source.includes('createInfobipWhatsAppHost();'));
 assert(!source.includes('createInfobipWhatsAppProduction'));
}
for(const change of [o=>delete o.admission,o=>o.admission.recipients=[],o=>o.admission.maxAttempts=0,o=>o.admission.validUntil=epoch+25*3600000,o=>o.configuration.allowedSenders=[],o=>o.configuration.allowedBaseUrls=[],o=>o.configuration.authentication='auto',o=>delete o.configuration.deploymentBinding,o=>o.configuration.deploymentBinding.linkHashKeyReference='wrong',o=>delete o.ingress,o=>o.ingress={mode:'trusted-boundary',publicOrigin},o=>delete o.scheduler,o=>delete o.request,o=>o.configuration.credentialReferences.apiKey='literal secret with spaces']) {
 const {options,stats,state}=setup();change(options);await assert.rejects(()=>createInfobipWhatsAppProduction(options),{message:'INFOBIP_PRODUCTION_UNAVAILABLE'});assert.equal(stats.resolved,0);assert.equal(state.queries.length,0);assert.equal(stats.scheduled,0);
}
for(const issue of ['schemaMissing','indexMissing','columnMissing']) {
 const {options,state,stats}=setup();state[issue]=true;await assert.rejects(()=>createInfobipWhatsAppProduction(options),/PRODUCTION_UNAVAILABLE/);assert.equal(stats.scheduled,0);assert.equal(stats.attempts,0);assert(state.queries.every(q=>q.startsWith('SELECT')));
}
{
 const {options,stats}=setup();configureWhatsAppConcierge(null);await assert.rejects(()=>createInfobipWhatsAppProduction(options),/PRODUCTION_UNAVAILABLE/);assert.equal(stats.resolved,0);
}
{
 const {options,stats,state}=setup();options.credentials.resolve=async()=>{throw Error('PRIVATE_SECRET_PROVIDER_DETAIL');};await assert.rejects(()=>createInfobipWhatsAppProduction(options),{message:'INFOBIP_PRODUCTION_UNAVAILABLE'});assert.equal(state.queries.length,0);assert.equal(stats.scheduled,0);
}
{
 const {options,state,stats}=setup();const attested=new WeakSet();options.ingress={mode:'trusted-boundary',publicOrigin,attestedRequests:attested};
 const runtime=await createInfobipWhatsAppProduction(options);
 try {const before=state.queries.length;assert.equal((await route(runtime,[event('proxy-forged')],{tls:false,headers:{'x-forwarded-proto':'https','x-infobip-trusted':'true'}})).status,503);assert.equal(state.queries.length,before);assert.equal(stats.attempts,0);
 assert.equal((await route(runtime,[event('proxy-valid')],{tls:false,attested})).status,200);await runtime.maintain();assert.equal(stats.attempts,1);
 }finally{await runtime.dispose();}
}
{
 const {options,state,stats}=setup();const runtime=await createInfobipWhatsAppProduction(options);
 try {assert.equal((await route(runtime,[event('a'),event('b'),event('c'),event('d')])).status,200);
 await Promise.all(['a','b','c','d'].map(id=>runtime.dispatch(key(id))));await runtime.maintain();assert.equal(stats.attempts,2);assert.equal(stats.engine,2,'quantity admission precedes canonical engine');assert.equal(quotaRows(state)[0].used,2);
 assert.equal((await route(runtime,[event('a')])).status,200);await runtime.maintain();assert.equal(stats.attempts,2);
 }finally{await runtime.dispose();}
 const restarted=await createInfobipWhatsAppProduction(options);try {await route(restarted,[event('after-restart')]);await restarted.maintain();assert.equal(stats.attempts,2);assert.equal(quotaRows(state)[0].used,2);}finally{await restarted.dispose();}
 options.admission.maxAttempts=3;const changed=await createInfobipWhatsAppProduction(options);try {await route(changed,[event('changed-policy')]);await changed.maintain();assert.equal(stats.attempts,2,'same approval ID cannot reset quota by changing configuration');}finally{await changed.dispose();}
}
for(const mode of ['rollback','lost-ack','expired','revoked','not-allowlisted']) {
 const {options,state,stats}=setup();if(mode==='not-allowlisted')options.admission.recipients=[other];
 const runtime=await createInfobipWhatsAppProduction(options);
 try {if(mode==='rollback')state.failMarker=true;if(mode==='lost-ack')state.lostAck=true;if(mode==='expired')state.clock=policy.validUntil;
 if(mode==='revoked')configureWhatsAppConcierge(async()=>{state.link.revoked_at='synthetic-revocation';return 'SYNTHETIC';});
 await route(runtime,[{...event(mode),receivedAt:new Date(state.clock).toISOString()}]);await runtime.maintain();assert.equal(stats.attempts,0);
 if(['expired','not-allowlisted'].includes(mode))assert.equal(stats.engine,0,'admission blocks before invoking Concierge');
 if(mode==='rollback')assert.equal(quotaRows(state).length,0,'quota reservation rolls back with dispatch marker');
 if(mode==='lost-ack'){assert.equal(quotaRows(state)[0].used,1,'uncertain committed reservation is not refunded');assert.equal(stats.engine,0);assert.equal((await runtime.dispatch(key(mode))).status,'preparing');assert.equal(stats.engine,0);}
 }finally{await runtime.dispose();}
}
{
 const {options,state,stats}=setup();let entered;const started=new Promise(r=>entered=r);let aborted=false;
 options.request=async(_url,{signal})=>{stats.attempts++;entered();return new Promise((_,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Error('SYNTHETIC_ABORT'));},{once:true});});};
 const runtime=await createInfobipWhatsAppProduction(options);await route(runtime,[event('shutdown')]);await started;await runtime.dispose();assert(aborted);assert.equal(quotaRows(state)[0].used,1);assert.equal(stats.attempts,1);assert.equal(stats.cleared,1);
 const before=state.queries.length;assert.equal((await runtime.dispatch(key('shutdown'))).status,'closed');assert.equal(state.queries.length,before);
}
{
 const {options,state,stats}=setup();const runtime=await createInfobipWhatsAppProduction(options);try {await eraseWhatsAppAccountState(state.link.email);assert.equal(state.link.consent_concierge,0);await route(runtime,[event('unlinked')]);await runtime.maintain();assert.equal(stats.attempts,0);}finally{await runtime.dispose();}
}
{
 const proposal={provider:'infobip',sender,recipient,messageId:'cc-'+'a'.repeat(64),replyToMessageId:'synthetic-in',text:'SYNTHETIC',bindingStamp:JSON.stringify(['synthetic-owner','1','infobip',sender,recipient])};
 for(const response of [new Response('{}',{status:401}),new Response('{}',{status:429}),new Response('{}',{status:500}),{status:200,redirected:true},new Response('{'),new Response('x'.repeat(16385))]) {
  let calls=0;const transport=createInfobipProductionTextTransport({sender,baseUrl,apiKey:secrets.apiKey,request:async(_url,request)=>{calls++;assert.equal(request.redirect,'error');return response;}});assert.equal(transport.exercise,undefined);assert.equal((await transport.send(proposal)).status,'uncertain');assert.equal(calls,1,'never retry uncertain provider responses');
 }
 const {db,state}=fixture();const admission=createInfobipSendAdmission(policy,{sender,now:()=>state.clock});const store=createInfobipProductionStore({db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>state.clock},{concierge:async()=> 'SYNTHETIC',send:async()=>assert.fail(),admission});assert.equal(store.exerciseDispatch,undefined);
}
{
 const {options,stats,state}=setup();let signal;
 options.credentials.resolve=async(_ref,{signal:provided})=>{signal=provided;return new Promise(()=>{});};
 await assert.rejects(()=>createInfobipWhatsAppProduction(options),{message:'INFOBIP_PRODUCTION_UNAVAILABLE'});assert(signal.aborted);assert.equal(state.queries.length,0);assert.equal(stats.scheduled,0);
}
{
 const {options,stats}=setup();let entered;const started=new Promise(r=>entered=r);let abortSeen=false;
 configureWhatsAppConcierge(async({signal})=>{assert(signal);entered();return new Promise(resolve=>signal.addEventListener('abort',()=>{abortSeen=true;resolve('LATE SYNTHETIC REPLY');},{once:true}));});
 const runtime=await createInfobipWhatsAppProduction(options);await route(runtime,[event('engine-shutdown')]);await started;await runtime.dispose();assert(abortSeen);assert.equal(stats.attempts,0);
}
{
 let calls=0,signal;
 const transport=createInfobipProductionTextTransport({sender,baseUrl,apiKey:secrets.apiKey,timeoutMs:5,request:async(_url,request)=>{calls++;signal=request.signal;return new Promise(()=>{});}});
 const proposal={provider:'infobip',sender,recipient,messageId:'cc-'+'a'.repeat(64),replyToMessageId:'synthetic-timeout',text:'SYNTHETIC',bindingStamp:JSON.stringify(['synthetic-owner','1','infobip',sender,recipient])};
 assert.equal((await transport.send(proposal)).status,'uncertain');assert.equal(calls,1);assert(signal.aborted);
}
{
 const {options,stats}=setup();options.scheduler.clear=()=>{stats.cleared++;throw Error('PRIVATE_SCHEDULER_DETAIL');};
 const runtime=await createInfobipWhatsAppProduction(options);await assert.rejects(()=>runtime.dispose(),{message:'INFOBIP_SHUTDOWN'});assert.equal(stats.cleared,1);await assert.rejects(()=>runtime.dispose(),{message:'INFOBIP_SHUTDOWN'});assert.equal(stats.cleared,1);
 // Ownership is released even when the scheduler reports a clear failure.
 const replacement=setup();const next=await createInfobipWhatsAppProduction(replacement.options);await next.dispose();
}
configureWhatsAppConcierge(null);
console.log('PASS production composition default OFF, explicit references/bindings, SELECT-only preflight, trusted ingress, durable quantity admission, rollback/restart/policy conflict, canonical engine/revocation/lifecycle/shutdown, bounded transport without retries; synthetic dependencies only');
