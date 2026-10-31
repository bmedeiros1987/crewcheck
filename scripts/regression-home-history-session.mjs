import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {repairHistoryReadSession} from './roster-startup/home-continuity.mjs';

const source=fs.readFileSync('client/src/lib/databaseClient.ts','utf8');
assert.equal(repairHistoryReadSession(source),source,'actual prepared history must carry the read fence');
const ast=ts.createSourceFile('databaseClient.ts',source,99,true);
const names=['openRosterDisplayWindow','openDisplayCompetenceCandidate'];
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
assert.equal(functions.length,2);
const code=ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:99,module:ts.ModuleKind.CommonJS}}).outputText;
const roster=month=>({crewId:'900001',year:2026,month,days:[{date:`2026-${month}-01`}]});
const primary=roster(11),summaries=[9,10].map(month=>({id:`synthetic-${month}`,crewId:'900001',month,year:2026}));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(list,detail){
 let current=true;const requests=[],localReads=[],exports={};
 const context=vm.createContext({exports,captureAuthSession:()=>({isCurrent:()=>current}),
  crewIdentityToken:x=>x.crewId,rosterPeriodOrdinal:x=>x.month,
  listSavedRosters:async(limit,strict)=>{assert.equal(limit,72);assert.equal(strict,true,'do not initiate legacy active fallback after a stale list');return list();},
  getLocalRosterSummaries:()=>{localReads.push('local');return summaries;},
  newestDisplaySummaryByCompetence:items=>items.map(summary=>({summary,ordinal:summary.month})),
  openSavedRoster:async id=>{requests.push(id);return detail(id);},
  mergeRosterDisplayAdjacent:(a,b)=>({...a,days:[...a.days,...b.days]})});
 vm.runInContext(code,context);
 return {run:()=>exports.openRosterDisplayWindow(primary),change:()=>{current=false;},requests,localReads};
}
{
 const pending=deferred(),h=harness(()=>pending.promise,()=>{throw Error('unexpected detail');});
 const work=h.run();h.change();pending.resolve(summaries);assert.equal(await work,primary);assert.equal(h.requests.length,0);assert.equal(h.localReads.length,0);
}
for(const outcome of ['success','failure']){
 const pending=deferred(),started=deferred(),h=harness(()=>summaries,()=>{started.resolve();return pending.promise;});
 const work=h.run();await started.promise;h.change();
 if(outcome==='success')pending.resolve({roster:roster(9)});else pending.reject(Error('synthetic failure'));
 assert.equal(await work,primary);assert.equal(h.requests.length,1,'no next competence or fallback request after session change');assert.equal(h.localReads.length,0);
}
{
 const pending=deferred(),h=harness(()=>pending.promise,()=>{throw Error('unexpected detail');});
 const work=h.run();h.change();pending.reject(Error('synthetic list unavailable'));assert.equal(await work,primary);assert.equal(h.localReads.length,0);
}
{
 const h=harness(()=>summaries,id=>({roster:roster(Number(id.split('-').at(-1)))}));
 const result=await h.run();assert.equal(result.month,11);assert.equal(result.days.length,3);assert.deepEqual(h.requests,['synthetic-9','synthetic-10']);
}
console.log('PASS real historical-window/candidate functions: late list, late successful/failed detail, failed list, no follow-up/fallback query, normal history preserved');
