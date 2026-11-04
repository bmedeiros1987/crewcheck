import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createRadarAttemptDiagnostics} from '../server/radar-attempt-diagnostics.mjs';
import * as policy from '../shared/gate-query-day.mjs';
import * as evidence from '../shared/radar-field-evidence.mjs';
import * as injection from '../server/cirium-radar-injection.mjs';
import {runCiriumFlightAwareSequence,sequentialRadarProjection} from '../server/radar-sequential.mjs';
import {createPaidRadarSource,createRadarSourceCache} from '../server/radar-paid-sources.mjs';

const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
const extract=name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast);};
const names=['firstKnown','normalizeFlightRaw','buildFlightContext','jsonFetch','providerAvailable','markProvider','noteProviderError','providerAirLabs','normalizeFlightAwareFlight','providerFlightAware','publicRadarPayload','scoreRadar','runRadarRace','handleRadarHealth'];
const identity={flight:'LA8138',origin:'GRU',destination:'AEP',departureDate:'2026-11-04',scheduledDepartureUtc:'2026-11-04T20:05:00.000Z'};
let now=Date.parse('2026-11-04T13:30:00Z'),mode,fetches,row,admin,health,release;
let diagnostics,scope;
function reset(){
 now=Date.parse('2026-11-04T13:30:00Z');mode='ok';fetches=0;admin=false;health=null;release=null;
 row={flight_iata:'LA8138',dep_iata:'GRU',arr_iata:'AEP',dep_time_utc:identity.scheduledDepartureUtc,dep_gate:'QA18',status:'scheduled'};
 diagnostics=createRadarAttemptDiagnostics({now:()=>now});
 scope=vm.createContext({...policy,...evidence,...injection,runCiriumFlightAwareSequence:o=>runCiriumFlightAwareSequence({...o,now:()=>now}),sequentialRadarProjection,
  radarAttemptDiagnostics:diagnostics,radarHealth:new Map(),URL,AbortController,setTimeout,clearTimeout,
  Date:class extends Date{static now(){return now;}},process:{env:{AIRLABS_API_KEY:'SYNTHETIC_SECRET',FLIGHTAWARE_AEROAPI_KEY:'SYNTHETIC_SECRET',RADAR_FLIGHTAWARE_FALLBACK_ENABLED:'true',CIRIUM_FLEX_RADAR_ENABLED:'true',CREWCHECK_RADAR_TIMEOUT_MS:'800'}},
  envAny:keys=>keys.some(k=>['AIRLABS_API_KEY','FLIGHTAWARE_AEROAPI_KEY'].includes(k))?'SYNTHETIC_SECRET':'',
  gateQueryDay:i=>policy.gateQueryDay(i,now),radarResultDecision:(p,i)=>policy.radarResultDecision(p,i,now),
  providerCustom:async()=>null,providerAviationstack:async()=>null,providerAeroDataBox:async()=>null,
  configuredProviders:()=>[{key:'airlabs',available:true},{key:'flightaware',available:true}],radarHealthAdmin:()=>admin,sendJson:(_res,status,body)=>(health={status,body}),
  fetch:async(_url,options)=>{fetches++;if(mode==='hold')await new Promise(resolve=>{release=resolve;});if(mode==='transport')throw Error('https://private.invalid/?apikey=SYNTHETIC_SECRET');if(mode==='timeout')return await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('SYNTHETIC_SECRET'),{name:'AbortError'})),{once:true}));return{status:mode==='http'?503:200,ok:mode!=='http',json:async()=>{if(mode==='json')throw SyntaxError('SYNTHETIC_SECRET');if(mode==='body-transport')throw TypeError('SYNTHETIC_SECRET');return mode==='fa'||mode==='hold'?{flights:[{ident:'LA8138',origin:{code_iata:'GRU'},destination:{code_iata:'AEP'},scheduled_out:identity.scheduledDepartureUtc,gate_origin:'QA18',status:'Scheduled'}]}:{response:row};}};}
 });
 vm.runInContext(names.map(extract).join('\n'),scope);
 // Legacy fixture targets only Airlabs; FlightAware remains OFF unless its paid context is explicit.
}
const state=provider=>diagnostics.snapshot().providers.find(x=>x.provider===provider);
const call=()=>scope.runRadarRace({...scope.buildFlightContext('LA8138'),gateQueryEvidence:identity},'GRU','AEP');
reset();let result=await call();assert.equal(result.ok,true);assert.equal(fetches,1);assert.equal(state('airlabs').counts.networkAttempts,1);assert.equal(state('airlabs').counts.httpResponses,1);assert.equal(state('airlabs').counts.matchedWithGateResults,1);assert.equal(state('airlabs').lastScheduleFormat,'absolute-valid');
row.dep_gate=null;result=await call();assert.equal(result.ok,true);assert.equal(state('airlabs').counts.matchedWithoutGateResults,1,'valid response without gate is not a transport failure');assert.equal(state('airlabs').counts.transportFailures,0);assert.equal(scope.providerAvailable('airlabs',['AIRLABS_API_KEY']),true,'missing gate alone does not start outage cooldown');
delete row.dep_time_utc;row.dep_time='2026-11-04 17:05';result=await call();assert.equal(result.queryReason,'source-instant-unverified');assert.equal(state('airlabs').counts.rejectedOccurrenceResults,1);assert.equal(state('airlabs').lastScheduleFormat,'zone-less');
admin=false;scope.handleRadarHealth({},{});assert.equal(health.body.attemptDiagnostics,undefined,'public health cannot see per-provider observations');
admin=true;scope.handleRadarHealth({},{});assert.equal(health.body.attemptDiagnostics.scope,'process-local');assert.doesNotMatch(JSON.stringify(health.body),/SYNTHETIC_SECRET|private\.invalid|apikey=|Authorization/);
for(const s of diagnostics.snapshot().providers)assert.deepEqual(s.confirmedBilledUsage,{state:'unknown',units:null});
assert.equal(state('oag').instrumented,false);assert.equal(state('oag').counts,null,'unimplemented source never claims zero usage');
const copy=diagnostics.snapshot();copy.providers[0].counts.networkAttempts=999;assert.notEqual(state('flightaware').counts.networkAttempts,999,'snapshots do not expose mutable state');
const bounded=JSON.stringify(diagnostics.snapshot());for(let n=0;n<10_000;n++)diagnostics.transport('unknown-'+n,'attempt');assert.equal(JSON.stringify(diagnostics.snapshot()),bounded,'unknown names cannot grow provider storage');

reset();await call();now++;mode='http';result=await call();assert.equal(result.ok,false);assert.equal(state('airlabs').counts.httpErrorResponses,1);const before=fetches;await call();assert.equal(fetches,before,'new failure backs off even after recent success');now+=30_000;mode='ok';await call();assert.equal(fetches,before+1,'existing next request may run after cooldown; no internal retry');
reset();mode='transport';await call();assert.equal(state('airlabs').counts.networkAttempts,1);assert.equal(state('airlabs').counts.httpResponses,0);assert.equal(state('airlabs').counts.transportFailures,1);assert.equal(state('airlabs').counts.timeouts,0);assert.equal(state('airlabs').lastHttpStatus,null);assert.equal(scope.providerAvailable('airlabs',['AIRLABS_API_KEY']),false);assert.doesNotMatch(JSON.stringify(diagnostics.snapshot()),/SYNTHETIC_SECRET|private\.invalid/);
reset();mode='json';await scope.jsonFetch('https://synthetic.invalid',{},20,'airlabs');assert.equal(state('airlabs').counts.httpResponses,1);assert.equal(state('airlabs').counts.invalidJsonResponses,1);assert.equal(state('airlabs').counts.transportFailures,0);
reset();mode='body-transport';await scope.jsonFetch('https://synthetic.invalid',{},20,'airlabs');assert.equal(state('airlabs').counts.httpResponses,1);assert.equal(state('airlabs').counts.transportFailures,1);assert.equal(state('airlabs').counts.invalidJsonResponses,0,'body transport error is not malformed JSON');
reset();mode='timeout';await assert.rejects(()=>scope.jsonFetch('https://synthetic.invalid',{},1,'airlabs'),{name:'AbortError'});assert.equal(state('airlabs').counts.networkAttempts,1);assert.equal(state('airlabs').counts.transportFailures,1);assert.equal(state('airlabs').counts.timeouts,1);assert.equal(state('airlabs').counts.httpResponses,0);

for(const order of [[0,1],[1,0]]){
 reset();const releases=[];scope.fetch=async()=>new Promise(resolve=>releases.push(resolve));
 const requests=[scope.jsonFetch('https://synthetic.invalid',{},100,'airlabs'),scope.jsonFetch('https://synthetic.invalid',{},100,'airlabs')];
 for(const index of order){now++;releases[index]({status:index?429:200,ok:!index,json:async()=>({})});await requests[index];}
 assert.equal(state('airlabs').counts.networkAttempts,2);assert.equal(state('airlabs').counts.httpResponses,2);assert.equal(state('airlabs').counts.httpErrorResponses,1);
 assert.equal(scope.providerAvailable('airlabs',['AIRLABS_API_KEY']),false,'both concurrent completion orders preserve failure cooldown');
 now+=30_000;assert.equal(scope.providerAvailable('airlabs',['AIRLABS_API_KEY']),true);
}

reset();mode='http';scope.process.env.CREWCHECK_FLIGHT_STATUS_URL='https://synthetic.invalid/{flight}';scope.envAny=keys=>keys.includes('CREWCHECK_FLIGHT_STATUS_URL')?'https://synthetic.invalid/{flight}':'';
vm.runInContext(extract('providerCustom'),scope);
assert.equal((await scope.providerCustom({iata:'LA8138'},100,'GRU','AEP')).ok,false);
assert.equal(await scope.providerCustom({iata:'LA8138'},100,'GRU','AEP'),null,'custom gateway also respects failure cooldown');
assert.equal(fetches,1);assert.equal(state('custom').counts.networkAttempts,1);assert.equal(state('custom').counts.httpErrorResponses,1);

// Existing paid cache/coalescence and admission, actual FA adapter/transport boundary.
reset();mode='hold';let reservations=0,admitted=true;
const cache=createRadarSourceCache({now:()=>now}),paid=createPaidRadarSource({cache,ledger:{reserve:async()=>{reservations++;return{ok:true};}},env:{RADAR_FLIGHTAWARE_FALLBACK_ENABLED:'true',FLIGHTAWARE_COST_PER_CALL_USD:'0.01',RADAR_PAID_MONTHLY_BUDGET_USD:'1'}});
const ctx={...scope.buildFlightContext('LA8138'),gateQueryEvidence:identity,radarReadAdmission:async()=>admitted,ciriumRadarOptions:{enabled:true,sequential:true,flightAwareFallback:true,primary:async()=>({ok:false,provider:'cirium-flex'}),guardFallback:(i,transport,admit,ready)=>paid('flightaware',i,transport,admit,ready)}};
const pending=Array.from({length:3},()=>scope.runRadarRace(ctx,'GRU','AEP'));
while(!release)await new Promise(resolve=>setTimeout(resolve,0));release();const responses=await Promise.all(pending);assert(responses.every(x=>x.ok));assert.equal(fetches,1);assert.equal(reservations,1);assert.equal(state('flightaware').counts.networkAttempts,1);assert.equal(state('flightaware').counts.matchedWithGateResults,1,'coalesced readers do not count as three source responses');
mode='fa';const receipt=responses[0].sourceReceivedAt,metricsBeforeCache=diagnostics.snapshot();now+=1000;result=await scope.runRadarRace(ctx,'GRU','AEP');assert.equal(fetches,1);assert.equal(result.sourceReceivedAt,receipt,'cache does not renew source receipt');assert.deepEqual(diagnostics.snapshot(),metricsBeforeCache,'cache replay changes neither attempt nor result counters');
// Real app resolver -> actual watch snapshot projection. Not a physical Wear test.
const frontend=await build({stdin:{contents:"export * from './client/src/lib/nextFlightGate';export * from './client/src/lib/nextFlightWatch';export {buildCrewCheckWatchSnapshot} from './client/src/lib/watchContext';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,alias:{'@':process.cwd()+'/client/src'},logLevel:'silent'});
const module={exports:{}};Function('module','exports','require',frontend.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));const app=module.exports;
const event={id:'synthetic-occurrence',kind:'flight',flightNumber:'LA8138',origin:'GRU',destination:'AEP',departure:'17:05',arrival:'20:00',canonical:{id:'synthetic-canonical',date:'04/11/2026',legIndex:0,leg:{departureTime:'17:05',arrivalTime:'20:00'},startDateTime:identity.scheduledDepartureUtc,endDateTime:'2026-11-04T23:00:00Z'}};
const radar={...result,sourceOrigin:result.origin,sourceDestination:result.destination,updatedAt:result.sourceReceivedAt};
const info=app.resolveNextFlightGate({event,radar,now});assert.equal(info.gate,'QA18');assert.equal(info.gateSource,'reported');assert.equal(info.usesRadar,false,'receipt-only result never becomes operational proof');
const base=app.buildCrewCheckWatchSnapshot([event],event,null,now,false),options={primaryEventId:event.id,nextFlightScheduleId:event.canonical.id};
const watch=app.applyNextFlightToWatchSnapshot(base,info,options);assert.equal(base.currentFlight,'','fixture is still before the active-flight window');assert.equal(watch.nextFlight,'LA8138');assert.match(watch.nextDetail,/PQA18/,'automatic gate reaches the upcoming-flight watch detail');assert.equal(watch.gateSource,'reported');assert.match(watch.gateNote,/FlightAware.*a confirmar/);assert(watch.validUntilEpochMs<=receipt+app.RADAR_GATE_STALE_MS);assert.equal(fetches,1,'watch projection never queries a provider');
const saved=new Map(),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};assert(app.writeManualGate(storage,'synthetic-owner',event,{gate:'QA24',author:'Synthetic'},now).ok);
const manual=app.readManualGate(storage,'synthetic-owner',event),overridden=app.resolveNextFlightGate({event,radar,manual,now});assert.equal(overridden.gate,'QA24');assert.equal(app.applyNextFlightToWatchSnapshot(base,overridden,options).gateSource,'manual');assert.equal(app.readManualGate(storage,'synthetic-other',event),null);
const expired=app.resolveNextFlightGate({event,radar,now:receipt+app.RADAR_GATE_STALE_MS+1});assert.equal(expired.gate,'');assert.equal(app.applyNextFlightToWatchSnapshot(base,expired,options).gateSource,'');
admitted=false;result=await scope.runRadarRace(ctx,'GRU','AEP');assert.equal(result.ok,false);assert.equal(fetches,1,'revocation cannot consume another supplier request');
assert.equal(state('flightaware').confirmedBilledUsage.units,null,'successful transport still does not prove provider billing');
console.log('PASS real Radar diagnostics + source/backend/cache/app/watch projection: HTTP/transport/timeout/JSON/data/no-gate, admin sanitization, unknown billing, bounded storage, cooldown, coalescence/cache/receipt, manual priority/expiry and revocation; synthetic only, no physical Wear');
