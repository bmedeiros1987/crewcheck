import {loadRadarReadAdmission} from './fixtures/load-radar-read-admission.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
const root=process.env.RADAR_SOURCE_ROOT||process.cwd(),require=createRequire(path.join(root,'package.json')),ts=require('typescript'),{build}=require('esbuild');
const radarAdmission=await loadRadarReadAdmission(root);
const selected=process.argv.find(x=>x.startsWith('--case='))?.slice(7);
prepareConciergeCanonicalBridge(root);
const policy=await import(pathToFileURL(path.join(root,'shared/gate-query-day.mjs')).href),injection=await import(pathToFileURL(path.join(root,'server/cirium-radar-injection.mjs')).href),radarEvidence=await import(pathToFileURL(path.join(root,'shared/radar-field-evidence.mjs')).href);
const {buildCanonicalRosterEvents}=await import(pathToFileURL(path.join(root,'server/concierge/generated/canonicalRoster.mjs')).href);
function functions(file,names,typescript=false){const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,typescript?ts.ScriptKind.TSX:ts.ScriptKind.JS);return names.map(name=>{const n=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===name);assert(n,name);return typescript?ts.transpileModule(n.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText:n.getText(ast);}).join('\n');}
const now=Date.parse('2032-10-14T12:00:00Z'),roster={year:2032,month:10,base:'GRU',days:[{date:'14/10/2032',type:'VOO',legs:[{flightNumber:'LA100',origin:'GRU',destination:'REC',departureTime:'09:00',arrivalTime:'11:00',gate:'24'}]}]};
let body,channel='airlabs',writes=0;
const scope=vm.createContext({...policy,...injection,...radarEvidence,buildCanonicalRosterEvents,Date:class extends Date{static now(){return now;}},gateQueryDay:(x,t)=>policy.gateQueryDay(x,t??now),URL,setTimeout,clearTimeout,process:{env:{CREWCHECK_RADAR_TIMEOUT_MS:'800'}},
 envAny:keys=>channel==='airlabs'&&keys.includes('AIRLABS_API_KEY')?'OFFLINE_ONLY':channel==='custom'&&keys.includes('CREWCHECK_FLIGHT_STATUS_URL')?'https://fixture.invalid/{flight}':'',providerAvailable:()=>true,markProvider:()=>{},jsonFetch:async()=>({response:{ok:true},payload:body}),
 providerFlightAware:async()=>null,providerCiriumFlex:async()=>null,providerAviationstack:async()=>null,providerAeroDataBox:async()=>null,
 telegramRequestUser:()=>({email:'fixture@example.invalid',authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,conciergeLoadSnapshot:async()=>({email:'fixture@example.invalid',roster}),conciergeAccessMatches:()=>true,conciergeApplyRadar:()=>{},conciergeSaveSnapshotAsync:async()=>{writes++;},sendJson:(_r,_s,p)=>p});
vm.runInContext(functions('server.mjs',['firstKnown','normalizeFlightRaw','buildFlightContext','providerAirLabs','providerCustom','runRadarRace','handleRadar','scoreRadar','publicRadarPayload']),scope);
const url=new URL('https://fixture.invalid/api/radar-flight?flight=LA100&origin=GRU&destination=REC&departureDate=2032-10-14&scheduledDepartureUtc=2032-10-14T12:00:00Z&scheduledDeparture=2032-10-14T12:00:00Z&force=1');
if(!selected||selected==='airlabs'){
 body={response:{flight_iata:'LA100',dep_iata:'GRU',arr_iata:'REC',dep_gate:'99',dep_time:'2032-10-13T12:00:00Z',dep_estimated:'2032-10-14T12:00:00Z'}};
 const response=await scope.handleRadar({}, {},url);console.log(JSON.stringify({case:'airlabs',ok:response.ok,gate:response.gate,writes}));assert.equal(response.ok,false);assert.equal(writes,0);assert(!response.gate);
 body.response.dep_time='2032-10-14T12:00:00Z';body.response.dep_estimated='2032-10-15T12:00:00Z';assert.equal((await scope.handleRadar({}, {},url)).ok,true,'valid schedule with next-day estimate remains same flight');writes=0;
}
if(!selected||selected==='custom'){
 channel='custom';body={gate:'98',scheduledDepartureUtc:'2032-10-14T12:00:00Z'};const response=await scope.handleRadar({}, {},url);console.log(JSON.stringify({case:'custom',ok:response.ok,gate:response.gate,writes}));assert.equal(response.ok,false);assert.equal(writes,0);
 for(const missing of ['flight','origin','destination']){body={ok:true,flight:'LA100',origin:'GRU',destination:'REC',gate:'98',scheduledDepartureUtc:'2032-10-14T12:00:00Z'};delete body[missing];assert.equal((await scope.handleRadar({}, {},url)).ok,false,missing);assert.equal(writes,0);}
 body={flight:'LA100',origin:'GRU',destination:'REC',gate:'98',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-15T12:00:00Z'};assert.equal((await scope.handleRadar({}, {},url)).ok,true);
}
if(!selected||selected==='cache'){
 const compiled=await build({stdin:{contents:"export * from './client/src/lib/nextFlightGate';",resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};Function('module','exports','require',compiled.outputFiles[0].text)(m,m.exports,require);
 const event={id:'fixture-event',kind:'flight',flightNumber:'LA100',origin:'GRU',destination:'REC',day:{date:'14/10/2032'},canonical:{date:'2032-10-14',startDateTime:'2032-10-14T12:00:00Z'},date:new Date('2032-10-14T12:00:00Z')};
 const snapshot={operationalEvidence:{gate:{version:1,value:'99',sourceObservedAt:'2032-10-14T11:59:00Z',provenance:'synthetic field observation'}},ok:true,flight:'LA100',origin:'GRU',destination:'REC',gate:'99',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-15T12:00:00Z',updatedAt:now,sourceReceivedAt:now,sourceOrigin:'GRU',sourceDestination:'REC',operationalDate:'2032-10-14'};
 const store=new Map(),storage={getItem:k=>store.get(k)||null};store.set(m.exports.radarSnapshotStorageKey(event),JSON.stringify(snapshot));
 const cached=m.exports.readCachedRadarForFlight(storage,event,now);assert(cached);const info=m.exports.resolveNextFlightGate({event,radar:cached,now});console.log(JSON.stringify({case:'cache',gate:info.gate,rejected:info.radarRejected}));assert.equal(info.gate,'99','direct NextFlight consumer must use planned occurrence, not estimate');
 const client=vm.createContext({...radarAdmission,...policy,...m.exports,Date:class extends Date{static now(){return now;}},storage:{get:k=>store.get(k)||'null',set:(k,v)=>store.set(k,v)},localStorage:{},window:{dispatchEvent:()=>{}},CustomEvent:class {},getStoredUser:()=>({}),readManualGate:()=>null,manualGateAccountKey:()=> 'fixture-account',publishCrewCheckNotice:()=>{},reconcileCrewCheckPulse(){},manualGateNoticeScope:()=>"synthetic-scope",RADAR_CARD_CACHE_TTL_MS:6*3600000});
 vm.runInContext(functions('client/src/pages/Home.tsx',['radarSnapshotKey','radarEventOperationalDate','radarSnapshotMatchesEvent','validatedRadarForEvent','readRadarSnapshot','saveRadarSnapshot'],true),client);
 const saved=client.saveRadarSnapshot(event,snapshot);const projected=m.exports.resolveNextFlightGate({event,radar:m.exports.readCachedRadarForFlight(storage,event,now),now});assert.equal(projected.gate,'99');assert.equal(saved.departure,snapshot.scheduledDepartureUtc);assert.equal(saved.operationalDeparture,snapshot.departure,'estimate/actual display value preserved separately');assert.equal(saved.scheduledDepartureUtc,snapshot.scheduledDepartureUtc);
 const midnight={...event,canonical:{date:'2032-10-14',startDateTime:'2032-10-14T03:30:00Z'},date:new Date('2032-10-14T03:30:00Z')};
 const legacy={...snapshot,departure:'2032-10-14T02:30:00Z',updatedAt:now-60000};delete legacy.scheduledDepartureUtc;
 const estimateOnly={...snapshot,departure:snapshot.scheduledDepartureUtc};delete estimateOnly.scheduledDepartureUtc;
 console.log(JSON.stringify({case:'legacy-upgrade',nextFlight:m.exports.resolveNextFlightGate({event:midnight,radar:legacy,now}),radarEstimateAccepted:!!client.validatedRadarForEvent(event,estimateOnly)}));
 assert.equal(m.exports.resolveNextFlightGate({event:midnight,radar:legacy,now}).radarRejected,'unproven-day','legacy neighboring civil day cannot prove planned occurrence');
 store.set(m.exports.radarSnapshotStorageKey(midnight),JSON.stringify(legacy));assert.equal(m.exports.readCachedRadarForFlight(storage,midnight,now),null,'legacy automatic cache is not consumed');
 assert.equal(client.validatedRadarForEvent(event,estimateOnly),null,'legacy AirLabs estimate coinciding with plan is not scheduled proof');
 assert.equal(m.exports.resolveNextFlightGate({event:{...midnight,gate:'24'},radar:legacy,now}).plannedGate,'24','published gate preserved as planning only');
 assert.equal(m.exports.resolveNextFlightGate({event:midnight,radar:legacy,manual:{gate:'25',flight:'LA100',date:m.exports.flightOperationalDate(midnight),origin:'GRU',destination:'REC',scheduledDepartureUtc:midnight.canonical.startDateTime,author:'Synthetic user',setAtEpochMs:now-60000},now}).gate,'25','manual preserved');
 const wrong={...saved,scheduledDepartureUtc:'2032-10-15T12:00:00Z'};assert.notEqual(m.exports.resolveNextFlightGate({event,radar:wrong,now}).gate,'99');
 const shifted={...saved,scheduledDepartureUtc:'2032-10-14T12:05:00Z'};assert.notEqual(m.exports.resolveNextFlightGate({event,radar:shifted,now}).gate,'99','different planned instant on same day is rejected');
 const invalid={...saved,scheduledDepartureUtc:''};assert.notEqual(m.exports.resolveNextFlightGate({event,radar:invalid,now}).gate,'99','explicit invalid schedule cannot fall back to estimate');
}
console.log('PASS actual provider/handler and actual Home saver/cache/NextFlight: no request-derived identity, planned occurrence shared, estimate separate; fixtures only');
