// Cirium FlightStats Flex as a Radar source: opt-in, daily cap, exact occurrence,
// provider health. Real server functions; fake fetch; synthetic flight only.
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import ts from 'typescript';
import { radarResultDecision } from '../shared/gate-query-day.mjs';
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
const fn=name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return node.getText(ast);};
const now=Date.parse('2032-10-20T08:30:00Z');
const evidence={flight:'LA3622',origin:'GRU',destination:'SSA',departureDate:'2032-10-20',scheduledDepartureUtc:'2032-10-20T12:30:00Z'};
const row=(over={})=>({carrierFsCode:'LA',flightNumber:'3622',departureAirportFsCode:'GRU',arrivalAirportFsCode:'SSA',status:'S',
  departureDate:{dateLocal:'2032-10-20T09:30:00.000',dateUtc:'2032-10-20T12:30:00.000Z'},
  operationalTimes:{scheduledGateDeparture:{dateLocal:'2032-10-20T09:30:00.000',dateUtc:'2032-10-20T12:30:00.000'},estimatedGateDeparture:{dateLocal:'2032-10-20T09:40:00.000'}},
  airportResources:{departureGate:'12',departureTerminal:'2'},flightEquipment:{tailNumber:'PR-XYZ',actualEquipmentIataCode:'320'},...over});
let env,body,status,requests;
const scope=vm.createContext({URL,Date:class extends Date{static now(){return now;}},radarResultDecision,radarHealth:new Map(),ciriumFlexBudget:{day:'',calls:0},
  process:{get env(){return env;}},envAny:keys=>keys.map(k=>env[k]).find(Boolean)||'',
  firstKnown:(...v)=>v.find(x=>x!==undefined&&x!==null&&String(x).trim()!=='')??'',
  jsonFetch:async(url,options)=>{requests.push({url:String(url),options});return{response:{ok:status===200,status},payload:structuredClone(body)};}});
vm.runInContext(['providerAvailable','markProvider','ciriumFlexEnabled','ciriumFlexUtc','normalizeCiriumFlexFlight','providerCiriumFlex'].map(fn).join('\n'),scope);
const reset=(over={})=>{env={CIRIUM_APP_ID:'synthetic-id',CIRIUM_APP_KEY:'synthetic-key',CIRIUM_FLEX_RADAR_ENABLED:'true',...over};body={flightStatuses:[row()]};status=200;requests=[];scope.radarHealth.clear();Object.assign(scope.ciriumFlexBudget,{day:'',calls:0});};
const query=(ctx={iata:'LA3622',gateQueryEvidence:evidence})=>scope.providerCiriumFlex(ctx,1000);

// Opt-in: credentials alone never spend the plan.
reset({CIRIUM_FLEX_RADAR_ENABLED:''});assert.equal(await query(),null);assert.equal(requests.length,0);
reset({CIRIUM_APP_KEY:''});assert.equal(await query(),null);assert.equal(requests.length,0);

// Exact occurrence: one Flex Flight Status call, origin-scoped, mapped to the Radar contract.
reset();
const ok=await query();
assert.equal(ok.ok,true);assert.equal(ok.flight,'LA3622');assert.equal(ok.gate,'12');assert.equal(ok.terminal,'2');assert.equal(ok.status,'Programado');
assert.equal(ok.registration,'PR-XYZ');assert.equal(ok.scheduledDepartureUtc,'2032-10-20T12:30:00.000Z','dateUtc without suffix is UTC');
const url=new URL(requests[0].url);
assert.equal(url.origin+url.pathname,'https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/LA/3622/dep/2032/10/20');
assert.equal(url.searchParams.get('airport'),'GRU');assert.equal(requests[0].options.redirect,'error');
assert.equal(radarResultDecision({...ok,sourceReceivedAt:now},evidence,now).allowed,true,'answer passes the race occurrence check');
assert(scope.radarHealth.get('cirium-flex').lastOk);

// Other occurrence/route, duplicates and no data: "not found" for this flight only, no back-off.
for(const rows of [[row({departureAirportFsCode:'CGH'})],[row({operationalTimes:{scheduledGateDeparture:{dateUtc:'2032-10-21T12:30:00.000Z'}},departureDate:{dateUtc:'2032-10-21T12:30:00.000Z'}})],[row(),row()],[]]) {
  reset();body={flightStatuses:rows};
  const result=await query();assert.equal(result.ok,false);assert.match(result.message,/não localizado/);
  assert.equal(scope.radarHealth.get('cirium-flex'),undefined,'valid answer without the occurrence is not a provider failure');
}
// HTTP failure marks the source with its status and backs off.
reset();status=403;const denied=await query();assert.equal(denied.ok,false);
assert.equal(scope.radarHealth.get('cirium-flex').lastHttpStatus,403);assert.equal(await query(),null,'30 s back-off after failure');

// Daily cap per UTC day, counted before the call; invalid limit disables the source.
reset({CIRIUM_FLEX_DAILY_LIMIT:'2'});await query();await query();assert.equal(await query(),null);assert.equal(requests.length,2);
reset({CIRIUM_FLEX_DAILY_LIMIT:'zero'});assert.equal(await query(),null);assert.equal(requests.length,0);
// Unusable identity never calls.
reset();assert.equal(await query({iata:'LA3622X',gateQueryEvidence:evidence}),null);assert.equal(await query({iata:'LA3622',gateQueryEvidence:{...evidence,departureDate:''}}),null);assert.equal(requests.length,0);
// Wiring: race, configured providers, public provider key and app label.
for(const needle of ["['cirium-flex', () => providerCiriumFlex(ctx, timeoutMs)]","{ key: 'cirium-flex', available: ciriumFlexEnabled() }","'cirium-sky', 'cirium-flex'].includes(item.provider)"]) assert(source.includes(needle),needle);
assert.match(fs.readFileSync('client/src/lib/nextFlightGate.ts','utf8'),/'cirium-flex': 'Cirium'/);
console.log('PASS Cirium Flex Radar source: opt-in, exact occurrence, mapping, no-data without back-off, HTTP status/back-off, daily cap, wiring; fake fetch only');
