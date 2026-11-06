// Real handler/transport/diagnostics/capture/archive, synthetic auth/SQL/fetch only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
import {createRadarAttemptDiagnostics} from '../server/radar-attempt-diagnostics.mjs';
import * as policy from '../shared/gate-query-day.mjs';
import * as fields from '../shared/radar-field-evidence.mjs';
import {customGateSourceUpdate} from '../server/gate-source-update.mjs';
prepareConciergeCanonicalBridge();
const [{fixture},history,captureModule,{telegramOperationalAuthority:authority},{buildCanonicalRosterEvents}]=await Promise.all([
  import('./fixtures/operational-history-fixture.mjs'),import('../server/concierge/operational-history.mjs'),
  import('../server/concierge/radar-history-capture.mjs'),import('../server/concierge/telegram-briefing.mjs'),
  import('../server/concierge/generated/canonicalRoster.mjs')]);
assert.equal(captureModule.RADAR_OPERATIONAL_HISTORY_ENABLED,false);
assert.equal(history.OPERATIONAL_HISTORY_ENABLED,false);
globalThis.fetch=()=>assert.fail('External network forbidden');
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
const fn=name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return node.getText(ast);};
const names=['firstKnown','envAny','normalizeFlightRaw','buildFlightContext','providerAvailable','markProvider','noteProviderError','jsonFetch','publicRadarPayload','scoreRadar','runRadarRace','handleRadar'];
const AT=Date.parse('2099-10-06T06:00:10Z');
async function scenario(kind='valid',mutation=''){
  const f=fixture();f.now=AT;f.roster.crewId='QA001';
  const event=buildCanonicalRosterEvents(f.roster).find(e=>e.kind==='flight');
  const identity={flight:event.flightNumber,origin:event.origin,destination:event.destination,departureDate:policy.originFlightDate(event.startDateTime,event.origin),scheduledDepartureUtc:event.startDateTime};
  let now=AT,mode=kind,owner=f.context.owner,fetches=0,captures=0,identifications=0,runtimeLoads=0,committed,reply,httpStatus;
  const trace=[],diagnostics=createRadarAttemptDiagnostics({now:()=>now});
  const diagnosticFacade={transport(...args){trace.push('diagnostics.'+args[1]);diagnostics.transport(...args);},result(...args){trace.push('diagnostics.result');diagnostics.result(...args);},snapshot:()=>diagnostics.snapshot()};
  const raw={ok:true,...identity,gate:'24',status:'Embarque',secret:'SYNTHETIC_MUST_NOT_STORE',departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...identity,gate:'24',updatedAt:new Date(AT-1000).toISOString()}};
  if(kind==='no-proof')delete raw.departureGateUpdate;
  if(kind==='other-occurrence')raw.scheduledDepartureUtc=new Date(Date.parse(identity.scheduledDepartureUtc)+86400000).toISOString();
  const identify=async()=>{identifications++;return {db:f.db,email:f.context.email,profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email:f.context.email,exp:(now+86400000)/1000}};};
  const options={enabled:kind!=='off',identify,clock:()=>now,loadRuntime:async()=>{runtimeLoads++;return {history:{...history,OPERATIONAL_HISTORY_ENABLED:true},authority};}};
  if(kind==='write-failure'){
    const get=f.db.getConnection.bind(f.db);
    f.db.getConnection=async()=>{const c=await get(),query=c.query;c.query=async(sql,args)=>{if(sql.startsWith('INSERT'))throw Error('Synthetic storage failure');return query(sql,args);};return c;};
  }
  let custom=fn('providerCustom');
  if(mutation==='transport'){
    const before=custom;custom=custom.replace(", 'custom', ctx?.gateQueryEvidence)",')');assert.notEqual(custom,before,'transport mutation applied');
  }else if(mutation==='report'){
    const before=custom;custom=custom.replace('return report({\n    ok: true','return ({\n    ok: true');assert.notEqual(custom,before,'report mutation applied');
  }else if(mutation==='capture'){
    const before=custom;custom=custom.replace('const historyReceipt = ctx.operationalHistory?.captureCustom(payload, Date.now());','const historyReceipt = undefined;');assert.notEqual(custom,before,'capture mutation applied');
  }
  const scope=vm.createContext({...policy,...fields,Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}},URL,AbortController,setTimeout,clearTimeout,
    gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),radarHealth:new Map(),radarAttemptDiagnostics:diagnosticFacade,
    process:{env:{CREWCHECK_FLIGHT_STATUS_URL:'https://synthetic.invalid/{flight}',CREWCHECK_RADAR_TIMEOUT_MS:'800'}},
    buildCanonicalRosterEvents,customGateSourceUpdate:p=>customGateSourceUpdate(p,now),
    beginRadarOperationalHistory:async(req,i)=>{const capture=await captureModule.beginRadarOperationalHistory(req,i,options);return capture&&{...capture,
      captureCustom(...a){trace.push('history.capture');captures++;return capture.captureCustom(...a);},
      async commit(result){trace.push('history.commit');committed=await capture.commit(result);return committed;}};},
    fetch:async url=>{assert.equal(new URL(url).hostname,'synthetic.invalid');trace.push('fetch');fetches++;
      if(mode==='transport')throw Error('SYNTHETIC_MUST_NOT_STORE');
      if(mode==='account')owner='CC-SYNTHETIC-OTHER';
      if(mode==='revision')f.revision=AT+1000;
      return {ok:mode!=='http',status:mode==='http'?503:200,json:async()=>structuredClone(raw)};},
    providerFlightAware:async()=>null,providerAviationstack:async()=>null,providerAirLabs:async()=>null,providerAeroDataBox:async()=>null,
    configuredProviders:()=>[{key:'custom',available:true}],defaultCiriumRadarOptions:()=>undefined,ciriumRadarInjectionEnabled:()=>false,ciriumRadarProjection:()=>({}),
    telegramRequestUser:()=>({email:f.context.email,authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,
    conciergeLoadSnapshot:async()=>null,conciergeAccessMatches:()=>false,
    // The request loader is synthetic; real archive scope still rechecks its SQL publication revision.
    loadOwnedPlatformRoster:async()=>({roster:f.roster,id:'synthetic-roster',revision:'synthetic-current'}),
    conciergeApplyRadar:()=>assert.fail('No Concierge write'),conciergeSaveSnapshotAsync:()=>assert.fail('No Concierge write'),
    sendJson:(_,status,payload)=>{httpStatus=status;reply=payload;return payload;}});
  vm.runInContext(names.map(fn).concat(custom).join('\n'),scope);
  const req={method:'GET',headers:{authorization:'Bearer synthetic-A'}},url=new URL('https://synthetic.invalid/api/radar-flight?'+new URLSearchParams(identity));
  const invoke=()=>scope.handleRadar(req,{},url);
  await invoke();
  const state=()=>diagnostics.snapshot().providers.find(p=>p.provider==='custom');
  const read=async()=>{let status,value;await captureModule.handleRadarGateHistory(req,{writableEnded:false,writeHead(n){status=n;},end(body){value=JSON.parse(body);this.writableEnded=true;}},url,options);return {status,value};};
  return {f,identity,raw,trace,diagnostics,state,read,invoke,scope,req,url,get result(){return reply;},get status(){return httpStatus;},get committed(){return committed;},get fetches(){return fetches;},get captures(){return captures;},get identifications(){return identifications;},get runtimeLoads(){return runtimeLoads;},set mode(v){mode=v;},advance(){now++;f.now=now;}};
}
function assertSuccessfulComposition(s){
  assert.equal(s.status,200);assert.equal(s.result.ok,true);
  assert.equal(s.state().counts.networkAttempts,1,'CUSTOM_HISTORY_DIAGNOSTICS_TRANSPORT');
  assert.equal(s.state().counts.matchedWithGateResults,1,'CUSTOM_HISTORY_DIAGNOSTICS_REPORT');
  assert.equal(s.committed?.stored,true,'CUSTOM_HISTORY_CAPTURE');
  assert.equal(s.fetches,1);assert.equal(s.captures,1);assert.equal(s.result.sourceReceivedAt,AT);
  assert(s.trace.indexOf('diagnostics.http')<s.trace.indexOf('history.capture'));
  assert(s.trace.indexOf('history.capture')<s.trace.indexOf('diagnostics.result'));
  assert(s.trace.indexOf('diagnostics.result')<s.trace.indexOf('history.commit'));
  assert.equal(s.state().confirmedBilledUsage.units,null);
  assert.doesNotMatch(JSON.stringify(s.diagnostics.snapshot()),/synthetic\.invalid|SYNTHETIC_MUST_NOT_STORE|Bearer/);
  assert.doesNotMatch(JSON.stringify([...s.f.states]),/SYNTHETIC_MUST_NOT_STORE/);
}
const normal=await scenario();assertSuccessfulComposition(normal);
const beforeRead=JSON.stringify(normal.diagnostics.snapshot()),page=await normal.read();
assert.equal(page.status,200);assert.equal(page.value.history.currentConfirmation,false);assert.equal(page.value.history.observations.length,1);
assert.deepEqual(Object.fromEntries(['gate','provider','observedAt','sourceUpdatedAt','receivedAt'].map(k=>[k,page.value.history.observations[0][k]])),{gate:'24',provider:'custom',observedAt:null,sourceUpdatedAt:new Date(AT-1000).toISOString(),receivedAt:new Date(AT).toISOString()});
assert.equal(normal.fetches,1);assert.equal(JSON.stringify(normal.diagnostics.snapshot()),beforeRead,'historical read does not count or call provider');
const saved=JSON.stringify([...normal.f.states]);normal.advance();await normal.invoke();
assert.equal(normal.fetches,2);assert.equal(normal.state().counts.networkAttempts,2);assert.equal(normal.committed.stored,false);assert.equal(JSON.stringify([...normal.f.states]),saved,'duplicate never renews original receipt');
normal.advance();normal.mode='http';await normal.invoke();assert.equal(normal.result.ok,false);assert.equal(normal.state().counts.httpErrorResponses,1);assert.equal(normal.fetches,3);assert.equal(normal.captures,2);assert.equal(JSON.stringify([...normal.f.states]),saved,'HTTP failure cannot replace prior history');
await normal.invoke();assert.equal(normal.fetches,3,'failure cooldown survives previous successful history capture');
for(const kind of ['no-proof','other-occurrence','http','transport','account','revision','write-failure','off']){
  const s=await scenario(kind);assert.equal(s.fetches,1,kind);assert.equal(s.f.states.size,0,kind+' cannot archive');
  assert.equal(s.state().counts.networkAttempts,1,kind+' transport remains observed');
  if(kind==='http'){assert.equal(s.state().counts.httpErrorResponses,1);assert.equal(s.state().counts.unavailableResults,1);assert.equal(s.captures,0);}
  else if(kind==='transport'){assert.equal(s.state().counts.transportFailures,1);assert.equal(s.state().counts.httpResponses,0);assert.equal(s.captures,0);}
  else if(kind==='other-occurrence'){assert.equal(s.state().counts.rejectedOccurrenceResults,1);assert.equal(s.result.querySuppressed,true);}
  else{assert.equal(s.state().counts.matchedWithGateResults,1,kind);assert.equal(s.result.ok,true,kind+' history refusal must not relabel Radar result');}
  if(kind==='off'){assert.equal(s.runtimeLoads,0);assert.equal(s.identifications,0);assert.equal(s.captures,0);assert.equal(s.f.queries.length,0,'OFF returns before history DB/auth/runtime');}
  assert(!s.f.queries.some(q=>/^(CREATE|ALTER|DROP)\b/.test(q)),'no DDL');
}
for(const [mutation,marker] of [['transport','CUSTOM_HISTORY_DIAGNOSTICS_TRANSPORT'],['report','CUSTOM_HISTORY_DIAGNOSTICS_REPORT'],['capture','CUSTOM_HISTORY_CAPTURE']]){
  const bad=await scenario('valid',mutation);assert.throws(()=>assertSuccessfulComposition(bad),new RegExp(marker),'same contract rejects bad merge losing '+mutation);
  console.log('PASS merge counterproof rejected '+mutation+' at '+marker);
}
console.log('PASS real Custom transport/report + operational history composition: receipt/proof/archive, duplicate/read/cooldown, HTTP/transport/occurrence/account/revision/write/OFF refusals; no external requests or real data (TZ='+process.env.TZ+')');
