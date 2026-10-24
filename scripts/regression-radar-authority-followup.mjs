import {beginRadarOperationalHistory} from '../server/concierge/radar-history-capture.mjs';
import {loadRadarReadAdmission} from './fixtures/load-radar-read-admission.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {build} from 'esbuild';
import * as policy from '../shared/gate-query-day.mjs';
import * as radarEvidence from '../shared/radar-field-evidence.mjs';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
assert.match(fs.readFileSync('.github/workflows/next-flight-gate.yml','utf8'), /^\s+- ['"]client\/src\/lib\/authClient\.ts['"]\s*$/m, 'real authClient changes must trigger the Radar workflow');
prepareConciergeCanonicalBridge();
const {buildCanonicalRosterEvents}=await import('../server/concierge/generated/canonicalRoster.mjs');
function extract(file,names){const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX);return names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return ts.transpileModule(fn.getText(ast).replace(/^export /,''),{compilerOptions:{target:99}}).outputText}).join('\n');}
let now=Date.parse('2032-10-14T12:00:00Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const leg={flightNumber:'LA3981',origin:'CPV',destination:'GRU',departureTime:'09:00',arrivalTime:'11:00',duration:2};
const roster={year:2032,month:10,base:'CPV',days:[{date:'14/10/2032',type:'VOO',dutyReport:'08:00',dutyDebrief:'11:30',legs:[leg]}]};
const identity={flight:'LA3981',origin:'CPV',destination:'GRU',departureDate:'2032-10-14',scheduledDepartureUtc:'2032-10-14T12:00:00Z'};
let rows,queries,providerCalls,writes,claims,poolAvailable,lateChange,snapshot;
const scope=vm.createContext({beginRadarOperationalHistory,...policy,...radarEvidence,Date:FixedDate,buildCanonicalRosterEvents,gateQueryDay:i=>policy.gateQueryDay(i,now),setTimeout,clearTimeout,process:{env:{}},
 safeEmail:s=>String(s||'').trim().toLowerCase(),verifyJwt:()=>claims,requestToken:r=>r.token,
 pool:async()=>poolAvailable?{query:async(sql,args)=>{queries.push({sql,args});if(queries.length===2)lateChange?.();return {rows};}}:null,
 telegramRequestUser:()=>({email:'a@example.invalid',authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:s=>String(s||'').trim().toLowerCase(),
 conciergeLoadSnapshot:async()=>snapshot,conciergeAccessMatches:()=>true,conciergeApplyRadar:()=>{writes++},conciergeSaveSnapshotAsync:async()=>{writes++},
 ciriumRadarInjectionEnabled:()=>false,defaultCiriumRadarOptions:()=>undefined,configuredProviders:()=>[],scoreRadar:()=>95,publicRadarPayload:x=>x,sendJson:(_r,status,payload)=>({...payload,httpStatus:status})});
for(const name of ['providerFlightAware','providerCustom','providerAviationstack','providerAirLabs','providerAeroDataBox'])scope[name]=async()=>{providerCalls++;return {ok:true,gate:'46',...identity,departure:identity.scheduledDepartureUtc};};
vm.runInContext(extract('server.mjs',['normalizeFlightRaw','buildFlightContext']),scope);
vm.runInContext(extract('server/platform.mjs',['loadOwnedPlatformRoster'])+extract(process.env.RADAR_HELD_SERVER||'server.mjs',['runRadarRace','handleRadar']),scope);
function reset(){rows=[{id:'published-A',owner_email:'a@example.invalid',updated_at:'2032-10-14T10:00:00Z',roster:structuredClone(roster)}];queries=[];providerCalls=0;writes=0;claims={email:'a@example.invalid'};poolAvailable=true;lateChange=null;snapshot=null;now=Date.parse('2032-10-14T12:00:00Z');}
const url=()=>new URL('https://fixture.invalid/api/radar-flight?'+new URLSearchParams({...identity,email:'foreign@example.invalid',force:'1'}));
reset();let result=await scope.handleRadar({token:'mock-signed-A'}, {}, url());assert.equal(result.ok,true,'authenticated app uses owned active publication without Concierge snapshot');assert(providerCalls>0);assert.equal(result.exportedToConcierge,false);assert.equal(writes,0);assert.equal(queries.length,2);assert(queries.every(q=>q.args[0]==='a@example.invalid'&&q.sql.includes('owner_email=$1')),'URL email never chooses source owner');
reset();claims={email:'foreign@example.invalid'};result=await scope.handleRadar({token:'mock-foreign'}, {}, url());assert.equal(result.httpStatus,401);assert.equal(providerCalls,0);assert.equal(queries.length,0);
reset();claims={email:'a@example.invalid',aud:'crewcheck-visitor',role:'visitor'};result=await scope.handleRadar({token:'mock-visitor'}, {}, url());assert.equal(result.httpStatus,403);assert.equal(providerCalls,0);assert.equal(queries.length,0);
reset();rows[0].owner_email='foreign@example.invalid';result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.httpStatus,403);assert.equal(providerCalls,0);
reset();poolAvailable=false;result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.httpStatus,503);assert.equal(providerCalls,0);
reset();lateChange=()=>{rows[0].updated_at='2032-10-14T11:00:00Z'};result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.queryReason,'response-occurrence-changed');assert.equal(result.ok,false);assert.equal(writes,0);
reset();lateChange=()=>{rows[0].roster.days[0].legs=[]};result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.queryReason,'response-occurrence-changed');assert.equal(writes,0);
reset();lateChange=()=>{now=Date.parse('2032-10-15T03:00:00Z')};result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.queryReason,'response-context-expired');assert.equal(writes,0);
reset();snapshot={email:'foreign@example.invalid',roster};result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.ok,false);assert.equal(providerCalls,0);assert.equal(queries.length,0);
reset();snapshot={email:'a@example.invalid',key:'foreign@example.invalid',roster};result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.ok,false);assert.equal(providerCalls,0);
reset();delete rows[0].updated_at;result=await scope.handleRadar({token:'mock-A'}, {}, url());assert.equal(result.ok,false);assert.equal(providerCalls,0);
console.log('PASS actual app handler/owned DB loader: no snapshot, token owner, foreign row, DB outage, revision/removal/midnight fences, no writes; providers fictitious');
reset();snapshot={email:'a@example.invalid',roster,preferences:{location:{synthetic:true}}};const record={day:roster.days[0],legs:roster.days[0].legs,end:new FixedDate(now+3600000),start:new FixedDate(now),startTime:'08:00'};
Object.assign(scope,{conciergeProgramRecords:()=>[record],conciergeRemoteCodes:new Set(),conciergePresentationTime:()=> '08:00',conciergeProgramDate:()=>new FixedDate(now),conciergeTravelEstimate:async()=>({minutes:20,distanceKm:10}),calculateDepartureWindow:()=>({leave:new FixedDate(now),routeMinutes:20,leadMinutes:30}),buildDepartureSummary:x=>x.radar,conciergeLoadSnapshot:async()=>snapshot});
const premiumFile=process.env.RADAR_HELD_PREMIUM || (fs.readFileSync('server.mjs','utf8').includes('async function conciergePremiumDepartureReply(')?'server.mjs':'server/v1403/premium-helpers.snippet');vm.runInContext(extract('server.mjs',['conciergeRosterDayParts','conciergeDateKey','conciergeRecordDateKey'])+extract(premiumFile,['conciergePremiumDepartureReply']),scope);
result=await scope.conciergePremiumDepartureReply(snapshot,{email:'a@example.invalid',authenticated:true});assert.equal(result.ok,true);assert(providerCalls>0);assert.equal(writes,2);
for (const formatted of ['LA 3981','la3981','la 3981',' LA \t3981 ']) {
 leg.flightNumber=formatted;providerCalls=0;writes=0;
 result=await scope.conciergePremiumDepartureReply(snapshot,{email:'a@example.invalid',authenticated:true});
 assert.equal(result.ok,true,`formatted published flight ${JSON.stringify(formatted)} uses the canonical binding`);assert(providerCalls>0);assert.equal(writes,2);
}
leg.flightNumber='LA3981';
providerCalls=0;writes=0;result=await scope.conciergePremiumDepartureReply(snapshot,{email:'foreign@example.invalid',authenticated:true});assert.equal(result,policy.gateQuerySuppressed({reason:'account-unverified'}).message);assert.equal(providerCalls,0);assert.equal(writes,0);
console.log('PASS actual premium helper derives canonical published evidence and refuses foreign owner; route and providers mocked');
// Exercise the actual authFetch error contract, then the actual Home caller.
const previous={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};
try{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};globalThis.sessionStorage={removeItem:()=>{}};globalThis.window=Object.assign(new EventTarget(),{location:{origin:'https://fixture.invalid'}});
 const code=await build({stdin:{contents:"export * from './client/src/lib/radarAvailability';export * from './client/src/lib/authClient';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};Function('module','exports',code.outputFiles[0].text)(m,m.exports);const auth=m.exports;
 const radarAdmission=await loadRadarReadAdmission();
 const client=vm.createContext({...radarAdmission,...policy,...auth,URLSearchParams,Map,Date:FixedDate,gateQueryDay:i=>policy.gateQueryDay(i,now),manualGateAccountKey:u=>u?.id||'local',manualGateIdentity:()=> 'synthetic-occurrence',readRadarSnapshot:()=>null,telegramConciergeIdentity:()=>({}),radarQuerySerial:new Map(),RADAR_GATE_STALE_MS:1800000,saveRadarSnapshot:()=>{throw Error('Negative response must not be cached');}});vm.runInContext(extract(process.env.RADAR_HELD_HOME || 'client/src/pages/Home.tsx',['fetchRadarSnapshot']),client);
 const event={id:'synthetic',kind:'flight',flightNumber:'LA3981',origin:'CPV',destination:'GRU',canonical:{startDateTime:identity.scheduledDepartureUtc}};now=Date.parse('2032-10-14T12:00:00Z');
 for(const status of [200,401,403,503]){
  values.set('crewcheck_auth_token','synthetic-A');values.set('crewcheck_auth_user',JSON.stringify({id:'A'}));globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,code:status===401?'AUTH_REQUIRED':'TEST',querySuppressed:true,queryReason:'origin-timezone-unverified',gate:'DO-NOT-DISPLAY',quality:100}),{status,headers:{'content-type':'application/json'}});
  let error;try{await auth.authFetch('/api/radar-flight')}catch(e){error=e}assert(error instanceof auth.AuthClientError);assert.equal(error.status,status);const negative=auth.radarFailurePayload(error);assert.equal(negative.httpStatus,status);assert.equal(negative.ok,false);assert.equal(negative.quality,0);assert.equal(negative.gate,undefined);
  values.set('crewcheck_auth_token','synthetic-A');const got=await client.fetchRadarSnapshot(event);assert.equal(got.ok,false);assert.equal(got.httpStatus,status);assert.equal(got.gate,undefined);assert(got.queryReason);if(status===200)assert.equal(got.queryReason,'origin-timezone-unverified');
 }
 assert.equal(auth.radarAvailabilityLabel({httpStatus:401,queryReason:'response-context-expired'}),'Sessão necessária');assert.equal(auth.radarAvailabilityLabel({httpStatus:403}),'Acesso indisponível');
 console.log('PASS real authFetch HTTP200 domain negative/401/403/503 preserved by actual Home; no gate, no cache, session fence retained');
}finally{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
