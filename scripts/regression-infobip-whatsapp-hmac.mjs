import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {verifyInfobipHmac, createInfobipWebhookAuthenticator} from '../server/infobip-whatsapp-auth.mjs';
import {createOfflineInfobipReceiver, INFOBIP_WHATSAPP_RELEASE_ENABLED} from '../server/infobip-whatsapp-candidate.mjs';
import {createOfflineInfobipDeliveryReceiver} from '../server/infobip-whatsapp-delivery.mjs';
import {createInfobipWhatsAppRuntime, INFOBIP_WHATSAPP_CALLBACK_PATH} from '../server/infobip-whatsapp-runtime.mjs';

globalThis.fetch=()=>assert.fail('NO_REAL_NETWORK');
// Exact SYNTHETIC signing vector from support ticket 5517884, 2026-10-21.
// Not an inbound/delivery schema, credential, destination or readiness proof.
const secret='dummy-secret-key';
const vector=Buffer.from('{"results":[{"messageId":"synthetic-0001","to":"385000000000","status":{"groupName":"DELIVERED"}}]}','utf8');
const digest='7c98b585e61b53dd53a63410a0b57f3ae2aa8eca754e64f89b9bdf33210b455f';
const sign=(body,key=secret)=>['x-hub-signature','SHA256='+createHmac('sha256',Buffer.from(key,'utf8')).update(body).digest('hex').toUpperCase()];
assert.equal(createHmac('sha256',secret).update(vector).digest('hex'),digest);
for(const value of ['SHA256='+digest.toUpperCase(),'sha256='+digest,'ShA256='+digest.toUpperCase()]) assert(verifyInfobipHmac(['X-HuB-SiGnAtUrE',value],vector,secret));
for(const headers of [[],['x-hub-signature','sha256='+digest+'='],['x-hub-signature',digest],['x-hub-signature','sha256='+digest+' '],['x-hub-signature','sha256='+digest.slice(1)],['x-hub-signature','sha256='+digest.replace(/^./,'g')],['x-hub-signature','sha256='+Buffer.from(digest,'hex').toString('base64')],[...sign(vector),...sign(vector)],['x-hub-signature',sign(vector)[1]+','+sign(vector)[1]],['x-hub-signature-256',sign(vector)[1]],['x-hub-signature',sign(vector)[1],'odd']]) assert.equal(verifyInfobipHmac(headers,vector,secret),false);
for(const body of [Buffer.concat([vector,Buffer.from('\n')]),Buffer.from(JSON.stringify(JSON.parse(vector),null,2)),vector.toString(),Buffer.alloc(65537)]) assert.equal(verifyInfobipHmac(sign(vector),body,secret),false);
const key='  café-e\u0301-密钥 \n';const unicode=Buffer.from('{"text":"olá ☕"}\r\n','utf8');
assert(verifyInfobipHmac(sign(unicode,key),unicode,key));
for(const changed of [key.trim(),key.normalize('NFC'),Buffer.from(key).toString('hex'),Buffer.from(key).toString('base64')])assert.equal(verifyInfobipHmac(sign(unicode,key),unicode,changed),false);
assert(verifyInfobipHmac([...sign(vector),'x-unsigned','changed'],vector,secret));
const config={mode:'hmac-sha256',secretKey:secret},auth=createInfobipWebhookAuthenticator(config);config.secretKey='changed';config.mode='basic';assert(auth.verify(sign(vector),vector));
const basic=createInfobipWebhookAuthenticator({mode:'basic',username:'synthetic',password:'synthetic-password-never-a-real-secret'});
const basicHeader=['authorization','Basic '+Buffer.from('synthetic:synthetic-password-never-a-real-secret').toString('base64')];
assert.equal(auth.verify(basicHeader,vector),false);assert.equal(basic.verify(sign(vector),vector),false);assert(basic.verify(basicHeader,vector));
for(const cfg of [null,{mode:'auto'},{mode:'hmac-sha256',secretKey:''},{mode:'hmac-sha256',secretKey:Buffer.from(secret)}])assert.throws(()=>createInfobipWebhookAuthenticator(cfg));
console.log('PASS exact support vector, case, raw bytes, literal UTF-8/no trim, malformed/duplicate headers, policy snapshot, distinct Basic/HMAC modes');

const sender='12025550100',recipient='12025550101',now=Date.parse('2032-01-01T12:00:00.000Z');
const item={from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:'2032-01-01T12:00:00.000Z',messageId:'synthetic-replay',message:{type:'TEXT',text:'SYNTHETIC'}};
const body=Buffer.from(JSON.stringify({results:[item]}));
const claims=new Map(),queue=[];let transactions=0,tail=Promise.resolve();
const store={transaction(fn){const work=tail.then(async()=>{transactions++;const local=new Map(claims),pending=[];const result=await fn({lookupLink:async()=>({accountId:'synthetic-owner',revision:'1',provider:'infobip',sender,recipient,consentConcierge:true,revoked:false}),claim:async(k,d)=>{if(local.has(k))return local.get(k)===d?'duplicate':'conflict';local.set(k,d);return 'new';},enqueue:async job=>pending.push(job)});for(const [k,v]of local)claims.set(k,v);queue.push(...pending);return result;});tail=work.catch(()=>{});return work;}};
const make=key=>createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:key},store,now:()=>now});
const packet=(rawBody=body,key=secret)=>({method:'POST',rawHeaders:sign(rawBody,key),rawBody});
assert.equal((await make(secret)({...packet(),rawHeaders:basicHeader})).status,401);assert.equal(transactions,0);
assert.equal((await make(secret)(packet(vector))).status,400,'signing vector must never be accepted as event schema');assert.equal(transactions,0);
const results=await Promise.all(Array.from({length:8},()=>make(secret)(packet())));assert.equal(results.reduce((s,r)=>s+r.accepted,0),1);assert.equal(queue.length,1);
assert.equal((await make('rotated-synthetic-key')(packet(body,'rotated-synthetic-key'))).duplicates,1,'replay namespace survives key rotation and receiver recreation');
const changed=Buffer.from(JSON.stringify({results:[{...item,message:{type:'TEXT',text:'CONFLICT'}}]}));assert.equal((await make(secret)(packet(changed))).status,503);assert.equal(queue.length,1);
let deliveryCalls=0;const delivery=createOfflineInfobipDeliveryReceiver({authentication:{mode:'hmac-sha256',secretKey:secret},store:{recordDelivery:async()=>{deliveryCalls++;return{status:'delivered'};}},now:()=>now});
assert.equal((await delivery(packet(vector))).status,400);assert.equal(deliveryCalls,0);
const report={messageId:'cc-'+'a'.repeat(64),to:recipient,sentAt:'2032-01-01T11:59:00.000Z',doneAt:'2032-01-01T12:00:00.000Z',status:{groupId:3,groupName:'DELIVERED',id:5,name:'DELIVERED_TO_HANDSET'}};
assert.equal((await delivery(packet(Buffer.from(JSON.stringify({results:[report]}))))).status,200);assert.equal(deliveryCalls,1);
assert.equal((await delivery(packet(Buffer.from(JSON.stringify({results:[{...report,seenAt:report.doneAt}]}))))).status,400);assert.equal(deliveryCalls,1,'SEEN is not silently treated as delivery');
console.log('PASS authenticated strict schemas, concurrent/recreated receiver replay, credential rotation, conflicting ID, separate delivery/SEEN; synthetic transactions only');

let connections=0,scheduled=0;const policy={mode:'hmac-sha256',secretKey:secret};
const runtime=createInfobipWhatsAppRuntime({enabled:true,db:{getConnection(){connections++;throw Error('FORBIDDEN_DATABASE');}},configuration:{sender,encryptionKey:Buffer.alloc(32,7),linkHashKey:'synthetic-link-hash-key-never-real-123456',baseUrl:'https://synthetic.api.infobip.com',apiKey:'synthetic-api-key-no-network',webhookAuthentication:policy},scheduler:{set(){scheduled++;return 1;},clear(){}},request(){assert.fail('NO_SEND');},now:()=>now});
policy.secretKey='mutated';
async function route(rawBody,headers){const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',rawHeaders:headers,headers:{'content-type':'application/json'},socket:{encrypted:true}});const res={writeHead(status){this.status=status;},end(value){this.value=value;this.writableEnded=true;}};await runtime.handleRoute(req,res,new URL(INFOBIP_WHATSAPP_CALLBACK_PATH,'https://example.invalid'));return res;}
try{assert.equal((await route(Buffer.from('{'),sign(vector))).status,401,'authenticate exact bytes before parse');assert.equal((await route(Buffer.from('{'),sign(Buffer.from('{')))).status,400);assert.equal((await route(vector,basicHeader)).status,401);assert.equal((await route(vector,sign(vector))).status,400,'valid auth does not prove real schema');assert.equal(connections,0);assert.equal(scheduled,1);}finally{await runtime.dispose();}
assert.equal(INFOBIP_WHATSAPP_RELEASE_ENABLED,false);assert.equal(createInfobipWhatsAppRuntime().health().enabled,false);
console.log('PASS raw HTTP HMAC-before-parse, snapshot secret, no DB on rejected auth/schema, production still sealed OFF; zero external sends');
