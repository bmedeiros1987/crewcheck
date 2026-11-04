// Real HTTP handler body -> real OFF capture (test-enabled) -> real owned
// canonical scope and segmented writer; synthetic transport/auth/SQL only.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {fixture} from './fixtures/operational-history-fixture.mjs';
import * as history from '../server/concierge/operational-history.mjs';
import {beginRadarOperationalHistory,handleRadarGateHistory} from '../server/concierge/radar-history-capture.mjs';
import {telegramOperationalAuthority as authority} from '../server/concierge/telegram-briefing.mjs';
import {buildCanonicalRosterEvents} from '../server/concierge/generated/canonicalRoster.mjs';
import {runCiriumFlightAwareSequence} from '../server/radar-sequential.mjs';
import * as policy from '../shared/gate-query-day.mjs';
import * as fields from '../shared/radar-field-evidence.mjs';
import {customGateSourceUpdate} from '../server/gate-source-update.mjs';
globalThis.fetch=()=>assert.fail('No external provider network');
const now=Date.parse('2099-10-06T06:00:00Z')+10000;
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
const extract=names=>names.map(name=>{const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(ast);}).join('\n');
for(const provider of ['cirium-flex','flightaware']){
 const f=fixture();f.now=now;f.roster.crewId='QA001';const event=buildCanonicalRosterEvents(f.roster).find(e=>e.kind==='flight');
 const i={flight:event.flightNumber,origin:event.origin,destination:event.destination,departureDate:policy.originFlightDate(event.startDateTime,event.origin),scheduledDepartureUtc:event.startDateTime};
 const identify=async()=>({db:f.db,email:f.context.email,profile:{public_id:f.context.owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:f.context.owner,email:f.context.email,exp:(now+86400000)/1000}});
 const options={enabled:true,identify,clock:()=>now,loadRuntime:async()=>({history:{...history,OPERATIONAL_HISTORY_ENABLED:true},authority})};
 let requests=0,sources=0,reply,status,historyResult;
 const raw={...i,ok:true,provider,gate:'18',terminal:'1',status:'Programado',sourceReceivedAt:now,gateUpdate:null,
 provenance:{occurrenceKey:'',matchedProviders:[provider],fields:{departureGate:{value:'18',provider,observedAt:null,receivedAt:new Date(now).toISOString(),coverageState:'provided_no_source_freshness'}}}};
 const scope=vm.createContext({...policy,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:class extends Date{static now(){return now;}},URL,buildCanonicalRosterEvents,
 beginRadarOperationalHistory:async(req,occ)=>{const capture=await beginRadarOperationalHistory(req,occ,options);assert.ok(capture,'capture ticket');return {...capture,commit:async result=>{historyResult=await capture.commit(result);return historyResult;}};},
 telegramRequestUser:()=>({email:f.context.email,authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,
 conciergeLoadSnapshot:async()=>null,conciergeAccessMatches:()=>false,
 loadOwnedPlatformRoster:async()=>({roster:f.roster,id:'synthetic-roster',revision:'synthetic-current'}),
 defaultCiriumRadarOptions:()=>undefined,ciriumRadarInjectionEnabled:()=>false,
 runRadarRace:async ctx=>{requests++;return runCiriumFlightAwareSequence({identity:ctx.gateQueryEvidence,admit:ctx.radarReadAdmission,now:()=>now,
 primary:async()=>{if(provider==='cirium-flex'){sources++;return raw;}return null;},fallback:provider==='cirium-flex'?null:async()=>{sources++;return raw;}});},
 conciergeApplyRadar:()=>assert.fail('Paid response must not mutate Concierge'),conciergeSaveSnapshotAsync:()=>assert.fail('Paid response must not save Concierge'),
 sendJson:(_,code,body)=>{status=code;reply=body;return body;}});
 vm.runInContext(extract(['firstKnown','normalizeFlightRaw','buildFlightContext','handleRadar']),scope);
 const url=new URL('https://fixture.invalid/api/radar-flight');for(const [k,v]of Object.entries(i))url.searchParams.set(k,v);
 const req={method:'GET',headers:{authorization:'Bearer synthetic-A'}};
 await scope.handleRadar(req,{},url);assert.equal(status,200);assert.equal(reply.gate,'18');assert.equal(reply.exportedToConcierge,false);assert.equal(requests,1);assert.equal(sources,1);
 assert.equal(historyResult?.stored,true,JSON.stringify(historyResult));
 let historical;
 await handleRadarGateHistory(req,{writableEnded:false,writeHead(code){assert.equal(code,200);},end(body){historical=JSON.parse(body);this.writableEnded=true;}},url,options);
 assert.equal(historical.history.currentConfirmation,false);assert.equal(historical.history.observations[0].provider,provider);assert.equal(historical.history.observations[0].gate,'18');
 assert.equal(historical.history.observations[0].observedAt,null);assert.equal(historical.history.observations[0].sourceUpdatedAt,null);assert.equal(requests,1);assert.equal(sources,1);
}
// The legacy race can select FlightAware while retaining an agreeing custom
// proof. Compose the REAL race/custom adapter/capture/archive instead of
// constructing a reported-only response that skips that boundary.
for(const kind of ['valid','valid-second-flight','gate-mismatch','future-proof','receipt-mismatch','uncaptured']){
 const f=fixture();f.now=now;f.roster.crewId='QA001';
 if(kind==='valid-second-flight')f.roster.days[0].legs.push({flightNumber:'LA4321',origin:'BSB',destination:'SSA',departureTime:'09:30',arrivalTime:'11:30',workType:'OP'});
 const event=buildCanonicalRosterEvents(f.roster).filter(e=>e.kind==='flight').at(-1);
 const i={flight:event.flightNumber,origin:event.origin,destination:event.destination,departureDate:policy.originFlightDate(event.startDateTime,event.origin),scheduledDepartureUtc:event.startDateTime};
 const identify=async()=>({db:f.db,email:f.context.email,profile:{public_id:f.context.owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:f.context.owner,email:f.context.email,exp:(now+86400000)/1000}});
 const opts={enabled:true,identify,clock:()=>now,loadRuntime:async()=>({history:{...history,OPERATIONAL_HISTORY_ENABLED:true},authority})};
 const req={headers:{authorization:'Bearer synthetic-A'}},capture=await beginRadarOperationalHistory(req,i,opts);assert.ok(capture);
 const raw={ok:true,...i,gate:'24',departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...i,gate:'24',updatedAt:new Date(now-1000).toISOString()}};
 let customCalls=0,flightAwareCalls=0;
 const race=vm.createContext({...policy,...fields,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:class extends Date{static now(){return now;}},URL,setTimeout,clearTimeout,process:{env:{CREWCHECK_RADAR_TIMEOUT_MS:'800'}},
  customGateSourceUpdate:p=>customGateSourceUpdate(p,now),ciriumRadarInjectionEnabled:()=>false,ciriumRadarProjection:()=>({}),configuredProviders:()=>[],
  envAny:()=> 'https://synthetic.invalid/{flight}',jsonFetch:async()=>{customCalls++;return {response:{ok:true},payload:structuredClone(raw)};},
  providerFlightAware:async()=>{flightAwareCalls++;return {ok:true,...i,provider:'flightaware',gate:'24',sourceReceivedAt:now-500};},
  providerAviationstack:async()=>null,providerAirLabs:async()=>null,providerAeroDataBox:async()=>null,scoreRadar:r=>r.provider==='flightaware'?80:40});
 vm.runInContext(extract(['firstKnown','publicRadarPayload','providerCustom','runRadarRace']),race);
 const result=await race.runRadarRace({gateQueryEvidence:i,operationalHistory:capture,raw:i.flight,iata:i.flight},i.origin,i.destination,i.scheduledDepartureUtc);
 assert.equal(result.provider,'flightaware');assert.equal(result.gateUpdate?.provider,'custom');assert.equal(result.gateEvidenceReceivedAt,now);assert.equal(result.sourceReceivedAt,now-500);
 if(kind==='gate-mismatch')result.gateUpdate={...result.gateUpdate,gate:'25'};
 if(kind==='future-proof')result.gateUpdate={...result.gateUpdate,sourceUpdatedAt:new Date(now+1000).toISOString()};
 if(kind==='receipt-mismatch')result.gateEvidenceReceivedAt=now-1;
 const target=kind==='uncaptured'?await beginRadarOperationalHistory(req,i,opts):capture;
 const committed=await target.commit(result);
 if(kind.startsWith('valid')){
  assert.equal(committed.stored,true,'AGREEING_CUSTOM_ARCHIVE: '+JSON.stringify({committed,records:f.states.size}));
  const page=await history.readArchivedOperationalGateHistory(f.db,f.context,i,{enabled:true,lockSource:true});
  assert.equal(page.observations.length,1);assert.equal(page.observations[0].provider,'custom');assert.equal(page.observations[0].gate,'24');
  assert.equal(page.observations[0].sourceUpdatedAt,new Date(now-1000).toISOString());assert.equal(page.observations[0].receivedAt,new Date(now).toISOString());assert.equal(page.observations[0].observedAt,null);assert.equal(page.currentConfirmation,false);
  assert.equal(result.provider,'flightaware');assert.equal(result.gateUpdate.provider,'custom','capture must not relabel the public winner/proof');
  const before=JSON.stringify([...f.states]);const repeat=await beginRadarOperationalHistory(req,i,opts);repeat.captureCustom(raw,now);
  assert.equal((await repeat.commit(result)).stored,false,'duplicate must not renew the original receipt');assert.equal(JSON.stringify([...f.states]),before);
  if(kind==='valid-second-flight')assert.equal(await f.read(),null,'all-flight archive must not broaden first-duty notification history');
  else assert.equal((await f.read()).source.observation.gate,'24','first-duty custom reader remains populated');
 }else{assert.equal(committed.stored,false,kind);assert.equal(f.states.size,0,kind+' must not fall back to a reported write');}
 assert.equal(customCalls,1);assert.equal(flightAwareCalls,1);
}
console.log('PASS real Radar handler/sequence plus real agreeing race/custom adapter/capture/archive: reported Flex/FlightAware, retained custom proof with original clocks, four invalid/uncaptured refusals, zero extra provider calls');
