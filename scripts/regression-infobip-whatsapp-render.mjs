import {withConciergeConversationWritesOnly,restrictConciergeSnapshotWrite,isConciergeConversationWritesOnly} from '../server/concierge-read-only-scope.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {createInfobipWhatsAppApplicationHost} from '../server/infobip-whatsapp-application.mjs';
import {createInfobipWhatsAppSingleTestHost,validateInfobipSingleTestPolicy,INFOBIP_SINGLE_TEST_APPROVAL,INFOBIP_SINGLE_TEST_INPUT,INFOBIP_SINGLE_TEST_REPLY} from '../server/infobip-whatsapp-single-test.mjs';
import {Readable} from 'node:stream';
import {createHmac,createHash} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInfobipWhatsAppHost,createInfobipRenderHttpServer} from '../server/infobip-whatsapp-host.mjs';
import {createInfobipWhatsAppProduction} from '../server/infobip-whatsapp-production.mjs';
import {createInfobipSqlStore} from '../server/infobip-whatsapp-store.mjs';
import {createInfobipInboundReceiver} from '../server/infobip-whatsapp-candidate.mjs';
import {configureWhatsAppConcierge} from '../server/whatsapp.mjs';
import {menuGreeting} from '../server/concierge/telegram-menu.mjs';
import {fixture,sender,recipient,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
import {configureSyntheticOperationalPilot,configureSyntheticPilotRenewal} from './fixtures/infobip-operational-pilot.mjs';
import {INFOBIP_OPERATIONAL_PILOT_INPUTS} from '../server/infobip-whatsapp-operational-pilot.mjs';
const prepared=process.argv.includes('--prepared'),origin='https://crewcheck.synthetic.invalid',path='/api/infobip/whatsapp/webhook';
const serviceId='srv-syntheticcrewcheck',baseUrl='https://synthetic.api.infobip.com';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_FETCH');
const nextTurn=()=>new Promise(r=>setTimeout(r,0));
const source=fs.readFileSync('server.mjs','utf8');
let functions,operationalDependencies;
if(prepared){
 const ts=createRequire(import.meta.url)('typescript');
 const tree=ts.createSourceFile('server.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 functions=new Map(tree.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(tree)]));
 assert(source.includes("from './server/infobip-whatsapp-single-test.mjs';"),'actual restricted application caller import required');
 assert(source.includes('const infobipHttpServer = createInfobipRenderHttpServer('),'real prepared bootstrap required');
 operationalDependencies={};
 for(const module of ['v1404/telegram-language','concierge/journey-programs','concierge/stay-menu','concierge/pharmacy-reference','v14410/wellhub-concierge','v14354/concierge-language','v14408/concierge-human'])Object.assign(operationalDependencies,await import('../server/'+module+'.mjs'));
 for(const [name,value]of Object.entries(await import('../server/v14336/concierge-personality.mjs')))operationalDependencies[name+'V14336']=value;
 for(const [name,value]of Object.entries(await import('../server/v14341/concierge-semantic.mjs')))operationalDependencies[name.replace('V14341','V14338')]=value;
}
function setup(){
 const {state,db}=fixture();const stats={loads:0,registered:0,removed:0,resolved:0,scheduled:0,cleared:0,engine:0,writes:0,sends:[],ticks:[]};
 const ingress={mode:'render-managed-hmac',trustModel:'render-edge-tls-private-http',serviceId,publicOrigin:origin,callbackPaths:[path]};
 const dependencies={getPool:async()=>db,now:()=>state.clock,configuration:{sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',
  credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/encryption',linkHashKey:'fixture/link',webhookSecret:'fixture/hmac'},
  deploymentBinding:{profileId:'fixture',subscriptionIds:['fixture'],sender,baseUrl,publicOrigin:origin,linkHashKeyReference:'fixture/link',renderServiceId:serviceId,callbackPaths:[path]}},
  credentials:{async resolve(_ref,{purpose}){stats.resolved++;return secrets[purpose];}},
  admission:{id:'synthetic-render-approved',recipients:[recipient],maxAttempts:2,validFrom:epoch-1000,validUntil:epoch+3600000},
  scheduler:{set(fn){stats.scheduled++;stats.ticks.push(fn);return 1;},clear(){stats.cleared++;}},
  request:async(_url,{body})=>{const message=JSON.parse(body);stats.sends.push(message);return new Response(JSON.stringify({to:message.to,messageId:message.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));}};
 const options={enabled:true,ingress,load:async()=>{stats.loads++;return dependencies;},lifecycle:{registerShutdown(){stats.registered++;return ()=>{stats.removed++;};}}};
 return {state,stats,db,options,dependencies};
}
function applicationOptions(f){
 const configuration=structuredClone(f.dependencies.configuration);
 configuration.credentialReferences={apiKey:'env:CREWCHECK_INFOBIP_WHATSAPP_API_KEY',encryptionKey:'env:CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY',linkHashKey:'env:CREWCHECK_WHATSAPP_AUDIT_SALT',webhookSecret:'env:CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET'};
 configuration.deploymentBinding.linkHashKeyReference=configuration.credentialReferences.linkHashKey;
 const policy={version:1,ingress:f.options.ingress,configuration,admission:structuredClone(f.dependencies.admission)};
 if(f.operationalPilot){policy.mode='operational-pilot-v1';policy.maxCostUsd='0.05';}
 if(f.singleTest){policy.mode='single-neutral-reply-v1';policy.maxCostUsd='0.02';configuration.singleMessageTest=true;policy.admission.id=INFOBIP_SINGLE_TEST_APPROVAL;policy.admission.maxAttempts=1;policy.admission.validUntil=epoch+600_000;}
 if(f.linkHandshake)configuration.canonicalLinkHandshake=true;
 if(f.linkOnly)configuration.canonicalLinkHandshakeOnly=true;
 const environment={RENDER_SERVICE_ID:serviceId,CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(policy),
  CREWCHECK_INFOBIP_WHATSAPP_API_KEY:secrets.apiKey,CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY:secrets.encryptionKey.toString('base64'),
  CREWCHECK_WHATSAPP_AUDIT_SALT:secrets.linkHashKey,CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET:secrets.webhookSecret};
 const signals=new EventEmitter();signals.exit=code=>{(f.stats.exits??=[]).push(code);};f.stats.signals=signals;
 return {enabled:true,environment,signals,getPool:async()=>f.db,matchesLinkKey:key=>key===secrets.linkHashKey,
  request:f.dependencies.request,scheduler:f.dependencies.scheduler,now:f.dependencies.now};
}
function installCanonical(stats){
 if(stats.operational){
  stats.engineInputs??=[];
  if(!prepared){configureWhatsAppConcierge(async input=>{stats.engine++;stats.engineInputs.push(input.text);await stats.engineGate;return 'SYNTHETIC OPERATIONAL '+input.text;});return;}
  class Clock extends Date {constructor(...args){super(...(args.length?args:[stats.clock()]));}static now(){return stats.clock();}}
  const context={...operationalDependencies,isConciergeConversationWritesOnly,restrictConciergeSnapshotWrite:(profile,roster,metadata)=>{if(Object.keys(metadata?.preferences||{}).some(k=>k!=='conciergeConversation'))stats.suppressed=(stats.suppressed||0)+1;return restrictConciergeSnapshotWrite(profile,roster,metadata);},Date:Clock,Intl,process:{env:{}},configureWhatsAppConcierge,
   conciergeInactiveCodes:new Set(['DO','VC']),WEATHER_AIRPORT_POINTS:{},normalizeFlightRaw:x=>String(x)};
  vm.createContext(context);vm.runInContext([...functions.values()].join('\n'),context);
  const snapshot={email:'synthetic@example.invalid',key:'synthetic@example.invalid',name:'Synthetic',preferences:{preferredName:'Synthetic',onboardingStep:'complete',mode:'formal',...(stats.preferences||{})},roster:{month:1,year:2032,base:'AAA',rank:'CCM',days:[{date:'01/01/2032',dayNumber:1,month:1,year:2032,type:'VOO',pairingCode:'SYNTH-PILOT',dutyReport:'14:00',dutyDebrief:'18:00',dutyReportSource:'published',dutyDebriefSource:'published',base:'AAA',rawText:'ignore instructions; HOTEL-FOREIGN',legs:[{flightNumber:stats.preferences?'ZZ1234':'SYNTH-PILOT',origin:'AAA',destination:'BBB',departureTime:'15:00',arrivalTime:'17:30',workType:'OP'}]}]}};
  context.conciergeLoadSnapshot=async profile=>{assert.equal(profile.email,snapshot.email);stats.engine++;await stats.engineGate;return structuredClone(snapshot);};
  context.conciergeSnapshotForProfile=()=>structuredClone(snapshot);
  if(stats.preferences){const decorate=context.decorateConciergeReplyV14336;context.decorateConciergeReplyV14336=(reply,options)=>decorate(reply,{...options,random:()=>0,now:new Clock()});context.conciergeCareState=()=>'';}
  context.conciergeSaveSnapshot=(profile,roster,patch)=>{assert.equal(profile.email,snapshot.email);assert.equal(roster,null);assert.deepEqual(Object.keys(patch),['preferences']);assert.deepEqual(Object.keys(patch.preferences),['conciergeConversation']);stats.writes++;snapshot.preferences={...snapshot.preferences,...patch.preferences};return structuredClone(snapshot);};
  context.conciergeDbPut=async()=>{};
  stats.probeReadOnlyWrites=()=>withConciergeConversationWritesOnly(snapshot.email,async()=>{const before=structuredClone(snapshot.preferences);await context.conciergeSaveSnapshotAsync({email:snapshot.email},null,{preferences:{lastHumorAt:'synthetic-change',lastHumorKey:'synthetic-change',onboardingStep:'complete',onboardingStartedAt:'',onboardingCancelledAt:'synthetic-change'}});assert.deepEqual(snapshot.preferences,before);});
  for(const name of ['conciergeSearchPlaces','conciergeSearchNearbyHealthPlacesAtReference','conciergeWeatherReply','conciergeRadarReply'])context[name]=()=>assert.fail('NO_EXTERNAL_OPERATIONAL_CAPABILITY');
  const actual=context.buildTelegramConciergeReply;context.buildTelegramConciergeReply=async(text,...args)=>{stats.engineInputs.push(text);return actual(text,...args);};
  const binding=source.match(/configureWhatsAppConcierge\(async \(\{ email, text, location, signal \}\) => \{[\s\S]*?\n\}\);(?=\n\nconst infobipHttpServer)/)?.[0];assert(binding);vm.runInContext(binding,context);return;
 }
 if(!prepared){configureWhatsAppConcierge(async()=>{stats.engine++;await stats.engineGate;return menuGreeting('Synthetic');});return;}
 const snapshot={name:'Synthetic',preferences:{},roster:{days:[]}};
 const context={configureWhatsAppConcierge,menuGreeting,Date,Intl,
  conciergeLoadSnapshot:async profile=>{assert.equal(profile.email,'synthetic@example.invalid');stats.engine++;await stats.engineGate;return snapshot;},
  conciergeSaveSnapshotAsync:async(profile,_a,_patch)=>{assert.equal(profile.email,'synthetic@example.invalid');stats.writes++;return snapshot;},
  conciergeStayRecords:()=>[],conciergeLocationContextV14335:()=>({fresh:false}),stayMenuReply:async()=>({handled:false}),conciergePreferenceCommandV14336:async()=>({handled:false,snapshot}),pharmacyReferenceReply:async()=>({handled:false}),
  conciergeSemanticInputContextV14338:()=>({}),interpretConciergeNaturalTextV14338:()=>({intent:'explicit_command'}),
  isWellhubPlanPreferenceMessage:()=>false,isWellhubPlanDeclarationMessage:()=>false,isWellhubActivityPreferenceMessage:()=>false,
  conciergeSafeKey:x=>x,isConciergeContextFreshV14338:()=>false,normalizeConciergeNaturalTextV14338:x=>x.toLowerCase(),
  conciergeSemanticCommandIntentV14338:()=> 'help',conciergeSemanticResolveV14338:async()=>({handled:false}),
  conciergeSemanticFindRecordV14338:()=>null,conciergeSemanticRecordExtraV14338:()=>({}),buildConciergeContextV14338:()=>({}),
  decorateConciergeReplyV14336:reply=>({reply,humorApplied:false}),conciergePreferencesV14336:()=>({}),conciergeProgramRecords:()=>[],
  conciergeFinalizeReplyV14354:x=>x,conciergeHumanizeReplyV14408:x=>x,
  conciergeIdentityFlow:async()=>({handled:false,snapshot}),conciergeDayForKey:()=>null,conciergeDateKey:()=> '2032-01-01',
  conciergeEasterEggReply:()=>'',preferredUserName:profile=>profile.name,
 };
 vm.createContext(context);
 for(const name of ['normalizeConciergeButtonText','conciergeHelp','buildTelegramConciergeReplyCore','buildTelegramConciergeReply']){
  assert(functions.has(name),name+' exact prepared implementation');vm.runInContext(functions.get(name),context);
 }
 const binding=source.match(/configureWhatsAppConcierge\(async \(\{ email, text, location, signal \}\) => \{[\s\S]*?\n\}\);(?=\n\nconst infobipHttpServer)/)?.[0];
 assert(binding,'actual prepared canonical binding');vm.runInContext(binding,context);
}
async function makeServer(f,off=false){
 installCanonical(f.stats);let server,host;
 if(prepared){
  const start=source.indexOf('const infobipHttpServer = createInfobipRenderHttpServer(async (req, res) => {');
  const end=source.indexOf('\nawait infobipWhatsAppRuntime.start(infobipHttpServer);',start);assert(start>=0&&end>start);
  const declaration=source.match(/const infobipWhatsAppRuntime = createInfobipWhatsAppHost\(\);/)[0];
  const context={URL,createInfobipRenderHttpServer,createInfobipWhatsAppHost:()=>(f.singleTest?createInfobipWhatsAppSingleTestHost:createInfobipWhatsAppApplicationHost)(off?{}:applicationOptions(f)),applyCrewCheckSecurityHeaders:()=>{}};
  vm.createContext(context);vm.runInContext(declaration+'\n'+source.slice(start,end),context);
  await vm.runInContext('(async()=>{await infobipWhatsAppRuntime.start(infobipHttpServer);})()',context);
  server=vm.runInContext('infobipHttpServer',context);host=vm.runInContext('infobipWhatsAppRuntime',context);
 }else{
  host=(f.singleTest?createInfobipWhatsAppSingleTestHost:createInfobipWhatsAppApplicationHost)(off?{}:applicationOptions(f));
  server=createInfobipRenderHttpServer(async(req,res)=>{await host.handleRoute(req,res,new URL(req.url,'http://'+req.headers.host));});
  await host.start(server);
 }
 const sockets=new Set();server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {host,server,port:server.address().port,async close(){await host.dispose();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};
}
const event=id=>({from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(epoch).toISOString(),messageId:id,message:{type:'TEXT',text:'/ajuda'}});
const signed=body=>'SHA256='+createHmac('sha256',secrets.webhookSecret).update(body).digest('hex');
async function post(port,body,{route=path,host=new URL(origin).host,signature=signed(body),headers={}}={}){
 return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:route,method:'POST',agent:false,headers:{Host:host,'Content-Type':'application/json','X-Hub-Signature':signature,...headers}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text}));});req.once('error',reject);req.end(body);});
}
async function drain(server,stats){
 for(let i=0;i<20;i++){await nextTurn();await server.host.dispatch('0'.repeat(64));if(stats.sends.length)return;}
 assert.fail('synthetic canonical reply did not dispatch');
}
{
 const forbidden=new Proxy({},{get(){assert.fail('OFF_APP_DEPENDENCY_READ');}});
 const app=createInfobipWhatsAppApplicationHost({enabled:false,get environment(){return forbidden.any;},get signals(){return forbidden.any;},get getPool(){return forbidden.any;}});
 assert.equal((await app.start(forbidden)).enabled,false);await app.dispose();
}
{
 const forbidden=new Proxy({},{get(){assert.fail('CLOSED_APP_ENV_READ');}});
 const app=createInfobipWhatsAppApplicationHost({enabled:true,environment:forbidden,signals:new EventEmitter()});
 const start=app.start(createInfobipRenderHttpServer());const draining=app.dispose();await assert.rejects(start,/APPLICATION_UNAVAILABLE/);await draining;
}
for(const change of [o=>o.environment.RENDER_SERVICE_ID='srv-wrong',o=>o.environment.CREWCHECK_INFOBIP_WHATSAPP_POLICY='{}',o=>o.matchesLinkKey=()=>false,o=>o.environment.CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY='invalid']){
 const f=setup(),options=applicationOptions(f);change(options);installCanonical(f.stats);const app=createInfobipWhatsAppApplicationHost(options);
 await assert.rejects(app.start(createInfobipRenderHttpServer()),/APPLICATION_UNAVAILABLE/);await app.dispose();assert.equal(f.stats.sends.length,0);assert.equal(f.stats.engine,0);
}
// Host policy barriers before dependencies, not flags supplied in a webhook.
for(const change of [o=>o.listener=http.createServer(),o=>o.listener=Object.setPrototypeOf(http.createServer(),http.Server.prototype),o=>o.listener=https.createServer(),o=>o.ingress.trustModel='headers',o=>o.ingress.serviceId='',o=>o.ingress.callbackPaths=['/api/whatsapp/webhook'],o=>o.ingress.publicOrigin='http://crewcheck.synthetic.invalid']){
 const f=setup();f.options.listener=createInfobipRenderHttpServer();change(f.options);const host=createInfobipWhatsAppHost(f.options);
 await assert.rejects(host.start(),/HOST_UNAVAILABLE/);assert.equal(f.stats.loads,0);assert.equal(f.stats.registered,0);assert.equal(f.stats.resolved,0);assert.equal(f.state.queries.length,0);await host.dispose();
}
for(const change of [d=>d.configuration.authentication='basic',d=>d.configuration.deploymentBinding.renderServiceId='srv-another',d=>d.configuration.deploymentBinding.callbackPaths=['/api/infobip/whatsapp/seen'],d=>d.configuration.deploymentBinding.publicOrigin='https://another.invalid']){
 const f=setup();change(f.dependencies);f.options.listener=createInfobipRenderHttpServer();installCanonical(f.stats);const host=createInfobipWhatsAppHost(f.options);await assert.rejects(host.start(),/HOST_UNAVAILABLE/);assert.equal(f.stats.resolved,0);assert.equal(f.state.queries.length,0);await host.dispose();
}
{
 const f=setup(),s=await makeServer(f,true);try{const before=f.state.queries.length;assert.equal((await post(s.port,'not JSON')).status,503);assert.equal(f.stats.loads,0);assert.equal(f.state.queries.length,before);assert.equal(f.stats.sends.length,0);}finally{await s.close();}
}
{
 const f=setup(),s=await makeServer(f);try{
  assert.equal(s.host.health().transport,'managed-http');assert.equal(s.host.health().proxyAuthenticated,false);
  const before=f.state.queries.length;
  assert.equal((await post(s.port,'{broken',{signature:'SHA256='+'0'.repeat(64),headers:{'X-Forwarded-Proto':'https','X-Render-Service-Id':serviceId}})).status,401);
  assert.equal(f.state.queries.length,before);assert.equal(f.stats.engine,0,'invalid HMAC before parse/SQL/engine');
  assert.equal((await post(s.port,'{broken')).status,400,'only valid HMAC reaches JSON parsing');assert.equal(f.state.queries.length,before);
  const body=JSON.stringify({results:[event('render-main')]});
  assert.equal((await post(s.port,body,{host:'another.invalid',headers:{'X-Forwarded-Host':new URL(origin).host,'X-Forwarded-Proto':'https'}})).status,503);
  assert.equal((await post(s.port,body,{route:'/api/infobip/whatsapp/seen'})).status,503);
  assert.equal((await post(s.port,body,{route:path+'?alternate=1'})).status,503);assert.equal(f.state.queries.length,before);
  assert.equal((await post(s.port,body)).status,200,'actual HTTP socket, no forwarded headers required');await drain(s,f.stats);
  assert.equal(f.stats.engine,1);assert.equal(f.stats.sends.length,1);assert.equal(f.stats.sends[0].to,recipient);assert.match(f.stats.sends[0].content.text,/CrewCierge, assistente do CrewCheck/);
  const key=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,'render-main'])).digest('hex');
  const sent=f.state.rows.get('crewcheck-infobip-inbound-v1:'+key);assert.equal(sent.status,'accepted_unconfirmed');
  // Exact retry, different outer counters, and unsigned headers cannot create a reply.
  for(const packet of [body,JSON.stringify({results:[event('render-main')],messageCount:900,pendingMessageCount:13})])assert.equal((await post(s.port,packet,{headers:{'X-Forwarded-Proto':'http'}})).status,200);
  await nextTurn();assert.equal(f.stats.sends.length,1);assert.equal(f.stats.engine,1);
  const doneAt=new Date(epoch+1000).toISOString(),report={messageId:'cc-'+key,to:recipient,sentAt:new Date(epoch).toISOString(),doneAt,status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
  assert.equal((await post(s.port,JSON.stringify({results:[report]}))).status,200);
  assert.equal((await post(s.port,JSON.stringify({results:[{messageId:report.messageId,from:sender,to:recipient,sentAt:report.sentAt,seenAt:new Date(epoch+2000).toISOString()}]}))).status,200);
  assert.equal(f.stats.engine,1);assert.equal(f.stats.sends.length,1);
  const extra=['render-quota-a','render-quota-b'];assert.equal((await post(s.port,JSON.stringify({results:extra.map(event)}))).status,200);
  await Promise.all(extra.map(id=>s.host.dispatch(createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex'))));
  assert.equal(f.stats.engine,2);assert.equal(f.stats.sends.length,2,'durable quantity fences before engine');
  f.state.clock=epoch+9*86400000;assert.equal((await post(s.port,body)).status,200);assert.equal(f.stats.engine,2);assert.equal(f.stats.sends.length,2);
 }finally{await s.close();assert.equal(f.stats.signals.listenerCount('SIGTERM'),0);assert.equal(f.stats.signals.listenerCount('SIGINT'),0);assert.equal(f.stats.cleared,1);}
}
for(const change of [s=>s.link.consent_concierge=0,s=>s.link.revoked_at='synthetic-revoked',s=>s.link=null]){
 const f=setup();change(f.state);const s=await makeServer(f);try{await post(s.port,JSON.stringify({results:[event('denied')]}));await nextTurn();assert.equal(f.stats.engine,0);assert.equal(f.stats.sends.length,0);}finally{await s.close();}
}
// Noncooperative work remains tracked through actual HTTP-host shutdown.
{
 const f=setup();let release;f.stats.engineGate=new Promise(r=>release=r);const s=await makeServer(f);
 try {
  await post(s.port,JSON.stringify({results:[event('shutdown')]}));for(let i=0;i<20&&!f.stats.engine;i++)await nextTurn();assert.equal(f.stats.engine,1);
  let finished=false;const stopping=s.host.dispose().then(()=>{finished=true;});await nextTurn();assert.equal(finished,false);
  const before=f.state.queries.length;assert.equal((await post(s.port,JSON.stringify({results:[event('closed')]}))).status,503);assert.equal(f.state.queries.length,before);
  release();await stopping;assert.equal(f.stats.sends.length,0);assert.equal(f.stats.cleared,1);
 }finally{release();await s.close();}
}
// Concrete application coordinator receives SIGTERM, closes the actual listener,
// drains canonical work, and exits only after completion. Process is a fixture.
{
 const f=setup();let release;f.stats.engineGate=new Promise(r=>release=r);const s=await makeServer(f);
 try {
  await post(s.port,JSON.stringify({results:[event('signal-shutdown')]}));for(let i=0;i<20&&!f.stats.engine;i++)await nextTurn();assert.equal(f.stats.engine,1);
  f.stats.signals.emit('SIGTERM');await nextTurn();assert.deepEqual(f.stats.exits??[],[]);
  await assert.rejects(post(s.port,JSON.stringify({results:[event('after-signal')]})));
  release();for(let i=0;i<20&&!f.stats.exits?.length;i++)await nextTurn();assert.deepEqual(f.stats.exits,[0]);assert.equal(f.stats.sends.length,0);
 }finally{release();await s.close();}
}
// A second registered listener with correct host/signature cannot borrow the binding.
{
 const f=setup(),s=await makeServer(f);const foreign=createInfobipRenderHttpServer(async(req,res)=>s.host.handleRoute(req,res,new URL(req.url,'http://'+req.headers.host)));
 await new Promise(r=>foreign.listen(0,'127.0.0.1',r));try{const before=f.state.queries.length;assert.equal((await post(foreign.address().port,JSON.stringify({results:[event('foreign-listener')]}))).status,503);assert.equal(f.state.queries.length,before);}finally{await new Promise(r=>foreign.close(r));await s.close();}
}
// Explicitly enabled canonical handshake uses no provider send or quota row.
{
 const f=setup();f.singleTest=true;f.linkHandshake=true;f.linkOnly=true;
 // Persist a paid reply candidate through the actual receiver/store, with no
 // dispatcher. A new handshake-only host must not resume that held work.
 const store=createInfobipSqlStore({db:f.db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>epoch});
 const receive=createInfobipInboundReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:secrets.webhookSecret},store,now:()=>epoch});
 const id='synthetic-prior-held-paid',rawBody=Buffer.from(JSON.stringify({results:[{...event(id),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}]}));
 assert.equal((await receive({method:'POST',rawBody,rawHeaders:['X-Hub-Signature',signed(rawBody)]})).accepted,1);
 const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex');
 const stateKey='crewcheck-infobip-inbound-v1:'+eventKey;
 assert.equal(f.state.rows.get(stateKey).status,'held');assert(f.state.rows.get(stateKey).sealed);
 let s=await makeServer(f);
 try{
  assert.equal((await s.host.dispatch(eventKey)).status,'blocked');
  assert.equal(f.state.rows.get(stateKey).status,'cancelled');assert.equal(f.state.rows.get(stateKey).sealed,null);
  await s.close();s=await makeServer(f);await s.host.dispatch(eventKey);
  assert.equal(f.stats.engine,0);assert.equal(f.stats.sends.length,0);
  assert(![...f.state.rows.values()].some(row=>row.kind==='infobip_send_admission'));
 }finally{await s.close();}
}
for(const linkOnly of [false,true]) {
 const f=setup();f.singleTest=true;f.linkHandshake=true;f.linkOnly=linkOnly;f.state.link=null;
 f.state.linkChallenge={email:'synthetic@example.invalid',codeHash:createHmac('sha256',secrets.linkHashKey).update('crewcheck-whatsapp-link|123456').digest('hex'),expiresAt:epoch+600000};
 let s=await makeServer(f);
 const code=id=>JSON.stringify({results:[{...event(id),message:{type:'TEXT',text:'123456'}}]});
 try{
  const before=f.state.queries.length;
  assert.equal((await post(s.port,code('bad-link-auth'),{signature:'SHA256='+'0'.repeat(64)})).status,401);
  assert.equal((await post(s.port,JSON.stringify({results:[{...event('wrong-link-recipient'),from:'12025550102',message:{type:'TEXT',text:'123456'}}]}))).status,200);
  assert.equal(f.state.queries.length,before,'HMAC/recipient denied before SQL');
  await Promise.all(Array.from({length:4},()=>post(s.port,code('canonical-link'))));await nextTurn();
  assert.equal(f.state.link.email,'synthetic@example.invalid');assert.equal(f.state.link.consent_alerts,0);assert.equal(f.state.linkChallenge,null);
  assert.equal(f.stats.sends.length,0);assert.equal(f.stats.engine,0);
  assert(![...f.state.rows.values()].some(row=>row.kind==='infobip_send_admission'||row.status==='held'));
  await s.close();s=await makeServer(f);await post(s.port,code('canonical-link'));await nextTurn();
  assert.equal(f.stats.sends.length,0,'link retry after restart is ACK only');
  const beforeTest=f.state.queries.length;
  await post(s.port,JSON.stringify({results:[{...event('test-after-link'),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}]}));if(linkOnly)await nextTurn();else await drain(s,f.stats);
  assert.equal(f.stats.sends.length,linkOnly?0:1);assert.equal(f.stats.engine,0);
  if(linkOnly){
   assert.equal(f.state.queries.length,beforeTest,'link-only rejects even the approved paid test before SQL');
   assert(![...f.state.rows.values()].some(row=>row.kind==='infobip_send_admission'||row.status==='held'));
   await s.close();s=await makeServer(f);await post(s.port,JSON.stringify({results:[{...event('test-after-link-restart'),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}]}));await nextTurn();
   assert.equal(f.stats.sends.length,0,'restart never enables a paid reply in link-only mode');
  }else assert.equal(f.stats.sends[0].content.text,INFOBIP_SINGLE_TEST_REPLY);
 }finally{await s.close();}
}
// Restricted caller: authenticated exact opt-in only, no account tools, one
// durable reservation across concurrent callbacks and a full host restart.
{
 const f=setup();f.singleTest=true;let s=await makeServer(f);
 const packet=id=>JSON.stringify({results:[{...event(id),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}]});
 try{
  const before=f.state.queries.length;
  assert.equal((await post(s.port,packet('bad-auth'),{signature:'SHA256='+'0'.repeat(64)})).status,401);
  for(const item of [{...event('wrong-text')},{...event('code'),message:{type:'TEXT',text:'123456'}},{...event('before-window'),receivedAt:new Date(epoch-2000).toISOString(),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}},{...event('other-user'),from:'5511999999999',message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}])
   assert.equal((await post(s.port,JSON.stringify({results:[item]}))).status,200);
  assert.equal(f.state.queries.length,before,'unrelated input must not mutate links or ledger');
  await Promise.all(['one','two'].map(id=>post(s.port,packet(id))));await drain(s,f.stats);
  assert.equal(f.stats.engine,0,'neutral smoke test must not invoke account tools');
  assert.equal(f.stats.sends.length,1);assert.equal(f.stats.sends[0].content.text,INFOBIP_SINGLE_TEST_REPLY);
  await s.close();s=await makeServer(f);
  await post(s.port,packet('after-restart'));await drain(s,f.stats);assert.equal(f.stats.sends.length,1);
 }finally{await s.close();}
 const valid=JSON.parse(applicationOptions(f).environment.CREWCHECK_INFOBIP_WHATSAPP_POLICY);
 for(const change of [p=>p.admission.maxAttempts=2,p=>p.admission.recipients.push('5511999999999'),p=>p.admission.id+='reset',p=>p.maxCostUsd='1',p=>p.admission.validUntil=epoch+86400000,p=>p.configuration.canonicalLinkHandshakeOnly=true,p=>{p.configuration.canonicalLinkHandshake=true;p.configuration.canonicalLinkHandshakeOnly='true';}]){
  const p=structuredClone(valid);change(p);assert.throws(()=>validateInfobipSingleTestPolicy(p));
  const h=createInfobipWhatsAppSingleTestHost({environment:{CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(p),get CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET(){assert.fail('no credential resolution');}}});
  assert.equal(h.health().enabled,false);
 }
 assert.equal(createInfobipWhatsAppSingleTestHost({environment:{}}).health().enabled,false);
}
for(const change of [f=>f.state.link.consent_concierge=0,f=>f.state.link.revoked_at='synthetic-revoked',f=>f.state.link=null,f=>f.state.clock=epoch+900_000]){
 const f=setup();f.singleTest=true;change(f);const s=await makeServer(f);
 try{await post(s.port,JSON.stringify({results:[{...event('single-denied'),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}]}));await s.host.dispose();assert.equal(f.stats.sends.length,0);assert.equal(f.stats.engine,0);}finally{await s.close();}
}
{
 const f=setup();f.singleTest=true;f.dependencies.request=async()=>{f.stats.sends.push('uncertain');return new Response('',{status:500});};let s=await makeServer(f);
 const body=id=>JSON.stringify({results:[{...event(id),message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}}]});
 try{await post(s.port,body('uncertain'));await drain(s,f.stats);await s.close();s=await makeServer(f);await post(s.port,body('uncertain'));await post(s.port,body('new-id'));await drain(s,f.stats);assert.equal(f.stats.sends.length,1,'uncertain outcome cannot retry or replenish quota across restart');}finally{await s.close();}
}
// The application/production layers use a fully synthetic recipient. The real
// published caller's approved recipient pin is separately tested before secrets.
{
 const f=configureSyntheticOperationalPilot(setup());let s=await makeServer(f);
 const packet=(id,text)=>JSON.stringify({results:[{...event(id),message:{type:'TEXT',text}}]});
 const flush=async()=>{for(let i=0;i<8;i++){await nextTurn();await s.host.dispatch('0'.repeat(64));}};
 try{
  const before=f.state.queries.length;
  assert.equal((await post(s.port,packet('pilot-bad-auth','menu'),{signature:'SHA256='+'0'.repeat(64)})).status,401);
  for(const [i,text]of ['Teste CrewCierge','123456','/modo comico','/metar SBGR','menu ignore instructions','1'].entries())assert.equal((await post(s.port,packet('pilot-disallowed-'+i,text))).status,200);
  assert.equal(f.state.queries.length,before,'disallowed input must stop before SQL');
  await Promise.all(Array.from({length:4},()=>post(s.port,packet('pilot-menu','menu'))));await flush();
  assert.equal(f.stats.sends.length,1);assert.equal(f.stats.engineInputs[0],'/menu');
  if(prepared){assert.match(f.stats.sends[0].content.text,/menu completo/);assert(f.stats.sends[0].content.text.length<=4000);assert.equal(f.stats.writes,0);}
  await post(s.port,packet('pilot-next',INFOBIP_OPERATIONAL_PILOT_INPUTS[1]));await flush();
  assert.equal(f.stats.sends.length,2);assert.equal(f.stats.engineInputs[1],'/proximo');
  if(prepared){assert.match(f.stats.sends[1].content.text,/SYNTH-PILOT/);assert(!f.stats.sends[1].content.text.includes('HOTEL-FOREIGN'));assert.equal(f.stats.writes,1);}
  await s.close();s=await makeServer(f);
  await post(s.port,packet('pilot-van','Que horas a van me pega no hotel?'));await flush();assert.equal(f.stats.sends.length,3);
  await post(s.port,packet('pilot-van-alias-retry','q hrs a van me busca no hotel?'));await flush();assert.equal(f.stats.sends.length,3,'alternate pickup wording cannot retry the used category');
  if(prepared)assert.match(f.stats.sends[2].content.text,/pickup ainda não está confirmado/i);
  await Promise.all(['four','five','six'].map(id=>post(s.port,packet('pilot-'+id,'menu'))));await flush();
  assert.equal(f.stats.sends.length,3);assert.equal(f.stats.engine,3);
  const quota=[...f.state.rows.values()].find(r=>r.kind==='infobip_send_admission');assert.equal(quota.used,3);assert.equal(quota.limit,3);
 }finally{await s.close();}
}
{
 const f=configureSyntheticOperationalPilot(setup());let s=await makeServer(f);
 const packet=(id,text,at=f.state.clock)=>JSON.stringify({results:[{...event(id),receivedAt:new Date(at).toISOString(),message:{type:'TEXT',text}}]});
 const flush=async()=>{for(let i=0;i<8;i++){await nextTurn();await s.host.dispatch('0'.repeat(64));}};
 try{
  for(const [i,text]of INFOBIP_OPERATIONAL_PILOT_INPUTS.slice(0,2).entries()){
   const id='renewal-prior-'+i;await post(s.port,packet(id,text));await flush();
   const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex');
   const report={messageId:'cc-'+eventKey,to:recipient,sentAt:new Date(epoch).toISOString(),doneAt:new Date(epoch+1000).toISOString(),status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
   assert.equal((await post(s.port,JSON.stringify({results:[report]}))).status,200);
  }
  assert.equal(f.stats.sends.length,2);const originalQuota=structuredClone([...f.state.rows.values()].find(r=>r.kind==='infobip_send_admission'));
  await s.close();configureSyntheticPilotRenewal(f);s=await makeServer(f);
  await post(s.port,packet('renewal-old-window','Que horas a van me pega no hotel?',epoch));await flush();assert.equal(f.stats.sends.length,2);
  await Promise.all(Array.from({length:4},()=>post(s.port,packet('renewal-pickup','Que horas a van me busca no hotel?'))));await flush();
  assert.equal(f.stats.sends.length,3);if(prepared)assert.match(f.stats.sends[2].content.text,/pickup ainda não está confirmado/i);
  const renewed=[...f.state.rows.values()].find(r=>r.kind==='infobip_send_admission');
  assert.equal(renewed.used,3);assert.equal(renewed.digest,originalQuota.digest);assert.equal(renewed.validUntil,originalQuota.validUntil);assert.equal(renewed.execution.revision,1);
  await s.close();s=await makeServer(f);await post(s.port,packet('renewal-alias-retry','q hrs a van me pega no hotel?'));await flush();assert.equal(f.stats.sends.length,3);
  f.state.clock=f.dependencies.configuration.operationalPilotRenewal.validUntil;await post(s.port,packet('renewal-expired','Que horas a van me pega no hotel?'));await flush();assert.equal(f.stats.sends.length,3);
 }finally{await s.close();}
}
for(const scenario of ['uncertain','expired-during-engine','revoked-during-engine','owner-changed-before-engine','owner-changed-before-first-receipt','owner-changed-during-engine']){
 const f=configureSyntheticOperationalPilot(setup());let release;
 if(scenario.endsWith('during-engine'))f.stats.engineGate=new Promise(resolve=>release=resolve);
 if(scenario==='uncertain')f.dependencies.request=async()=>{f.stats.uncertainCalls=(f.stats.uncertainCalls||0)+1;throw Error('SYNTHETIC_REMOTE_ACK_LOST');};
 let s=await makeServer(f);
 const body=id=>JSON.stringify({results:[{...event(id),message:{type:'TEXT',text:'menu'}}]});
 const flush=async()=>{for(let i=0;i<8;i++){await nextTurn();await s.host.dispatch('0'.repeat(64));}};
 try{
  if(scenario==='owner-changed-before-first-receipt'){
   f.state.owner='synthetic-account-B';await post(s.port,body('pilot-foreign-first'));await flush();assert.equal(f.stats.engine,0);assert.equal(f.stats.sends.length,0);assert.equal([...f.state.rows.values()].filter(r=>r.kind==='infobip_send_admission').length,0);continue;
  }
  if(scenario==='owner-changed-before-engine'){
   // Commit a held receipt without triggering the host scheduler, then change
   // only the synthetic canonical owner before the real dispatcher reads it.
   const st=createInfobipSqlStore({db:f.db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>f.state.clock});
   const receive=createInfobipInboundReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:secrets.webhookSecret},store:st,now:()=>f.state.clock,queueLinkConfirmation:false});
   const rawBody=Buffer.from(body('pilot-owner-change'));await receive({method:'POST',rawHeaders:['X-Hub-Signature',signed(rawBody)],rawBody});f.state.owner='synthetic-account-B';await flush();
   assert.equal(f.stats.engine,0);assert.equal(f.stats.sends.length,0);continue;
  }
  await post(s.port,body('pilot-'+scenario));
  if(release){while(f.stats.engine===0)await nextTurn();if(scenario==='expired-during-engine')f.state.clock=epoch+600000;else if(scenario==='owner-changed-during-engine')f.state.owner='synthetic-account-B';else f.state.link.consent_concierge=0;release();}
  await flush();assert.equal(f.stats.sends.length,0);
  const quota=[...f.state.rows.values()].find(r=>r.kind==='infobip_send_admission');assert.equal(quota.used,1);
  if(scenario==='uncertain'){
   assert.equal(f.stats.uncertainCalls,1);await s.close();s=await makeServer(f);
   await post(s.port,body('pilot-new-message-same-uncertain-slot'));await flush();assert.equal(f.stats.uncertainCalls,1,'different message ID cannot repeat an uncertain menu slot');
   assert.equal([...f.state.rows.values()].find(r=>r.kind==='infobip_send_admission').used,1);
  }
 }finally{release?.();await s.close();}
}
if(prepared)for(const onboarding of ['ask-user-name','ask-concierge-name'])for(const expired of [false,true]){
 const f=configureSyntheticOperationalPilot(setup());f.stats.preferences={onboardingStep:onboarding,onboardingStartedAt:new Date(epoch-(expired?3600000:1000)).toISOString(),mode:'comic',lastHumorAt:'',lastHumorKey:''};
 const s=await makeServer(f);
 try{await f.stats.probeReadOnlyWrites();assert.equal(f.stats.writes,0);const raw=JSON.stringify({results:[{...event('pilot-pending-'+onboarding+'-'+expired),message:{type:'TEXT',text:INFOBIP_OPERATIONAL_PILOT_INPUTS[1]}}]});await post(s.port,raw);for(let i=0;i<8;i++){await nextTurn();await s.host.dispatch('0'.repeat(64));}assert.equal(f.stats.sends.length,1);assert.match(f.stats.sends[0].content.text,/ZZ1234/);assert.equal(f.stats.writes,1,'only conversational context persisted through actual save function');assert(f.stats.suppressed>=1,'real save function denies prohibited onboarding/humor patch');}finally{await s.close();}
}
configureWhatsAppConcierge(null);
console.log(JSON.stringify({suite:'Render managed HTTP + required raw HMAC',prepared,actualPreparedHttpHandler:prepared,actualApplicationConfigurationAndPool:true,actualPreparedCanonicalBindingAndHelp:prepared,syntheticConsentAndReply:true,externalCalls:0}));
