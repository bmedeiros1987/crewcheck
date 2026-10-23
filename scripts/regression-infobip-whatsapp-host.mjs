import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {createHash,createHmac} from 'node:crypto';
import {createInfobipProductionTextTransport} from '../server/infobip-whatsapp-transport.mjs';
import {Readable} from 'node:stream';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInfobipWhatsAppHost,createInfobipNodeRequest,createInfobipNodeScheduler} from '../server/infobip-whatsapp-host.mjs';
import {configureWhatsAppConcierge} from '../server/whatsapp.mjs';
import {fixture,sender,recipient,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_NETWORK');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,0));
const origin='https://synthetic.example.invalid',baseUrl='https://synthetic.api.infobip.com';
function setup() {
 const {state,db}=fixture();const stats={loads:0,pools:0,registered:0,removed:0,scheduled:0,cleared:0,resolved:0,sends:0};let stop;
 configureWhatsAppConcierge(async()=> 'SYNTHETIC');
 const dependencies={configuration:{sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',
  credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/encryption',linkHashKey:'fixture/link',webhookSecret:'fixture/hmac'},
  deploymentBinding:{profileId:'fixture',subscriptionIds:['fixture'],sender,baseUrl,publicOrigin:origin,linkHashKeyReference:'fixture/link'}},
  getPool:async()=>{stats.pools++;return db;},now:()=>epoch,
  credentials:{async resolve(_ref,{purpose}){stats.resolved++;return secrets[purpose];}},
  admission:{id:'synthetic-host',recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+3600000},
  scheduler:{set(){stats.scheduled++;return 1;},clear(){stats.cleared++;}},
  request(){stats.sends++;assert.fail('NO_PROVIDER_SEND');}};
 const options={enabled:true,listener:https.createServer(),ingress:{mode:'direct-tls',publicOrigin:origin},load:async()=>{stats.loads++;return dependencies;},
  lifecycle:{registerShutdown(fn){stats.registered++;stop=fn;return ()=>{stats.removed++;};}}};
 return {state,stats,dependencies,options,stop:()=>stop()};
}
{
 const host=createInfobipWhatsAppHost({enabled:false,get load(){assert.fail();},get ingress(){assert.fail();},get lifecycle(){assert.fail();}});
 assert.equal((await host.start()).enabled,false);await host.dispose();assert.equal(host.health().enabled,false);
}
for(const change of [o=>delete o.listener,o=>o.listener=http.createServer(),o=>o.listener={encrypted:true},o=>delete o.ingress,o=>o.ingress.mode='trusted-boundary',o=>o.ingress.mode='forwarded-headers',o=>delete o.lifecycle,o=>delete o.load]) {
 const {options,stats,state}=setup();change(options);const host=createInfobipWhatsAppHost(options);
 await assert.rejects(host.start(),/HOST_UNAVAILABLE/);assert.equal(stats.loads,0);assert.equal(state.queries.length,0);await host.dispose();
}
{
 const {options,stats}=setup();const host=createInfobipWhatsAppHost(options);const a=host.start(),b=host.start();assert.equal(a,b);
 assert.equal((await a).enabled,true);assert.equal(stats.loads,1);assert.equal(stats.pools,1);assert.equal(stats.registered,1);assert.equal(stats.scheduled,1);
 const req=Readable.from(['ignored']);req.method='POST';req.headers={host:new URL(origin).host,'x-forwarded-proto':'https','content-type':'application/json'};req.socket={encrypted:false};req.rawHeaders=[];
 const res={writeHead(s){this.status=s;},end(){}};await host.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',origin));assert.equal(res.status,503);
 assert.equal(stats.sends,0);await Promise.all([host.dispose(),host.dispose()]);assert.equal(stats.cleared,1);assert.equal(stats.removed,1);
 await assert.rejects(host.start(),/HOST_CLOSED/);assert.equal(host.health().ready,false);
}
{
 const {options,stats,stop}=setup();const gate=deferred(),entered=deferred();
 configureWhatsAppConcierge(async()=>{entered.resolve();await gate.promise;return 'LATE SYNTHETIC';});
 const host=createInfobipWhatsAppHost(options);await host.start();
 const id='host-lifecycle',body=JSON.stringify({results:[{from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(epoch).toISOString(),messageId:id,message:{type:'TEXT',text:'SYNTHETIC'}}]});
 const signature='SHA256='+createHmac('sha256',secrets.webhookSecret).update(body).digest('hex');
 const req=Readable.from([body]);req.method='POST';req.socket={encrypted:true};req.headers={host:new URL(origin).host,'content-type':'application/json'};req.rawHeaders=['X-Hub-Signature',signature];
 const res={writeHead(status){this.status=status;},end(){}};await host.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',origin));assert.equal(res.status,200);
 await entered.promise;let done=false;const completion=stop().then(()=>{done=true;});await tick();assert.equal(done,false);
 const forbidden=new Proxy({},{get(){assert.fail('closed route cannot consume input');}});const closedRes={writeHead(status){this.status=status;},end(){}};
 await host.handleRoute(forbidden,closedRes,new URL('/api/infobip/whatsapp/webhook',origin));assert.equal(closedRes.status,503);
 gate.resolve();await completion;assert.equal(stats.sends,0);assert.equal(stats.cleared,1);assert.equal(stats.removed,1);
 const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex');assert.equal((await host.dispatch(eventKey)).status,'closed');
}
{
 const {options,stats}=setup();options.lifecycle.registerShutdown=()=>()=>{stats.removed++;throw Error('PRIVATE_LIFECYCLE_DETAIL');};
 const host=createInfobipWhatsAppHost(options);await host.start();await assert.rejects(host.dispose(),{message:'INFOBIP_HOST_SHUTDOWN'});assert.equal(stats.removed,1);assert.equal(stats.cleared,1);await assert.rejects(host.dispose(),{message:'INFOBIP_HOST_SHUTDOWN'});assert.equal(stats.removed,1);
}
for(const phase of ['load','pool','credentials']) {
 const {options,dependencies,stats,stop:shutdown}=setup();const gate=deferred();
 if(phase==='load')options.load=async()=>{stats.loads++;await gate.promise;return dependencies;};
 if(phase==='pool')dependencies.getPool=async()=>{stats.pools++;await gate.promise;return fixture().db;};
 if(phase==='credentials')dependencies.credentials.resolve=async(_ref,{purpose})=>{stats.resolved++;await gate.promise;return secrets[purpose];};
 const host=createInfobipWhatsAppHost(options);const start=host.start();await tick();let drained=false;const stop=shutdown();stop.then(()=>{drained=true;});await tick();assert.equal(drained,false);
 gate.resolve();await start;await stop;assert.equal(stats.sends,0);assert.equal(stats.removed,1);assert.equal(stats.scheduled,phase==='credentials'?1:0);assert.equal(stats.cleared,stats.scheduled);
}
{
 const {options,stats,state}=setup();options.load=async()=>{throw Error('PRIVATE_DETAIL');};const host=createInfobipWhatsAppHost(options);
 await assert.rejects(host.start(),{message:'INFOBIP_HOST_UNAVAILABLE'});assert.equal(stats.removed,1);assert.equal(state.queries.length,0);await host.dispose();assert.equal(stats.removed,1);
}
{
 const {options,dependencies,stats}=setup();dependencies.getPool=async()=>null;const host=createInfobipWhatsAppHost(options);await assert.rejects(host.start(),/HOST_UNAVAILABLE/);assert.equal(stats.resolved,0);await host.dispose();
}
{
 let period,callback,cleared;const scheduler=createInfobipNodeScheduler({setInterval(fn,ms){callback=fn;period=ms;return 7;},clearInterval(id){cleared=id;}});
 let ran=false;const id=scheduler.set(()=>{ran=true;});assert.equal(period,10000);assert.equal(ran,false);callback();assert.equal(ran,true);scheduler.clear(id);assert.equal(cleared,7);
}
// Execute the actual generated bootstrap fragment; it must remain OFF even if
// real-looking environment switches exist. No imports, pool or network execute.
{
 const {composeHeldInfobipRoute}=await import('./p1-infobip-whatsapp-off/compose.mjs');
 const source=composeHeldInfobipRoute("import { configureWhatsAppConcierge, handleWhatsAppRoute } from './server/whatsapp.mjs';\nconfigureWhatsAppConcierge(async ({ email, text }) => {\n  return text;\n});\n\nhttp.createServer(async (req, res) => {\n  if (await handleWhatsAppRoute(req, res, url)) return;\n});");
 assert(source.indexOf('await infobipWhatsAppRuntime.start();')>source.indexOf('configureWhatsAppConcierge(async'));
 assert.equal(composeHeldInfobipRoute(source),source);
 const instance=source.match(/const infobipWhatsAppRuntime = .*;/)[0];
 await vm.runInNewContext(`(async()=>{${instance}\nawait infobipWhatsAppRuntime.start();return infobipWhatsAppRuntime.health();})()`,{createInfobipWhatsAppHost}).then(h=>assert.equal(h.enabled,false));
 const server=fs.readFileSync('server.mjs','utf8');
 if(server.includes('createInfobipWhatsAppHost();'))assert(server.indexOf('await infobipWhatsAppRuntime.start();')>server.lastIndexOf('configureWhatsAppConcierge(async'));
}
// Native HTTP machinery over owned loopback only, with a trusted test opener
// mapping the synthetic HTTPS address. This proves request/abort/body behavior,
// not TLS certificate validation or the real hosting boundary.
{
 let behavior='normal';let calls=0;const sockets=new Set();const server=http.createServer((req,res)=>{calls++;if(behavior==='large'){res.writeHead(200);res.end('x'.repeat(16385));}else if(behavior==='lost'){req.socket.destroy();}else if(behavior==='stall'){res.writeHead(200);res.write('prefix');}else if(req.url==='/redirect'){res.writeHead(302,{location:'/target'});res.end('ignored');}else if(req.url==='/stall'){res.writeHead(200);res.write('prefix');}else {res.writeHead(200);res.end('{"synthetic":true}');}});
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;let opens=0;
 const request=createInfobipNodeRequest((url,options,cb)=>{opens++;assert.equal(url.protocol,'https:');assert.equal(options.agent,false);return http.request({hostname:'127.0.0.1',port,path:url.pathname,...options},cb);});
 const options=()=>({method:'POST',redirect:'error',headers:{'content-type':'application/json'},signal:new AbortController().signal,body:'SYNTHETIC'});
 try {
  const good=await request('https://synthetic.example.invalid/ok',options());assert.equal(good.status,200);assert.equal(await new Response(good.body).text(),'{"synthetic":true}');
  const before=calls;const redirect=await request('https://synthetic.example.invalid/redirect',options());assert.equal(redirect.status,302);assert.equal(redirect.body,null);await tick();assert.equal(calls,before+1,'no redirect/retry');
  const controller=new AbortController();const stalled=await request('https://synthetic.example.invalid/stall',{...options(),signal:controller.signal});const reader=stalled.body.getReader();await reader.read();controller.abort();await assert.rejects(reader.read());
  const proposal={provider:'infobip',sender,recipient,messageId:'cc-'+'a'.repeat(64),replyToMessageId:'synthetic-native',text:'SYNTHETIC',bindingStamp:JSON.stringify(['synthetic-owner','1','infobip',sender,recipient])};
  for(const mode of ['large','lost','stall']) {
   behavior=mode;const before=opens;const transport=createInfobipProductionTextTransport({sender,baseUrl,apiKey:secrets.apiKey,request,timeoutMs:30});
   assert.equal((await transport.send(proposal)).status,'uncertain');assert.equal(opens,before+1,'one native request, no retries for '+mode);
  }
  behavior='normal';
  const attempts=opens;const aborted=new AbortController();aborted.abort();await assert.rejects(request('https://synthetic.example.invalid/ok',{...options(),signal:aborted.signal}),/HTTP_UNAVAILABLE/);assert.equal(opens,attempts);
  await assert.rejects(request('http://synthetic.example.invalid/ok',options()),/HTTP_UNAVAILABLE/);assert.equal(opens,attempts);
 } finally {for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}
}
configureWhatsAppConcierge(null);
console.log('PASS host OFF/bootstrap, explicit pool/lifecycle, concurrent start/stop, untrusted ingress rejection, native loopback HTTP redirect/abort; externalCalls=0');
