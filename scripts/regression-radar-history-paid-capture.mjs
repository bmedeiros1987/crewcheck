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
console.log('PASS real Radar handler + paid sequence + capture + scoped writer + history route: Flex/FlightAware each one synthetic source, no additional source on read, no Concierge mutation');
