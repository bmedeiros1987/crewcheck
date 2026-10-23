import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createInfobipWhatsAppProduction} from '../server/infobip-whatsapp-production.mjs';
import {configureWhatsAppConcierge,invokeConfiguredWhatsAppConcierge,withWhatsAppConciergeQuiesced} from '../server/whatsapp.mjs';
import {eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';
import {fixture,sender,recipient,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_NETWORK');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const turn=()=>new Promise(r=>setTimeout(r,0));
const writer=fs.readFileSync('scripts/v14410/apply.mjs','utf8');
const literal=writer.match(/const whatsappBinding = (`[\s\S]*?`);/);assert(literal,'actual canonical writer binding');
const rawBinding=vm.runInNewContext(literal[1]);
const prepared=fs.readFileSync('server.mjs','utf8').match(/configureWhatsAppConcierge\(async \(\{ email, text(?:, location)?(?:, signal)? \}\) => \{[\s\S]*?\n\}\);(?=\n\nhttp\.createServer)/)?.[0];
// Raw runs the exact binding emitted by its writer, prepared runs that server's
// actual binding too. Neither replaces it with a cooperative abort mock.
const bindings=[['writer',rawBinding],...(prepared?[['prepared',prepared]]:[])];
for(const [origin,binding]of bindings)for(const mode of ['snapshot-shutdown','engine-shutdown','snapshot-revoke']){
 const {state,db}=fixture(),gate=defer(),entered=defer();let effects=0,engines=0,attempts=0;
 vm.runInNewContext(binding,{configureWhatsAppConcierge,
   conciergeLoadSnapshot:async()=>{if(mode!=='engine-shutdown'){entered.resolve();await gate.promise;}return {name:'Synthetic'};},
   buildTelegramConciergeReply:async()=>{engines++;if(mode==='engine-shutdown'){entered.resolve();await gate.promise;effects++;}return 'SYNTHETIC';},
 });
 const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
 const options={enabled:true,db,now:()=>state.clock,configuration:{sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',
  credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/encryption',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},deploymentBinding:{profileId:'synthetic-profile',subscriptionIds:['synthetic-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}},
  credentials:{resolve:async(_ref,{purpose})=>secrets[purpose]},ingress:{mode:'direct-tls',publicOrigin},admission:{id:'synthetic-canonical',maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+60000,recipients:[recipient]},scheduler:{set:()=>1,clear(){}},request:async()=>{attempts++;assert.fail('NO_SEND_AFTER_CANCEL');}};
 const runtime=await createInfobipWhatsAppProduction(options);let completion;
 try{
  const id='synthetic-'+origin+'-'+mode;
  const rawBody=Buffer.from(JSON.stringify({results:[{from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(epoch).toISOString(),messageId:id,message:{type:'TEXT',text:'SYNTHETIC'}}]}));
  const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex')],headers:{host:'crewcheck.example.invalid','content-type':'application/json'},socket:{encrypted:true}});
  const res={writeHead(status){this.status=status;},end(){this.writableEnded=true;}};
  await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));assert.equal(res.status,200);await entered.promise;
  let finished=false;
  completion=(mode==='snapshot-revoke'?eraseWhatsAppAccountState(state.link.email):runtime.dispose()).then(()=>{finished=true;});
  await turn();const completedBeforeSettle=finished;
  if(mode==='snapshot-revoke')await assert.rejects(()=>invokeConfiguredWhatsAppConcierge({email:state.link.email,text:'SYNTHETIC NEW',messageId:'blocked-during-revoke'}),/WHATSAPP_ENGINE_UNAVAILABLE/);
  gate.resolve();await completion;await runtime.dispose();
  assert.equal(completedBeforeSettle,false,origin+' '+mode+': completion must wait for actual canonical work, even when it ignores abort');
  assert.equal(attempts,0);
  if(mode!=='engine-shutdown'){assert.equal(engines,0,'abort after snapshot must fence the next canonical phase');assert.equal(effects,0);}
  const after=effects;await turn();assert.equal(effects,after,'no untracked effect after confirmed shutdown/revocation');
  const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex');
  assert.notEqual(state.rows.get('crewcheck-infobip-inbound-v1:'+eventKey)?.status,'accepted_unconfirmed');
 }finally{gate.resolve();await completion?.catch(()=>{});await runtime.dispose();configureWhatsAppConcierge(null);}
}
for(const [origin,binding]of bindings){
 const a=defer(),b=defer(),enteredA=defer(),enteredB=defer();let writesA=0,writesB=0,ack=false;
 vm.runInNewContext(binding,{configureWhatsAppConcierge,
  conciergeLoadSnapshot:async profile=>{if(profile.email==='a@example.invalid'){enteredA.resolve();await a.promise;}else{enteredB.resolve();await b.promise;}return {name:'Synthetic'};},
  buildTelegramConciergeReply:async(_text,profile)=>{if(profile.email==='a@example.invalid')writesA++;else writesB++;return 'SYNTHETIC';},
 });
 const jobA=invokeConfiguredWhatsAppConcierge({email:'a@example.invalid',text:'SYNTHETIC',messageId:'a'});jobA.catch(()=>{});
 const jobB=invokeConfiguredWhatsAppConcierge({email:'b@example.invalid',text:'SYNTHETIC',messageId:'b'});jobB.catch(()=>{});
 await Promise.all([enteredA.promise,enteredB.promise]);
 const revocation=withWhatsAppConciergeQuiesced('a@example.invalid',async()=>{ack=true;});
 b.resolve();assert.equal(await jobB,'SYNTHETIC');assert.equal(writesB,1);assert.equal(ack,false,origin+' owner A remains pending independently of B');
 a.resolve();await assert.rejects(()=>jobA,/WHATSAPP_ENGINE_UNAVAILABLE/);await revocation;assert.equal(writesA,0);assert.equal(ack,true);configureWhatsAppConcierge(null);
}
{
 const gate=defer(),inside=defer();
 configureWhatsAppConcierge(async()=> 'SYNTHETIC');
 const first=withWhatsAppConciergeQuiesced('a@example.invalid',async()=>{});
 const second=withWhatsAppConciergeQuiesced('a@example.invalid',async()=>{inside.resolve();await gate.promise;});
 await first;await inside.promise;
 await assert.rejects(()=>invokeConfiguredWhatsAppConcierge({email:'a@example.invalid',text:'SYNTHETIC'}),/WHATSAPP_ENGINE_UNAVAILABLE/);
 gate.resolve();await second;assert.equal(await invokeConfiguredWhatsAppConcierge({email:'a@example.invalid',text:'SYNTHETIC'}),'SYNTHETIC');configureWhatsAppConcierge(null);
}
console.log('PASS actual canonical writer/prepared binding: noncooperative snapshot/engine work remains tracked; shutdown/revocation completion waits; later phases and provider send fenced');
