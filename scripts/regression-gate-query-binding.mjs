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
const held=process.argv.includes('--held-before'),root=process.env.GATE_REVIEW2_ROOT;
if(held&&!root)throw Error('Set GATE_REVIEW2_ROOT to consumer-owned extracted 2f82 sources');
const policy=held?await import(pathToFileURL(root+'/gate-query-day.mjs').href):current;
const selected=process.argv.find(x=>x.startsWith('--case='))?.slice(7);
const leg=(flightNumber,origin,destination,departureTime,arrivalTime,gate)=>({flightNumber,origin,destination,departureTime,arrivalTime,gate});
const roster=days=>({year:2032,month:10,base:'GRU',days:days.map(x=>({...x,type:'VOO'}))});
if(!selected||selected==='unordered'){
 const r=roster([{date:'14/10/2032',legs:[leg('LA200','REC','BSB','12:00','14:00','old-200'),leg('LA100','GRU','REC','09:00','11:00','old-100')]}]);
 const events=buildCanonicalRosterEvents(r).filter(x=>x.kind==='flight');assert.equal(events[0].flightNumber,'LA100');
 for(const event of events){const bound=policy.findPublishedGateLeg(r,{flight:event.flightNumber,origin:event.origin,destination:event.destination,departureDate:'2032-10-14',scheduledDepartureUtc:event.startDateTime},events);
 assert(bound,`${event.flightNumber} must bind despite raw order`);assert.equal(bound.leg.flightNumber,event.flightNumber);}
 const duplicate=roster([{date:'14/10/2032',legs:[r.days[0].legs[1],{...r.days[0].legs[1]}]}]);
 assert.equal(policy.findPublishedGateLeg(duplicate,{flight:'LA100',origin:'GRU',destination:'REC',departureDate:'2032-10-14',scheduledDepartureUtc:'2032-10-14T12:00:00Z'},buildCanonicalRosterEvents(duplicate)),null,'indistinguishable raw rows fail closed');
 console.log('PASS stable published binding: unordered raw legs, unique tuples, indistinguishable duplicates denied');
}
function functions(file,names){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return names.map(name=>{const n=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===name);assert(n,name);return ts.transpileModule(n.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}).join('\n');}
let now=Date.parse('2032-10-14T12:00:00Z'),writes=0,reads=0,calls=0,removeOnSecondRead=false;
let r=roster([{date:'13/10/2032',legs:[leg('LA100','GRU','REC','09:00','11:00','old-13')]},{date:'14/10/2032',legs:[leg('LA100','GRU','REC','09:00','11:00','old-14')]}]);
let proven=true;const gateProof=()=>({version:1,provider:'custom',kind:'departure-gate-update',sourceUpdatedAt:new Date(now-60000).toISOString(),gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00.000Z'});
const fake=async()=>{calls++;return {ok:true,gate:'46',flight:'LA100',origin:'GRU',destination:'REC',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z',...(proven?{gateUpdate:gateProof()}:{})};};
const records=()=>r.days.map(day=>({day,legs:day.legs}));
const scope=vm.createContext({...policy,...radarEvidence,buildCanonicalRosterEvents,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:class extends Date{static now(){return now;}},process:{env:{}},setTimeout:()=>1,clearTimeout:()=>{},
 ciriumRadarInjectionEnabled:()=>false,defaultCiriumRadarOptions:()=>undefined,ciriumRadarProjection:()=>({}),scoreRadar:()=>95,configuredProviders:()=>[],
 providerFlightAware:fake,providerCustom:fake,providerAviationstack:fake,providerAirLabs:fake,providerAeroDataBox:fake,
 buildFlightContext:raw=>({raw}),telegramRequestUser:()=>({email:'fictional-a',authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,
 conciergeLoadSnapshot:async()=>{reads++;if(removeOnSecondRead&&reads===2)r.days[0].legs=[];return {email:'fictional-a',roster:r};},conciergeAccessMatches:()=>true,
 conciergeFindFlight:()=>({record:records()[0],leg:r.days[0].legs[0]}),conciergeSaveSnapshotAsync:async()=>{writes++;},sendJson:(_r,_s,data)=>data,
 conciergeExtractFlight:()=> 'LA100',conciergeNextProgram:()=>records()[0],conciergeNextJourneyProgram:()=>records()[0],conciergeProgramRecords:records,conciergeJourneyProgramRecords:(_r,rs)=>rs});
vm.runInContext(functions(held?root+'/server.mjs':'server.mjs',['firstKnown','publicRadarPayload','runRadarRace','handleRadar','conciergeRadarReply','conciergeApplyRadar']),scope);
if(!selected||selected==='repeated-date'){
 const reply=await scope.conciergeRadarReply('/radar LA100',{email:'fictional-a'},{roster:r});assert(calls>0);assert.match(reply,/46/);assert.equal(writes,1);
 assert.equal(r.days[0].legs[0].gate,'old-13','yesterday leg must remain untouched');assert.equal(r.days[0].legs[0].radarEvidence,undefined,'yesterday leg receives no radar evidence');assert.equal(r.days[1].legs[0].gate,'old-14','published gate is never overwritten');assert.equal(r.days[1].legs[0].radarEvidence.gate,'46','proven gate kept apart on exactly today leg');
 delete r.days[1].legs[0].radarEvidence;proven=false;writes=0;reads=0;const unproven=await scope.conciergeRadarReply('/radar LA100',{email:'fictional-a'},{roster:r});
 assert.match(unproven,/Portão: indisponível \(fonte sem horário de observação deste campo\)/);assert.doesNotMatch(unproven,/Portão: 46/);assert.doesNotMatch(unproven,/comprovado pela fonte/);assert.equal(r.days[1].legs[0].gate,'old-14','gate without source observation is never persisted');assert.equal(r.days[1].legs[0].radarEvidence,null,'no evidence without proof');assert.equal(r.days[0].legs[0].gate,'old-13');proven=true;
 console.log('PASS actual Concierge repeated flight dates: query and persistence bind exactly today occurrence');
}
if(!selected||selected==='removed'){
 r=roster([{date:'14/10/2032',legs:[leg('LA100','GRU','REC','09:00','11:00','old-14')]}]);writes=0;reads=0;calls=0;removeOnSecondRead=true;
 const url=new URL('https://fixture.invalid/api/radar-flight?flight=LA100&origin=GRU&destination=REC&departureDate=2032-10-14&scheduledDepartureUtc=2032-10-14T12:00:00Z');
 const result=await scope.handleRadar({}, {}, url);assert(calls>0);assert.equal(writes,0);assert.equal(result.ok,false,'removed occurrence cannot return fresh ok:true');assert.equal(result.queryReason,'response-occurrence-changed');
 console.log('PASS actual handler removal on second authorized read: zero export, fresh response suppressed');
}
