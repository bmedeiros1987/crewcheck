import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
const root=process.env.RADAR_SOURCE_ROOT || process.cwd(),require=createRequire(path.join(root,'package.json'));
const ts=require('typescript'),{build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
prepareConciergeCanonicalBridge(root);
const policy=await import(pathToFileURL(path.join(root,'shared/gate-query-day.mjs')).href),radarEvidence=await import(pathToFileURL(path.join(root,'shared/radar-field-evidence.mjs')).href);
const {followedFlight}=await import(pathToFileURL(path.join(root,'shared/followedFlights.mjs')).href);
const injection=await import(pathToFileURL(path.join(root,'server/cirium-radar-injection.mjs')).href);
const {buildCanonicalRosterEvents}=await import(pathToFileURL(path.join(root,'server/concierge/generated/canonicalRoster.mjs')).href);
globalThis.fetch=()=>{throw Error('Real network forbidden');};
function extract(file,names,optional=false,jsx=false){const s=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true,jsx?ts.ScriptKind.TSX:ts.ScriptKind.JS);return names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!fn&&optional)return '';assert(fn,name);return jsx?ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText:fn.getText(ast);}).join('\n');}
const now=Date.parse('2032-10-14T12:00:00Z'),roster={year:2032,month:10,base:'GRU',days:[{date:'14/10/2032',type:'VOO',legs:[{flightNumber:'LA100',origin:'GRU',destination:'REC',departureTime:'09:00',arrivalTime:'11:00',gate:'24'}]}]};
let sourceDate='2032-10-15T12:00:00Z',saveCalls=0,providerCalls=0,estimated='',selectedNow=now;
const scope=vm.createContext({...policy,...injection,...radarEvidence,buildCanonicalRosterEvents,gateQueryDay:(x,t)=>policy.gateQueryDay(x,t??selectedNow),Date:class extends Date{static now(){return selectedNow;}},URL,setTimeout,clearTimeout,
 process:{env:{CREWCHECK_RADAR_TIMEOUT_MS:'800'}},envAny:keys=>keys.includes('FLIGHTAWARE_AEROAPI_KEY')?'OFFLINE_ONLY':'',providerAvailable:()=>true,markProvider:()=>{},
 jsonFetch:async()=>{providerCalls++;return{response:{ok:true},payload:{flights:[{ident:'LAN100',gate_origin:'99',scheduled_out:sourceDate,estimated_out:estimated,origin:{code_iata:'GRU'},destination:{code_iata:'REC'}}]}};},
 providerCustom:async()=>null,providerCiriumFlex:async()=>null,providerAviationstack:async()=>null,providerAirLabs:async()=>null,providerAeroDataBox:async()=>null,
 telegramRequestUser:()=>({email:'fixture@example.invalid',authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>x,
 conciergeLoadSnapshot:async()=>({email:'fixture@example.invalid',roster}),conciergeAccessMatches:()=>true,conciergeApplyRadar:()=>{},conciergeSaveSnapshotAsync:async()=>{saveCalls++;},sendJson:(_r,_s,p)=>p});
vm.runInContext(extract('server.mjs',['radarAirportCode','flightAwareAirport','flightAwareScheduledDeparture','flightAwareOccurrenceRank','selectFlightAwareOccurrence'],true)+extract('server.mjs',['firstKnown','normalizeFlightRaw','buildFlightContext','normalizeFlightAwareFlight','providerFlightAware','runRadarRace','handleRadar','scoreRadar','publicRadarPayload']),scope);
const url=new URL('https://fixture.invalid/api/radar-flight?flight=LA100&origin=GRU&destination=REC&departureDate=2032-10-14&scheduledDepartureUtc=2032-10-14T12:00:00Z&scheduledDeparture=2032-10-15T12:00:00Z&force=1');
const rejected=await scope.handleRadar({}, {},url);assert.equal(rejected.ok,false,'only neighboring-day source cannot become fresh ok:true');assert(!rejected.gate);assert.equal(saveCalls,0);
sourceDate='2032-10-14T12:00:00Z';estimated='2032-10-15T12:00:00Z';
const good=await scope.handleRadar({}, {},url);assert.equal(good.ok,true);assert.equal(good.scheduledDepartureUtc,sourceDate,'scheduled source identity survives operational delay');assert.equal(good.departure,estimated);assert.equal(saveCalls,1);
selectedNow=Date.parse('2032-10-14T02:59:59Z');const calls=providerCalls;await scope.handleRadar({}, {},url);assert.equal(providerCalls,calls,'force before origin day remains zero-provider');selectedNow=now;
console.log('PASS actual raw/prepared server: neighboring-only row blocked, canonical URL override, aliases, delayed same flight and pre-day force');
const compiled=await build({stdin:{contents:"export {resolveNextFlightGate,canonicalFlightId,RADAR_GATE_STALE_MS} from './client/src/lib/nextFlightGate';export {radarAvailabilityLabel} from './client/src/lib/radarAvailability';",resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};Function('module','exports','require',compiled.outputFiles[0].text)(m,m.exports,require);
const provenGood={...good,sourceOrigin:'GRU',sourceDestination:'REC',operationalEvidence:{gate:{version:1,value:'99',sourceObservedAt:'2032-10-14T12:00:00Z',provenance:'synthetic-field-observation'}}};
let cached={...provenGood,updatedAt:now},manual={scheduledDepartureUtc:'2032-10-14T12:00:00Z',gate:'24',terminal:'1',author:'fixture',flight:'LA100',date:'2032-10-14',origin:'GRU',destination:'REC',setAtEpochMs:now};
const event={id:'fixture-event',kind:'flight',flightNumber:'LA100',origin:'GRU',destination:'REC',day:{date:'14/10/2032'},date:new Date('2032-10-14T12:00:00Z'),canonical:{date:'2032-10-14',startDateTime:'2032-10-14T12:00:00Z'},departure:'09:00',arrival:'11:00'};
const client=vm.createContext({...policy,...m.exports,followedFlight,resolveNextFlightGate:input=>m.exports.resolveNextFlightGate({...input,now}),React,Date:class extends Date{static now(){return now;}},localStorage:{},getStoredUser:()=>({}),manualGateAccountKey:()=> 'fixture-account',readManualGate:()=>manual,readRadarSnapshot:()=>cached,useRadarSnapshot:()=>cached,
 useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect:()=>{},useRef:v=>({current:v}),getToken:()=> 'fixture-token',safe:(v,f='')=>v||f,normalizedAirlineCode:()=> 'LA',airlineNameFor:()=> 'LATAM',city:x=>x,flightWorkType:()=>'',workTypeLabel:()=>'',flightWorkClass:()=>'',isHomeStandby:()=>false,rosterEventTitle:()=> 'Voo',dateChip:()=> '14/10',weekday:()=> 'fixture-day',duration:()=> '',time:(v,f)=>v||f,window:{dispatchEvent:()=>{},open:()=>{}}});
const home=fs.readFileSync(path.join(root,'client/src/pages/Home.tsx'),'utf8'),homeAst=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function visit(n){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){const name=n.tagName.getText(homeAst);if(/^[A-Z][A-Za-z0-9]*$/.test(name))client[name]=()=>null;}ts.forEachChild(n,visit);}visit(homeAst);
vm.runInContext(extract('client/src/pages/Home.tsx',['followCandidate'],true,true)+extract('client/src/pages/Home.tsx',['validatedRadarForEvent','radarGateInfo','radarFlightDateLabel','FlightCard','RadarView'],false,true),client);
for(const component of ['FlightCard','RadarView']){
 cached={...provenGood,scheduledDepartureUtc:'2032-10-15T12:00:00Z',departure:'2032-10-15T12:00:00Z',updatedAt:now};
 let html=renderToStaticMarkup(client[component]({event}));assert(!html.includes('99'),`${component} cannot display neighboring gate`);assert(html.includes('24'),`${component} retains manual`);assert(html.includes('Escala 14/10/2032'));assert(html.includes('America/Sao_Paulo'));
 manual=null;cached={...good,updatedAt:now,sourceReceivedAt:now};html=renderToStaticMarkup(client[component]({event}));assert(!html.includes('99'),`${component} receipt without field observation is not operational`);
 manual=null;cached={...provenGood,updatedAt:now-31*60000,sourceReceivedAt:now-31*60000};html=renderToStaticMarkup(client[component]({event}));assert(!html.includes('99'),`${component} stale source denied`);
 cached={...provenGood,updatedAt:now,sourceReceivedAt:now};html=renderToStaticMarkup(client[component]({event}));assert(html.includes('99'),`${component} verified planned occurrence accepted despite estimated next day`);manual={scheduledDepartureUtc:'2032-10-14T12:00:00Z',origin:'GRU',destination:'REC',gate:'24',terminal:'1',author:'fixture',flight:'LA100',date:'2032-10-14',setAtEpochMs:now};
}
const rbr={...event,origin:'RBR',day:{date:'14/10/2032'},canonical:{date:'2032-10-14',startDateTime:'2032-10-14T03:30:00Z'}};const label=client.radarFlightDateLabel(rbr);assert(label.includes('Escala 14/10/2032'));assert(label.includes('Origem 13/10/2032'));assert(label.includes('America/Rio_Branco'));
for(const flight of ['LAN100','LA 100','TAM100','JJ100','LAN100-suffix','LA0100'])assert.equal(policy.radarFlightId(flight),m.exports.canonicalFlightId(flight));
console.log('PASS actual RadarView/FlightCard JSX: manual preserved; neighboring/stale source hidden; verified scheduled identity; published BRT date and origin zone/day differ correctly; synthetic React hooks only');
