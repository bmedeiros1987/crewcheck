import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('client/src/lib/databaseClient.ts','utf8');
const ast=ts.createSourceFile('databaseClient.ts',source,ts.ScriptTarget.ES2022,true);
const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='listSavedRosters');
assert.ok(node);
const compiled=ts.transpileModule(node.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let reply,calls;
const local=[{id:'synthetic-local',createdAt:'2026-01-01'}];
const exports={};
vm.runInNewContext(compiled,{exports,getLocalRosterSummaries:()=>local,hasCrewCheckAuthToken:()=>true,normalizeSingleActiveSummary:items=>items,jsonFetch:async()=>{calls++;if(reply instanceof Error) throw reply;return reply;}});
for(const status of [401,403,500]) {
 const error=Object.assign(new Error('synthetic HTTP failure'),{status});reply=error;calls=0;
 await assert.rejects(exports.listSavedRosters(72,true),e=>e===error);
 assert.equal(calls,1);
 assert.equal((await exports.listSavedRosters(72,false))[0].id,'synthetic-local','legacy offline caller retains its existing scoped local fallback');
}
for(const invalid of [{ok:false},{ok:true},{ok:true,rosters:{}}]) {
 reply=invalid; await assert.rejects(exports.listSavedRosters(72,true),/inválida/);
}
reply={ok:true,rosters:[]};calls=0;
const result=await exports.listSavedRosters(72,true);
assert.equal(result.length,1,'valid online history may be merged with this account local copy');
assert.equal(calls,1,'strict history must not mask failures of an auxiliary active lookup');
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
assert.match(home,/listSavedRosters\(72, true\)/);
assert.match(home,/historyError \? <article/);
console.log('PASS: prepared strict history rejects HTTP/application/malformed failures instead of false empty; legacy offline fallback remains scoped.');
