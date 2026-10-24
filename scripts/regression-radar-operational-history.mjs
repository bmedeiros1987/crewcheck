import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
import {beginRadarOperationalHistory} from '../server/concierge/radar-history-capture.mjs';
import {customGateSourceUpdate} from '../server/gate-source-update.mjs';
import * as policy from '../shared/gate-query-day.mjs';
import * as fields from '../shared/radar-field-evidence.mjs';
prepareConciergeCanonicalBridge();
const {buildCanonicalRosterEvents}=await import('../server/concierge/generated/canonicalRoster.mjs');
const {telegramOperationalAuthority:authority}=await import('../server/concierge/telegram-briefing.mjs');
globalThis.fetch=()=>assert.fail('External network forbidden');
const NOW=Date.parse('2032-10-06T06:00:00Z'),email='capture@example.invalid',owner='CC-SYNTHETIC-CAPTURE';let now=NOW;
class FixedDate extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const roster={year:2032,month:10,base:'GRU',rank:'CCM',days:[{date:'06/10/2032',type:'VOO',dutyReport:'05:30',dutyDebrief:'10:00',legs:[{flightNumber:'LA1234',origin:'GRU',destination:'BSB',departureTime:'06:30',arrivalTime:'08:30'}]}]};
const occurrence=policy.findPublishedGateOccurrence(roster,{flight:'LA1234',origin:'GRU',destination:'BSB',departureDate:'2032-10-06',scheduledDepartureUtc:'2032-10-06T09:30:00Z'},buildCanonicalRosterEvents(roster));assert(occurrence);
let currentOwner,revision,records,calls,identifies,late,raw,other,reads,historyEnabled,failWrite;
const db={async getConnection(){return {async beginTransaction(){},async commit(){},async rollback(){},release(){}};}};
const identify=async()=>{identifies++;return {db,email,profile:{public_id:currentOwner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:currentOwner,email,exp:(NOW+86400000)/1000}};};
const history={OPERATIONAL_HISTORY_ENABLED:true,
 async readOperationalHistoryScope(_c,who,opts){assert.equal(who.owner,owner);assert.equal(opts.lockSource,true);return {ownerId:owner,rosterRevision:revision,identity:structuredClone(occurrence)};},
 async recordOperationalGateObservation(_db,who,input,opts){assert.equal(who.owner,owner);assert.equal(opts.enabled,true);if(failWrite)throw Error('Synthetic write uncertainty');assert.equal(input.expectedScope.rosterRevision,revision);records.push(structuredClone(input));return {status:'baseline',stored:true};}};
const start=(req,o)=>beginRadarOperationalHistory(req,o,{enabled:true,identify,loadRuntime:async()=>({history:{...history,OPERATIONAL_HISTORY_ENABLED:historyEnabled},authority}),clock:()=>now});
const source=fs.readFileSync('server.mjs','utf8');const tree=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
const names=['firstKnown','normalizeFlightRaw','buildFlightContext','publicRadarPayload','providerCustom','runRadarRace','handleRadar'];
const extract=names.map(name=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(tree);}).join('\n');
const scope=vm.createContext({...policy,...fields,gateQueryDay:(i,t)=>policy.gateQueryDay(i,t??now),Date:FixedDate,URL,setTimeout,clearTimeout,Number,process:{env:{CREWCHECK_RADAR_TIMEOUT_MS:'800'}},
 beginRadarOperationalHistory:start,buildCanonicalRosterEvents,customGateSourceUpdate:p=>customGateSourceUpdate(p,now),
 envAny:()=> 'https://fixture.invalid/{flight}',jsonFetch:async()=>{calls++;late?.();return {response:{ok:true},payload:structuredClone(raw)};},
 providerFlightAware:async()=>other,providerAviationstack:async()=>null,providerAirLabs:async()=>null,providerAeroDataBox:async()=>null,scoreRadar:r=>r.quality||40,
 ciriumRadarInjectionEnabled:()=>false,defaultCiriumRadarOptions:()=>undefined,ciriumRadarProjection:()=>({}),configuredProviders:()=>[],
 telegramRequestUser:()=>({email,authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,conciergeAccessMatches:()=>true,
 conciergeLoadSnapshot:async()=>{reads++;return {email,key:email,roster};},conciergeApplyRadar(){},conciergeSaveSnapshotAsync:async()=>{},sendJson:(_r,status,value)=>({status,...value})});
vm.runInContext(extract,scope);
const url=()=>new URL('https://fixture.invalid/api/radar-flight?'+new URLSearchParams(occurrence));
function reset(){now=NOW;currentOwner=owner;revision='revision1';records=[];calls=0;identifies=0;late=null;other=null;reads=0;historyEnabled=true;failWrite=false;raw={flight:occurrence.flight,origin:occurrence.origin,destination:occurrence.destination,scheduledDepartureUtc:occurrence.scheduledDepartureUtc,departure:{gate:'24'},secret:'DO_NOT_STORE',departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...occurrence,gate:'24',updatedAt:new Date(NOW-1000).toISOString()}};}
const invoke=()=>scope.handleRadar({token:'synthetic-only'},{},url());
reset();const forbidden=()=>assert.fail('OFF touched dependency');assert.equal(await beginRadarOperationalHistory({},null,{identify:forbidden,loadRuntime:forbidden}),null);
historyEnabled=false;assert.equal(await start({},occurrence),null);assert.equal(identifies,0);historyEnabled=true;
reset();let result=await invoke();assert.equal(result.ok,true);assert.equal(calls,1);assert.equal(records.length,1);assert.equal(records[0].observation.gate,'24');assert.equal(records[0].observation.sourceReceivedAt,NOW);assert.doesNotMatch(JSON.stringify(records),/DO_NOT_STORE/);assert(!JSON.stringify(result).includes('departureGateUpdate'));assert.equal(identifies,2);
for(const kind of ['legacy','stale','future','mismatch','account','revision','write']){
 reset();if(kind==='legacy')delete raw.departureGateUpdate;
 if(kind==='stale')raw.departureGateUpdate.updatedAt=new Date(NOW-1800001).toISOString();
 if(kind==='future')raw.departureGateUpdate.updatedAt=new Date(NOW+1000).toISOString();
 if(kind==='mismatch')raw.departureGateUpdate.gate='25';
 if(kind==='account')late=()=>{currentOwner='CC-SYNTHETIC-OTHER';};
 if(kind==='revision')late=()=>{revision='revision2';};
 if(kind==='write')failWrite=true;
 result=await invoke();assert.equal(calls,1);assert.equal(records.length,0,kind+' cannot persist');assert.equal(result.ok,true,'history failure never relabels Radar result');
}
reset();other={ok:true,...occurrence,gate:'25',quality:80};await invoke();assert.equal(records.length,0,'cross-provider gate conflict blocks capture');
reset();other={ok:true,...occurrence,gate:'24',quality:80};result=await invoke();assert.equal(records.length,1,'agreeing custom proof retains original receipt when another response wins');assert.equal(records[0].observation.sourceReceivedAt,NOW);
reset();const session=await start({},occurrence);assert(session);session.captureCustom(raw,NOW);const projection={ok:true,...occurrence,gate:'24',sourceReceivedAt:NOW,gateUpdate:customGateSourceUpdate(raw,NOW)};assert.equal((await session.commit(projection)).stored,true);assert.equal((await session.commit(projection)).stored,false);assert.equal(records.length,1);
reset();const pending=await start({},occurrence);pending.captureCustom(raw,NOW);now+=1800001;assert.equal((await pending.commit(projection)).stored,false);assert.equal(records.length,0);
console.log('PASS actual app Radar -> original custom proof -> OFF capture boundary: no extra provider, source/receipt/occurrence, aliases, account/revision/expiry/conflict, agreeing proof, no raw leakage, uncertainty and one commit. Downstream store mocked here; real SQL covered separately; external calls=0.');
