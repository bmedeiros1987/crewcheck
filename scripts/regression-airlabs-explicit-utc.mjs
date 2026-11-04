import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import * as policy from '../shared/gate-query-day.mjs';
import * as injection from '../server/cirium-radar-injection.mjs';
import * as fields from '../shared/radar-field-evidence.mjs';

// Real adapter/race/public projection; only credentials, transport and clock are synthetic.
const text=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',text,99,true,ts.ScriptKind.JS);
const names=['firstKnown','normalizeFlightRaw','buildFlightContext','providerAirLabs','scoreRadar','publicRadarPayload','runRadarRace'];
const source=names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast);}).join('\n');
const now=Date.parse('2026-11-04T13:30:00Z');
const identity={flight:'LA8138',origin:'GRU',destination:'AEP',departureDate:'2026-11-04',scheduledDepartureUtc:'2026-11-04T20:05:00.000Z'};
let row,calls=0,utcResult;
const scope=vm.createContext({...policy,...injection,...fields,Date:class extends Date{static now(){return now;}},URL,setTimeout,clearTimeout,
 process:{env:{CREWCHECK_RADAR_TIMEOUT_MS:'800'}},envAny:keys=>keys.includes('AIRLABS_API_KEY')?'SYNTHETIC_ONLY':'',providerAvailable:()=>true,markProvider:()=>{},
 jsonFetch:async()=>{calls++;return{response:{ok:true,status:200},payload:{response:row}};},
 providerFlightAware:async()=>null,providerCustom:async()=>null,providerAviationstack:async()=>null,providerAeroDataBox:async()=>null,
 configuredProviders:()=>[{key:'airlabs',available:true}]});
vm.runInContext(source,scope);
const cases=[
 ['named UTC minute/space',{dep_time_utc:'2026-11-04 20:05'},true],
 ['named UTC minute/T',{dep_time_utc:'2026-11-04T20:05'},true],
 ['named UTC second',{dep_time_utc:'2026-11-04 20:05:00'},true],
 ['named UTC fractional',{dep_time_utc:'2026-11-04T20:05:00.000'},true],
 ['named UTC trimmed',{dep_time_utc:' 2026-11-04 20:05 '},true],
 ['explicit UTC unchanged',{dep_time_utc:identity.scheduledDepartureUtc},true],
 ['explicit local offset fallback',{dep_time:'2026-11-04T17:05:00-03:00'},true],
 ['named UTC retains precedence',{dep_time_utc:'2026-11-04 20:05',dep_time:'2026-11-04T19:05:00Z'},true],
 ['local fallback without zone',{dep_time:'2026-11-04 17:05'},false],
 ['local UTC-looking fallback without zone',{dep_time:'2026-11-04T20:05:00'},false],
 ['named UTC is not origin local',{dep_time_utc:'2026-11-04 17:05',dep_time:'2026-11-04T17:05:00-03:00'},false],
 ['wrong day',{dep_time_utc:'2026-11-03 20:05'},false],
 ['invalid calendar',{dep_time_utc:'2026-02-30 20:05'},false],
 ['invalid hour',{dep_time_utc:'2026-11-04 25:05'},false],
 ['impossible fraction',{dep_time_utc:'2026-11-04 20:05.0'},false],
 ['quoted timestamp',{dep_time_utc:'"2026-11-04 20:05"'},false],
 ['date only',{dep_time_utc:'2026-11-04'},false],
 ['numeric epoch',{dep_time_utc:Date.parse(identity.scheduledDepartureUtc)},false],
 ['estimate is not planned',{dep_estimated:identity.scheduledDepartureUtc},false],
 ['missing schedule',{},false],
 ['wrong flight',{dep_time_utc:'2026-11-04 20:05',flight_iata:'LA3728'},false],
 ['wrong origin',{dep_time_utc:'2026-11-04 20:05',dep_iata:'CGH'},false],
 ['wrong destination',{dep_time_utc:'2026-11-04 20:05',arr_iata:'SSA'},false],
];
for(const[name,change,allowed]of cases){row={flight_iata:'LA8138',dep_iata:'GRU',arr_iata:'AEP',dep_gate:'QA18',status:'scheduled',...change};calls=0;
 const ctx={...scope.buildFlightContext('LA8138'),gateQueryEvidence:identity};
 const result=await scope.runRadarRace(ctx,'GRU','AEP');
 assert.equal(result.ok,allowed,name);assert.equal(calls,1,'one existing synthetic request only: '+name);
 if(name==='named UTC minute/space')utcResult=result;
 if(!allowed){assert.equal(result.querySuppressed,true,name);assert(!result.gate,'rejected source never exposes a gate: '+name);
  const reason=name==='named UTC is not origin local'?'source-other-occurrence':name==='wrong day'?'source-other-day':['wrong flight','wrong origin','wrong destination'].includes(name)?'source-other-flight-or-route':'source-instant-unverified';
  assert.equal(result.queryReason,reason,name);
 }else{assert.equal(result.gateUpdate,null,'no operational gate proof invented: '+name);assert.equal(result.sourceReceivedAt,now,'existing receipt clock preserved: '+name);}
}

// The automatic response uses the same real app/watch producer as a manual gate.
// No browser/native runtime or supplier is contacted by this projection test.
globalThis.fetch=()=>{throw new Error('Airlabs projection test forbids external fetch');};
const callsBeforeProjection=calls;
const bundle=await build({stdin:{contents:"export * from './client/src/lib/nextFlightGate';export * from './client/src/lib/nextFlightWatch';export {buildCrewCheckWatchSnapshot} from './client/src/lib/watchContext';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,alias:{'@':process.cwd()+'/client/src'},logLevel:'silent'});
const module={exports:{}};Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));const app=module.exports;
assert.equal(utcResult.provider,'airlabs');
const event={id:'synthetic-airlabs-occurrence',kind:'flight',flightNumber:'LA8138',origin:'GRU',destination:'AEP',departure:'17:05',arrival:'20:00',canonical:{id:'synthetic-airlabs-canonical',date:'04/11/2026',legIndex:0,leg:{departureTime:'17:05',arrivalTime:'20:00'},startDateTime:identity.scheduledDepartureUtc,endDateTime:'2026-11-04T23:00:00Z'}};
const radar={...utcResult,sourceOrigin:utcResult.origin,sourceDestination:utcResult.destination,updatedAt:utcResult.sourceReceivedAt};
const info=app.resolveNextFlightGate({event,radar,now});assert.equal(info.gate,'QA18');assert.equal(info.gateSource,'reported');assert.equal(info.reportedProvider,'AirLabs');assert.equal(info.usesRadar,false,'a UTC schedule never fabricates an observed gate update');
const base=app.buildCrewCheckWatchSnapshot([event],event,null,now,false),options={primaryEventId:event.id,nextFlightScheduleId:event.canonical.id};
const watch=app.applyNextFlightToWatchSnapshot(base,info,options);assert.equal(watch.nextFlight,'LA8138');assert.match(watch.nextDetail,/PQA18/);assert.equal(watch.gateSource,'reported');assert.match(watch.gateNote,/AirLabs.*a confirmar/);assert(watch.validUntilEpochMs<=utcResult.sourceReceivedAt+app.RADAR_GATE_STALE_MS);
const repeated=app.resolveNextFlightGate({event,radar,now:now+60_000});assert.equal(repeated.gate,'QA18');assert.equal(repeated.radarUpdatedAtEpochMs,utcResult.sourceReceivedAt,'reading the same response does not renew its receipt');
const expired=app.resolveNextFlightGate({event,radar,now:utcResult.sourceReceivedAt+app.RADAR_GATE_STALE_MS+1});assert.equal(expired.gate,'');assert.equal(app.applyNextFlightToWatchSnapshot(base,expired,options).gateSource,'');
const otherDay={...event,id:'synthetic-next-day',canonical:{...event.canonical,date:'05/11/2026',startDateTime:'2026-11-05T20:05:00Z',endDateTime:'2026-11-05T23:00:00Z'}};assert.equal(app.resolveNextFlightGate({event:otherDay,radar,now}).gate,'','same flight/route on another date cannot borrow this gate');
const saved=new Map(),storage={getItem:k=>saved.has(k)?saved.get(k):null,setItem:(k,v)=>saved.set(k,v)};assert(app.writeManualGate(storage,'synthetic-owner',event,{gate:'QA24',author:'Synthetic'},now).ok);
const manual=app.readManualGate(storage,'synthetic-owner',event),preferred=app.resolveNextFlightGate({event,radar,manual,now});assert.equal(preferred.gate,'QA24');assert.equal(app.applyNextFlightToWatchSnapshot(base,preferred,options).gateSource,'manual');assert.equal(app.readManualGate(storage,'synthetic-other',event),null);
assert.equal(calls,callsBeforeProjection,'app/watch projection performs no supplier request');
console.log(`PASS Airlabs explicit UTC: ${cases.length} real adapter/race cases + app/watch automatic projection, provider/receipt/expiry/manual precedence; ambiguous local rejected; zero external requests and no physical Wear test (${process.env.TZ||'UTC'})`);
