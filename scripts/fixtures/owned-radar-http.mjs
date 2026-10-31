import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';
import * as policy from '../../shared/gate-query-day.mjs';
import * as fields from '../../shared/radar-field-evidence.mjs';
import * as injection from '../../server/cirium-radar-injection.mjs';
import {resolveOwnedGatePublication} from '../../server/radar-publication-authority.mjs';
import {buildCanonicalRosterEvents} from '../../server/concierge/generated/canonicalRoster.mjs';
const root=process.cwd();
function extract(file,names){const s=fs.readFileSync(root+'/'+file,'utf8'),ast=ts.createSourceFile(file,s,99,true,ts.ScriptKind.JS);return names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast).replace(/^export\s+/,'');}).join('\n');}
const body=extract('server/platform.mjs',['loadOwnedPlatformRoster'])+'\n'+extract('server.mjs',['firstKnown','normalizeFlightRaw','buildFlightContext','publicRadarPayload','runRadarRace','handleRadar']);
export function createBackend(readRows,mutation=''){const evidence=[];return{evidence,async call(url,token){
 const now=Date.parse('2026-10-31T09:00:00Z'),owner=token==='Bearer synthetic-local-only'?'continuity@example.invalid':'other@example.invalid';
 const record={flight:url.searchParams.get('flight'),queryKinds:[],providerCalls:0};
 const sandbox=vm.createContext({...policy,...fields,...injection,resolveOwnedGatePublication,buildCanonicalRosterEvents,URL,setTimeout,clearTimeout,Date:class extends Date{static now(){return now;}},gateQueryDay:i=>policy.gateQueryDay(i,now),process:{env:{}},
 telegramRequestUser:()=>({email:owner,authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeSafeKey:s=>String(s||'').trim().toLowerCase(),conciergeLoadSnapshot:async()=>null,conciergeAccessMatches:()=>true,
 verifyJwt:()=>({email:owner,role:'user'}),requestToken:()=>token,safeEmail:s=>String(s||'').trim().toLowerCase(),pool:async()=>({query:async(sql,values)=>{assert(sql.startsWith('SELECT '));assert(sql.includes('WHERE owner_email=$1'));assert.deepEqual(Array.from(values),[owner]);record.queryKinds.push(sql.includes('active=TRUE')?'active':'owned-history');return{rows:structuredClone(readRows().filter(row=>row.owner_email===owner&&(!sql.includes('active=TRUE')||row.active)))};}}),
 scoreRadar:()=>90,configuredProviders:()=>[],providerFlightAware:async()=>null,providerAviationstack:async()=>null,providerAirLabs:async()=>null,providerAeroDataBox:async()=>null,
 providerCustom:async ctx=>{record.providerCalls++;const response={ok:true,configured:true,provider:'custom',...ctx.gateQueryEvidence,sourceReceivedAt:now,gate:'18',status:'Programado',departure:ctx.gateQueryEvidence.scheduledDepartureUtc};if(mutation==='gate')response.gate='19';if(mutation==='date')response.scheduledDepartureUtc='2026-11-01T11:00:00.000Z';if(mutation==='provider')response.provider='flightaware';return response;},
 sendJson:(_res,status,payload)=>({status,payload}),conciergeApplyRadar:()=>{throw Error('historical write prohibited');},conciergeSaveSnapshotAsync:()=>{throw Error('historical write prohibited');}});
 vm.runInContext(body,sandbox);const result=await sandbox.handleRadar({}, {},url);record.result=result;evidence.push(record);return result;
}};}
