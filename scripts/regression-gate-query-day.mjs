import {loadRadarReadAdmission} from './fixtures/load-radar-read-admission.mjs';
// Actual client request + actual server race/handler; all transports fictional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as radarEvidence from '../shared/radar-field-evidence.mjs';
import ts from 'typescript';
import * as policy from '../shared/gate-query-day.mjs';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
prepareConciergeCanonicalBridge();
const {buildCanonicalRosterEvents}=await import('../server/concierge/generated/canonicalRoster.mjs');
const bind=(r,q)=>policy.findPublishedGateOccurrence(r,q,buildCanonicalRosterEvents(r));
const date = '2032-10-14';
const identity = {flight:'LA100',origin:'GRU',destination:'REC',departureDate:date,scheduledDepartureUtc:'2032-10-14T12:00:00Z'};
let now = Date.parse('2032-10-14T02:59:59Z');
assert.equal(policy.gateQueryDay(identity, now).allowed, false);
now += 1000; assert.equal(policy.gateQueryDay(identity, now).allowed, true);
assert.equal(policy.gateQueryDay({...identity,origin:'RBR',scheduledDepartureUtc:'2032-10-14T12:00:00Z'},now).allowed,false,'Rio Branco still previous airport day');
assert.equal(policy.gateQueryDay({...identity,scheduledDepartureUtc:'2032-10-15T12:00:00Z'},now).allowed,false,'future UTC instant cannot borrow today published date');
assert.equal(policy.gateQueryDay(identity, Date.parse('2032-10-15T03:00:00Z')).allowed, false);
for (const zone of ['UTC','Pacific/Auckland','America/Sao_Paulo']) { process.env.TZ=zone; assert.equal(policy.gateQueryDay(identity, now).allowed,true); }
for (const change of [{origin:'XYZ'},{departureDate:'2032-02-30'},{departureDate:'2032-10-15'}]) assert.equal(policy.gateQueryDay({...identity,...change},now).allowed,false);
const roster={days:[{date:'14/10/2032',legs:[{flightNumber:'LA100',origin:'GRU',destination:'REC',departureTime:'09:00',gate:'published-24'}]}]};
assert(bind(roster,identity));
const secondProof=bind(roster,{...identity,scheduledDepartureUtc:'2032-10-14T12:00:37Z'});assert.equal(secondProof,null,'caller cannot replace canonical physical instant seconds');
for(const change of [{flight:'LA200'},{origin:'REC'},{departureDate:'2032-10-15'}]) assert.equal(bind(roster,{...identity,...change}),null);
assert.equal(bind({days:[...roster.days,...roster.days]},identity),null);
function functions(file,names){
 const source=fs.readFileSync(file,'utf8'), ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 return names.map(name=>{const n=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===name);assert(n, name);return ts.transpileModule(n.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}).join('\n');
}
const FakeDate=class extends Date {static now(){return now;}};
let serverCalls=0, exports=0, credentialFactories=0;
const fake=async()=>{serverCalls++;return {ok:true,gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z'};};
const server=vm.createContext({...policy,...radarEvidence,buildCanonicalRosterEvents,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:FakeDate,process:{env:{}},setTimeout:()=>1,clearTimeout:()=>{},
 ciriumRadarInjectionEnabled:o=>o?.enabled===true,runCiriumRadarInjection:fake,publicRadarPayload:x=>x,scoreRadar:()=>95,configuredProviders:()=>[],
 providerFlightAware:fake,providerCustom:fake,providerCiriumFlex:async()=>null,providerAviationstack:fake,providerAirLabs:fake,providerAeroDataBox:fake,
 buildFlightContext:raw=>({raw}),defaultCiriumRadarOptions:()=>{credentialFactories++;return undefined;},ciriumRadarIdentity:()=>({}),
 telegramRequestUser:()=>({email:'fictional@test.invalid',authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,
 conciergeLoadSnapshot:async()=>({email:'fictional@test.invalid',roster}),conciergeAccessMatches:()=>true,conciergeFindFlight:()=>({leg:roster.days[0].legs[0]}),
 conciergeApplyRadar:()=>{},conciergeSaveSnapshotAsync:async()=>{exports++;},sendJson:(_r,_s,data)=>data});
const before=process.argv.includes('--before');
vm.runInContext(functions(before?'/tmp/crewcheck-gate-cost-before-server.mjs':'server.mjs',['runRadarRace','handleRadar']),server);
const request=(extra={})=>new URL('https://fixture.invalid/api/radar-flight?'+new URLSearchParams({flight:'LA100',origin:'GRU',destination:'REC',departureDate:date,scheduledDepartureUtc:identity.scheduledDepartureUtc,...extra}));
now=Date.parse('2032-10-14T02:59:59Z');
const denied=await server.handleRadar({}, {}, request({force:'1'}));
assert.equal(serverCalls,0,'actual server must refuse before ANY provider, including force');assert.equal(denied.querySuppressed,true);assert.equal(exports,0);assert.equal(credentialFactories,0,'day guard before transport/credential factory');
now+=1000;const allowed=await server.handleRadar({}, {}, request());assert(serverCalls>0);assert.equal(allowed.exportedToConcierge,true);
// Actual server must discard a result across origin midnight BEFORE roster export.
serverCalls=0;exports=0;now=Date.parse('2032-10-14T12:00:00Z');const waiting=[];
for(const name of ['providerFlightAware','providerCustom','providerAviationstack','providerAirLabs','providerAeroDataBox']) server[name]=()=>{serverCalls++;return new Promise(resolve=>waiting.push(resolve));};
const late=server.handleRadar({}, {}, request());
for(let i=0;i<8;i++)await Promise.resolve();assert(waiting.length>0);
now=Date.parse('2032-10-15T03:00:00Z');waiting.forEach(resolve=>resolve({ok:true,gate:'late-46'}));
assert.equal((await late).queryReason,'response-context-expired');assert.equal(exports,0);
serverCalls=0;await server.runRadarRace({raw:'LA100',gateQueryEvidence:null,ciriumRadarOptions:{enabled:true}},'GRU','REC');assert.equal(serverCalls,0,'missing evidence cannot reach Cirium injection');
let lastQueryUrl;
let account='id:fictional-a',token='fixture-session-a',fetches=0,saves=0,resolve;
const event={id:'f1',kind:'flight',flightNumber:'LA100',origin:'GRU',destination:'REC',canonical:{date,startDateTime:new Date(identity.scheduledDepartureUtc).toISOString()}};
const cache={ok:true,gate:'cached-12'};
let cacheReadable=true;
const radarAdmission=await loadRadarReadAdmission();
const client=vm.createContext({...radarAdmission,...policy,RADAR_GATE_STALE_MS:30*60*1000,buildCanonicalRosterEvents,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:FakeDate,Map,URLSearchParams,
 getStoredUser:()=>({account}),manualGateAccountKey:u=>u.account,getToken:()=>token,manualGateIdentity:()=> 'LA100|2032-10-14|GRU|REC',
 flightOperationalDate:e=>e.canonical.date,eventStartDateTime:()=>new Date(identity.scheduledDepartureUtc),readRadarSnapshot:()=>cacheReadable?cache:null,telegramConciergeIdentity:()=>({}),
 authFetch:(url)=>{lastQueryUrl=new URL(url,'https://fixture.invalid');fetches++;return new Promise(r=>{resolve=r;});},fetch:()=>{throw Error('legacy fetch forbidden');},
 saveRadarSnapshot:(_event,payload)=>{saves++;return payload;},radarQuerySerial:new Map()});
vm.runInContext(functions(before?'/tmp/crewcheck-gate-cost-before-Home.tsx':'client/src/pages/Home.tsx',['fetchRadarSnapshot']),client);
now=Date.parse('2032-10-14T02:59:59Z');assert.equal(await client.fetchRadarSnapshot(event),cache);assert.equal(fetches,0);
cacheReadable=false;assert.equal((await client.fetchRadarSnapshot({...event,origin:'XYZ'},true)).querySuppressed,true);assert.equal(fetches,0);
now+=1000;let pending=client.fetchRadarSnapshot(event);token='fixture-session-b';resolve({ok:true,gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z'});assert.equal((await pending).queryReason,'response-context-expired');assert.equal(saves,0);
pending=client.fetchRadarSnapshot(event);now=Date.parse('2032-10-15T03:00:00Z');resolve({ok:true,gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z'});assert.equal((await pending).queryReason,'response-context-expired');assert.equal(saves,0);
now=Date.parse('2032-10-14T12:00:00Z');let old=client.fetchRadarSnapshot(event);const oldResolve=resolve;pending=client.fetchRadarSnapshot(event);oldResolve({ok:true,gate:'old'});assert.equal((await old).queryReason,'response-context-expired');resolve({ok:true,gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z'});assert.equal((await pending).gate,'46');assert.equal(saves,1);assert.equal(lastQueryUrl.searchParams.get('scheduledDeparture'),new Date(identity.scheduledDepartureUtc).toISOString());assert.equal(lastQueryUrl.searchParams.get('scheduledDepartureUtc'),new Date(identity.scheduledDepartureUtc).toISOString());assert.equal(lastQueryUrl.searchParams.get('departureDate'),identity.departureDate);
assert.equal(roster.days[0].legs[0].gate,'published-24');
console.log('PASS real client/server pre-provider day guard: published occurrence, origin midnight, device TZ independent, unknown/date/route/future/force negatives, cache, account/late/duplicate response fences; no real providers');
