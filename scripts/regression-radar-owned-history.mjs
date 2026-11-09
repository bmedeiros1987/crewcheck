import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import * as policy from '../shared/gate-query-day.mjs';
import {resolveOwnedGatePublication} from '../server/radar-publication-authority.mjs';
import {prepareConciergeCanonicalBridge} from './p1-concierge-journey/bridge.mjs';
prepareConciergeCanonicalBridge();
const {buildCanonicalRosterEvents}=await import('../server/concierge/generated/canonicalRoster.mjs');
function extract(file,name){const text=process.env.RADAR_HISTORY_BASE?execFileSync('git',['show',process.env.RADAR_HISTORY_BASE+':'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,text,99,true,ts.ScriptKind.JS);const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast).replace(/^export\s+/,'');}
const october={year:2026,month:10,crewId:'SYNTHETIC-A',base:'BSB',days:[{date:'31/10/2026',type:'VOO',dutyReport:'07:00',dutyDebrief:'10:00',legs:[{flightNumber:'LA4774',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'}]}]};
const november={...october,month:11,days:[{...october.days[0],date:'01/11/2026'}]};
const canonical=buildCanonicalRosterEvents(october).find(x=>x.flightNumber==='LA4774');assert(canonical);
const request={flight:'LA4774',origin:'BSB',destination:'GRU',departureDate:'2026-10-31',scheduledDepartureUtc:canonical.startDateTime};
const row=(id,roster,active=false)=>({id,roster,roster_key:`${roster.year}-${String(roster.month).padStart(2,'0')}`,owner_email:'a@example.invalid',updated_at:'2026-10-26T12:00:00Z',active});
let rows,owner,claims,reads,race,attempts,afterRead,atProvider,snapshot,now,selectedRequest,authenticated;
const scope=vm.createContext({...policy,gateQueryDay:i=>policy.gateQueryDay(i,now),resolveOwnedGatePublication,buildCanonicalRosterEvents,URL,process:{env:{}},Date:class extends Date{static now(){return now;}},
 safeEmail:x=>String(x||'').trim().toLowerCase(),verifyJwt:()=>claims,requestToken:()=> 'synthetic',
 pool:async()=>({query:async(sql,args)=>{assert(sql.startsWith('SELECT '));assert(sql.includes('owner_email=$1'));assert.deepEqual(Array.from(args),['a@example.invalid']);reads++;afterRead?.(reads);return {rows:structuredClone(sql.includes('active=TRUE')?rows.filter(r=>r.active):rows)};}}),
 telegramRequestUser:()=>({email:owner,authenticated}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:x=>String(x||'').trim().toLowerCase(),conciergeAccessMatches:()=>true,conciergeLoadSnapshot:async()=>snapshot,
 buildFlightContext:raw=>({raw}),ciriumRadarInjectionEnabled:()=>false,defaultCiriumRadarOptions:()=>undefined,
 runRadarRace:async ctx=>{race++;atProvider?.('before');const admitted=await ctx.radarReadAdmission();if(!admitted)return{querySuppressed:true,ok:false,queryReason:'source-authority-changed'};attempts++;atProvider?.('after');return{ok:true,gate:'18',...request};},sendJson:(_res,status,body)=>({...body,httpStatus:status}),conciergeApplyRadar:()=>{throw Error('historical must not write snapshot');},conciergeSaveSnapshotAsync:()=>{throw Error('no writes');}});
vm.runInContext(extract('server/platform.mjs','loadOwnedPlatformRoster')+'\n'+extract('server.mjs','handleRadar'),scope);
function reset(){rows=[row('oct',structuredClone(october)),row('nov',structuredClone(november),true)];owner='a@example.invalid';claims={email:owner};reads=0;race=0;attempts=0;afterRead=null;atProvider=null;snapshot=null;now=Date.parse('2026-10-31T09:00:00Z');selectedRequest={...request};authenticated=true;}
const cases=[];
async function test(name,setup,expected,expectedAttempts=expected?1:0){reset();setup?.();const reply=await scope.handleRadar({}, {},new URL('https://synthetic.invalid/api/radar-flight?'+new URLSearchParams(selectedRequest)));const passed=reply.ok===expected&&attempts===expectedAttempts;cases.push({name,passed,ok:reply.ok,reason:reply.queryReason||null,reads,race,attempts});}
await test('historical October / November active',null,true);
await test('legacy active publication without crew ID',()=>{rows[0].active=true;rows[1].active=false;delete rows[0].roster.crewId;},true);
await test('anonymous cannot read historical account publication',()=>{authenticated=false;snapshot={email:owner,roster:november};},false);
await test('active publication control',()=>{rows[0].active=true;rows[1].active=false;},true);
await test('Concierge active November missing historical occurrence',()=>{snapshot={email:owner,roster:november};},true);
await test('foreign JWT',()=>{claims={email:'b@example.invalid'};},false);
await test('visitor JWT',()=>{claims={email:owner,role:'visitor'};},false);
await test('foreign DB row',()=>{rows[0].owner_email='b@example.invalid';},false);
await test('different crew',()=>{rows[0].roster.crewId='SYNTHETIC-B';},false);
await test('no active publication',()=>{rows[1].active=false;},false);
await test('duplicate competence',()=>{rows.push({...structuredClone(rows[0]),id:'duplicate'});},false);
await test('ambiguous duplicate leg',()=>{rows[0].roster.days[0].legs.push({...rows[0].roster.days[0].legs[0]});},false);
await test('removed by current nominal revision despite older carry',()=>{rows[1].roster.days.push(...structuredClone(october.days));rows[0].roster.days=[];},false);
await test('truncated inventory',()=>{rows.push(...Array.from({length:71},()=>structuredClone(rows[0])));},false);
for(const [field,value] of [['flight','LA4775'],['origin','ZZZ'],['destination','REC'],['scheduledDepartureUtc','2026-10-31T12:00:00Z'],['departureDate','2026-11-01']])
 await test('client cannot select '+field,()=>{selectedRequest[field]=value;},false);
await test('invalid revision',()=>{rows[0].updated_at='invalid';},false);
for(const phase of ['before','after']){
 await test('revision changes '+phase+' provider',()=>{atProvider=p=>{if(p===phase)rows[0].updated_at='2026-10-31T09:00:01Z';};},false,phase==='after'?1:0);
 await test('deletion '+phase+' provider',()=>{atProvider=p=>{if(p===phase)rows=rows.filter(r=>r.id!=='oct');};},false,phase==='after'?1:0);
 await test('account change '+phase+' provider',()=>{atProvider=p=>{if(p===phase)owner='b@example.invalid';};},false,phase==='after'?1:0);
 await test('origin day expires '+phase+' provider',()=>{atProvider=p=>{if(p===phase)now=Date.parse('2026-11-01T03:00:00Z');};},false,phase==='after'?1:0);
}
await test('identity changes during DB read',()=>{afterRead=()=>{owner='b@example.invalid';};},false);
const output=process.env.RADAR_HISTORY_EVIDENCE||'artifacts/radar-owned-history.json';fs.mkdirSync(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});fs.writeFileSync(output,JSON.stringify({real:'handler + SQL-loader + canonical projection + matcher; JWT/DB/transport synthetic',cases},null,2)+'\n');
assert.deepEqual(cases.filter(c=>!c.passed),[]);console.log('PASS real Radar owned history: '+cases.length+' cases, zero external provider transport');
