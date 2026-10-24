import {beginRadarOperationalHistory} from '../server/concierge/radar-history-capture.mjs';
// Review regressions: actual canonical engine + actual handler/Concierge functions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
import * as current from '../shared/gate-query-day.mjs';
import * as radarEvidence from '../shared/radar-field-evidence.mjs';
prepareConciergeCanonicalBridge();
const {buildCanonicalRosterEvents}=await import('../server/concierge/generated/canonicalRoster.mjs');
const held=process.argv.includes('--held-before');
const heldRoot=process.env.GATE_HELD_ROOT;
if(held&&!heldRoot)throw Error('Set GATE_HELD_ROOT to consumer-owned extracted 20a60c sources');
const policy=held?await import(pathToFileURL(heldRoot+'/gate-query-day.mjs').href):current;
const selected=process.argv.find(x=>x.startsWith('--case='))?.slice(7);
function roster(origin='GRU',date='14/10/2032',legs){return {year:2032,month:10,base:origin,days:[{date,type:'VOO',legs:legs||[{flightNumber:'LA100',origin,destination:'REC',departureTime:'09:00',arrivalTime:'11:00',duration:2}]}]};}
const choose=(r,q)=>policy.findPublishedGateOccurrence(r,q,buildCanonicalRosterEvents(r));
if(!selected||selected==='brt'){
 for(const origin of ['GRU','MAO','RBR']){
  const r=roster(origin),q={flight:'LA100',origin,destination:'REC',departureDate:'2032-10-14',scheduledDepartureUtc:'2032-10-14T12:00:00Z'};
  const proof=choose(r,q);assert(proof,`09:00 BRT=12:00Z must bind ${origin}, not origin's 09:00 wall-clock`);assert.equal(Date.parse(proof.scheduledDepartureUtc),Date.parse(q.scheduledDepartureUtc));
 }
 const midnight=roster('RBR','14/10/2032',[{flightNumber:'LA100',origin:'RBR',destination:'REC',departureTime:'00:30',arrivalTime:'02:00'}]);
 const event=buildCanonicalRosterEvents(midnight).find(x=>x.kind==='flight');
 assert.equal(event.startDateTime,'2032-10-14T03:30:00.000Z');
 assert(choose(midnight,{flight:'LA100',origin:'RBR',destination:'REC',departureDate:'2032-10-13',scheduledDepartureUtc:event.startDateTime}),'BRT date14 is still origin date13');
 const rollover=roster('GRU','13/10/2032',[
  {flightNumber:'LA099',origin:'BSB',destination:'GRU',departureTime:'23:00',arrivalTime:'00:10',duration:70/60},
  {flightNumber:'LA100',origin:'GRU',destination:'REC',departureTime:'00:40',arrivalTime:'02:40',duration:2},
 ]);
 const rolled=buildCanonicalRosterEvents(rollover).find(x=>x.flightNumber==='LA100');assert.equal(rolled.startDateTime,'2032-10-14T03:40:00.000Z');
 assert(choose(rollover,{flight:'LA100',origin:'GRU',destination:'REC',departureDate:'2032-10-14',scheduledDepartureUtc:rolled.startDateTime}),'real canonical leg rollover retained');
 console.log('PASS canonical BRT -> UTC -> origin day: GRU/MAO/RBR, differing calendar date, real multi-leg rollover');
}
function functions(file,names){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return names.map(name=>{const n=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===name);assert(n,name);return ts.transpileModule(n.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}).join('\n');}
let now=Date.parse('2032-10-14T12:00:00Z'),calls=0,writes=0,reads=0,expireOnSecondRead=false,changeAccountOnSecondRead=false,account='fictional-a';
const r=roster(),snapshot={email:'fictional-a',roster:r};const profile={email:'fictional-a',authenticated:true};
let proven=true;const gateProof=()=>({version:1,provider:'custom',kind:'departure-gate-update',sourceUpdatedAt:new Date(now-60000).toISOString(),gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00.000Z'});
const fake=async()=>{calls++;return {ok:true,gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z',...(proven?{gateUpdate:gateProof()}:{})};};
const records=[{day:r.days[0],legs:r.days[0].legs}];
const scope=vm.createContext({beginRadarOperationalHistory,...policy,...radarEvidence,buildCanonicalRosterEvents,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:class extends Date{static now(){return now;}},process:{env:{}},setTimeout:()=>1,clearTimeout:()=>{},
 ciriumRadarInjectionEnabled:()=>false,defaultCiriumRadarOptions:()=>undefined,ciriumRadarProjection:()=>({}),scoreRadar:()=>95,configuredProviders:()=>[],
 providerFlightAware:fake,providerCustom:fake,providerAviationstack:fake,providerAirLabs:fake,providerAeroDataBox:fake,
 buildFlightContext:raw=>({raw}),telegramRequestUser:()=>({email:account,authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,
 conciergeLoadSnapshot:async()=>{reads++;if(reads===2&&expireOnSecondRead)now=Date.parse('2032-10-15T03:00:00Z');if(reads===2&&changeAccountOnSecondRead)account='fictional-b';return snapshot;},
 conciergeAccessMatches:()=>true,conciergeFindFlight:()=>({record:records[0],leg:r.days[0].legs[0]}),conciergeApplyRadar:()=>{},conciergeSaveSnapshotAsync:async()=>{writes++;},sendJson:(_r,_s,data)=>data,
 conciergeExtractFlight:()=> 'LA100',conciergeNextProgram:()=>records[0],conciergeNextJourneyProgram:()=>records[0],conciergeProgramRecords:()=>records,conciergeJourneyProgramRecords:()=>records,
});
vm.runInContext(functions(held?heldRoot+'/server.mjs':'server.mjs',['firstKnown','publicRadarPayload','runRadarRace','handleRadar','conciergeRadarReply']),scope);
if(!selected||selected==='concierge'){
 const reply=await scope.conciergeRadarReply('/radar LA100',profile,snapshot);assert(calls>0,'today Concierge must derive UTC from authorized real canonical roster');assert.match(reply,/Portão: 46/);assert.equal(writes,1);const keptWrites=writes;proven=false;const unproven=await scope.conciergeRadarReply('/radar LA100',profile,snapshot);assert.match(unproven,/Portão: indisponível \(fonte sem horário de observação deste campo\)/);assert.doesNotMatch(unproven,/Portão: 46/);assert.equal(writes,keptWrites+1,'unproven reply still records the radar response (raw values plus gaps), never as proof');proven=true;writes=keptWrites;console.log('PASS actual today Concierge derives canonical UTC and queries fictional providers');
}
if(!selected||selected==='last-await'){
 calls=0;writes=0;reads=0;now=Date.parse('2032-10-14T12:00:00Z');expireOnSecondRead=true;
 const url=new URL('https://fixture.invalid/api/radar-flight?flight=LA100&origin=GRU&destination=REC&departureDate=2032-10-14&scheduledDepartureUtc=2032-10-14T12:00:00Z');
 const result=await scope.handleRadar({}, {}, url);assert(calls>0);assert.equal(writes,0,'midnight during LAST snapshot await must block export');assert.equal(result.ok,false);assert.equal(result.queryReason,'response-context-expired');
 reads=0;writes=0;expireOnSecondRead=false;changeAccountOnSecondRead=true;now=Date.parse('2032-10-14T12:00:00Z');account='fictional-a';
 const changed=await scope.handleRadar({}, {}, url);assert.equal(writes,0);assert.equal(changed.ok,false);console.log('PASS actual last-await midnight/account fences: zero export and no ok:true');
}
