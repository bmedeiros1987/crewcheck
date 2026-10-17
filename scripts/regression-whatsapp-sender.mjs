import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractWhatsAppEvents, extractWhatsAppInboundMessages, extractWhatsAppStatusDiagnostics } from '../server/whatsapp.mjs';

const source = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const section = (a,b) => source.slice(source.indexOf(a), source.indexOf(b,source.indexOf(a)));
// Synthetic IDs; neither screenshot IDs nor live credentials are used.
const BR='111111111111111', UK='222222222222222';
let configured=BR, calls=[], links=0, completes=0, sends=[], current;
const active={email:'a@example.invalid',linked_at:'2026-10-03 16:00:00.001',consent_concierge:1};
let engine=async ({email})=>`private:${email}`;
const context=vm.createContext({
 dispatchWhatsAppVisitor:async()=>false,whatsappVisitorEnabled:()=>false,whatsappPdfEnabled:()=>false,whatsappPdfConfiguration:null,
 whatsappMenuEnabled:()=>false,
 phoneNumberId:()=>configured, normalizePhone:v=>String(v||''),
 findActiveLinkByPhone:async()=>{links++;return current;},
 tryCompleteLink:async()=>{completes++;return {linked:true};},
 whatsappConciergeHandler:async input=>{calls.push(input);return engine(input);},
 sendWhatsAppText:async(...args)=>{sends.push(args);return {ok:true};},
 console:{error:()=>{},info:()=>{},warn:()=>{}},
});
vm.runInContext(section('async function handleInboundMessage(', '\nasync function processWhatsAppPayload('),context);
const message=(phoneNumberId=BR,text='oi',from='5511111111111')=>({phoneNumberId,text,from,type:'text',id:'synthetic-id'});
const reset=()=>{configured=BR;calls=[];links=0;completes=0;sends=[];current={...active};engine=async({email})=>`private:${email}`;};
for(const receiver of [UK,'unknown','',undefined]) {
 reset();for(const text of ['oi','123456']) await context.handleInboundMessage({...message(),phoneNumberId:receiver,text});
 assert.equal(links+completes+calls.length+sends.length,0,'unapproved receiver must not link, load, compute or send');
}
reset();configured='';await context.handleInboundMessage(message());assert.equal(links+sends.length,0);
for(const sender of [BR,UK]) {
 reset();configured=sender;await context.handleInboundMessage(message(sender));
 assert.equal(calls.length,1);assert.equal(sends.length,1);assert.equal(sends[0][2].expectedPhoneNumberId,sender);
 assert.equal(sends[0][1],'private:a@example.invalid');
 await context.handleInboundMessage(message(sender,'123456'));assert.equal(completes,1);
}
for(const replacement of [null,{...active,revoked_at:'now'},{...active,consent_concierge:0},{...active,email:'b@example.invalid'},{...active,linked_at:'2026-10-03 16:00:00.002'}]) {
 reset();engine=async()=>{current=replacement;return 'stale private answer';};
 await context.handleInboundMessage(message());assert.equal(sends.length,0,'revocation/account/relink during await must suppress stale answer');
}
reset();current=null;await context.handleInboundMessage(message());assert.equal(calls.length,0);assert.match(sends[0][1],/conecte este WhatsApp/);
reset();current={...active,consent_concierge:0};await context.handleInboundMessage(message());assert.equal(calls.length+sends.length,0);
reset();await context.handleInboundMessage(message());current={...active,email:'b@example.invalid'};
await context.handleInboundMessage(message(BR,'oi','5522222222222'));
assert.equal(sends[0][0],'5511111111111');assert.equal(sends[1][0],'5522222222222');assert.equal(sends[1][1],'private:b@example.invalid');

let network=[];
const transport=vm.createContext({phoneNumberId:()=>configured,accessToken:()=> 'synthetic-token',normalizePhone:v=>v,
 graphVersion:()=> 'v26.0',AbortController,setTimeout,clearTimeout,
 fetch:async(url,options)=>{network.push({url,options});return {ok:true,json:async()=>({messages:[{id:'synthetic-out'}]})};},
 console:{info:()=>{},warn:()=>{}},
});
vm.runInContext(section('export async function sendWhatsAppText(', '\nasync function findActiveLinkByPhone(').replace('export ',''),transport);
configured=BR;
for(const expectedPhoneNumberId of [UK,'unknown','',null,undefined]) {
 const result=await transport.sendWhatsAppText('5511111111111','synthetic',{expectedPhoneNumberId});
 assert.equal(result.code,'WHATSAPP_SENDER_MISMATCH');
}
assert.equal(network.length,0);
await transport.sendWhatsAppText('5511111111111','synthetic',{expectedPhoneNumberId:BR});
assert.equal(network.length,1);assert.match(network[0].url,new RegExp('/'+BR+'/messages$'));
configured=UK;assert.equal((await transport.sendWhatsAppText('5511111111111','synthetic',{expectedPhoneNumberId:BR})).code,'WHATSAPP_SENDER_MISMATCH');
assert.equal(network.length,1,'configuration drift must not switch reply sender');

let deliveries=0;const claimed=new Set();
const processing=vm.createContext({dispatchWhatsAppVisitor:async()=>false,whatsappVisitorEnabled:()=>false,whatsappPdfEnabled:()=>false,whatsappPdfConfiguration:null,payloadHash:()=> 'synthetic-hash',extractWhatsAppEvents,extractWhatsAppInboundMessages,extractWhatsAppStatusDiagnostics,
 claimInMemory:id=>{if(claimed.has(id))return false;claimed.add(id);return true;},claimPersistentEvent:async()=>true,
 handleInboundMessage:async()=>{deliveries++;},console:{info:()=>{},warn:()=>{}},
});
vm.runInContext(section('async function processWhatsAppPayload(', '\nfunction webhookHealth('),processing);
const payload={entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:BR},messages:[{id:'synthetic-in',from:'5511111111111',type:'text',text:{body:'oi'}}]}}]}]};
await processing.processWhatsAppPayload(payload,'{}');await processing.processWhatsAppPayload(payload,'{}');assert.equal(deliveries,1);
const status={entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:BR},statuses:[{id:'synthetic-out',status:'failed',timestamp:'1',errors:[{code:130497,title:'Business account is restricted from messaging users in this country'}]}]}}]}]};
await processing.processWhatsAppPayload(status,'{}');assert.equal(deliveries,1,'status callbacks never trigger replies or retries');
assert.deepEqual(extractWhatsAppStatusDiagnostics(status)[0].errorCodes,['130497']);
assert.match(source,/phone_hash=\? AND revoked_at IS NULL/);
console.log('PASS configured BR/UK only; unknown/missing receiver blocked before linking; sender drift; A/B, consent, revoke/relink; dedup and 130497 status without reply; zero real APIs');
