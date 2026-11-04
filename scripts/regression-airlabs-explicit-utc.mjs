import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../shared/gate-query-day.mjs';
import * as injection from '../server/cirium-radar-injection.mjs';
import * as fields from '../shared/radar-field-evidence.mjs';

// Real adapter/race/public projection; only credentials, transport and clock are synthetic.
const text=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',text,99,true,ts.ScriptKind.JS);
const names=['firstKnown','normalizeFlightRaw','buildFlightContext','providerAirLabs','scoreRadar','publicRadarPayload','runRadarRace'];
const source=names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast);}).join('\n');
const now=Date.parse('2026-11-04T13:30:00Z');
const identity={flight:'LA8138',origin:'GRU',destination:'AEP',departureDate:'2026-11-04',scheduledDepartureUtc:'2026-11-04T20:05:00.000Z'};
let row,calls=0;
const scope=vm.createContext({...policy,...injection,...fields,Date:class extends Date{static now(){return now;}},URL,setTimeout,clearTimeout,
 process:{env:{CREWCHECK_RADAR_TIMEOUT_MS:'800'}},envAny:keys=>keys.includes('AIRLABS_API_KEY')?'SYNTHETIC_ONLY':'',providerAvailable:()=>true,markProvider:()=>{},
 jsonFetch:async()=>{calls++;return{response:{ok:true,status:200},payload:{response:row}};},
 providerFlightAware:async()=>null,providerCustom:async()=>null,providerAviationstack:async()=>null,providerAeroDataBox:async()=>null,
 configuredProviders:()=>[{key:'airlabs',available:true}]});
vm.runInContext(source,scope);
const cases=[
 ['named UTC minute/space',{dep_time_utc:'2026-11-04 20:05'},true],
 ['named UTC minute/T',{dep_time_utc:'2026-11-04T20:05'},true],
 ['named UTC second',{dep_time_utc:'2026-11-04 20:05:00'},true],
 ['named UTC fractional',{dep_time_utc:'2026-11-04T20:05:00.000'},true],
 ['named UTC trimmed',{dep_time_utc:' 2026-11-04 20:05 '},true],
 ['explicit UTC unchanged',{dep_time_utc:identity.scheduledDepartureUtc},true],
 ['explicit local offset fallback',{dep_time:'2026-11-04T17:05:00-03:00'},true],
 ['named UTC retains precedence',{dep_time_utc:'2026-11-04 20:05',dep_time:'2026-11-04T19:05:00Z'},true],
 ['local fallback without zone',{dep_time:'2026-11-04 17:05'},false],
 ['local UTC-looking fallback without zone',{dep_time:'2026-11-04T20:05:00'},false],
 ['named UTC is not origin local',{dep_time_utc:'2026-11-04 17:05',dep_time:'2026-11-04T17:05:00-03:00'},false],
 ['wrong day',{dep_time_utc:'2026-11-03 20:05'},false],
 ['invalid calendar',{dep_time_utc:'2026-02-30 20:05'},false],
 ['invalid hour',{dep_time_utc:'2026-11-04 25:05'},false],
 ['impossible fraction',{dep_time_utc:'2026-11-04 20:05.0'},false],
 ['quoted timestamp',{dep_time_utc:'"2026-11-04 20:05"'},false],
 ['date only',{dep_time_utc:'2026-11-04'},false],
 ['numeric epoch',{dep_time_utc:Date.parse(identity.scheduledDepartureUtc)},false],
 ['estimate is not planned',{dep_estimated:identity.scheduledDepartureUtc},false],
 ['missing schedule',{},false],
 ['wrong flight',{dep_time_utc:'2026-11-04 20:05',flight_iata:'LA3728'},false],
 ['wrong origin',{dep_time_utc:'2026-11-04 20:05',dep_iata:'CGH'},false],
 ['wrong destination',{dep_time_utc:'2026-11-04 20:05',arr_iata:'SSA'},false],
];
for(const[name,change,allowed]of cases){row={flight_iata:'LA8138',dep_iata:'GRU',arr_iata:'AEP',dep_gate:'QA18',status:'scheduled',...change};calls=0;
 const ctx={...scope.buildFlightContext('LA8138'),gateQueryEvidence:identity};
 const result=await scope.runRadarRace(ctx,'GRU','AEP');
 assert.equal(result.ok,allowed,name);assert.equal(calls,1,'one existing synthetic request only: '+name);
 if(!allowed){assert.equal(result.querySuppressed,true,name);assert(!result.gate,'rejected source never exposes a gate: '+name);
  const reason=name==='named UTC is not origin local'?'source-other-occurrence':name==='wrong day'?'source-other-day':['wrong flight','wrong origin','wrong destination'].includes(name)?'source-other-flight-or-route':'source-instant-unverified';
  assert.equal(result.queryReason,reason,name);
 }else{assert.equal(result.gateUpdate,null,'no operational gate proof invented: '+name);assert.equal(result.sourceReceivedAt,now,'existing receipt clock preserved: '+name);}
}
console.log(`PASS Airlabs explicit UTC: ${cases.length} real adapter/race cases; ambiguous local stays rejected; exact occurrence guards intact; zero external requests (${process.env.TZ||'UTC'})`);
