import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {legacyDemoFallback,ownedDemoFallback,repairOwnedDemoFallback} from './roster-startup/demo-fallback.mjs';
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
assert.ok(home.includes(ownedDemoFallback),'requires canonical prepared sources');
const legacy=home.replace(ownedDemoFallback,legacyDemoFallback);
assert.ok(legacy.includes('// roster-startup-account-choice-v1'),'old prepared marker is retained');
assert.equal(repairOwnedDemoFallback(legacy),home);
assert.equal(repairOwnedDemoFallback(home),home);
// Execute the actual v1432 demo step, with its real required() and snippets.
// Whole canonical replay is checked separately; this does not stand in for it.
const stage=fs.readFileSync('scripts/v1432/apply.mjs','utf8');
const ast=ts.createSourceFile('apply.mjs',stage,99,true,ts.ScriptKind.JS);
const call=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='update'&&n.expression.arguments[0]?.text==='client/src/pages/Home.tsx');
assert.ok(call);
const prefix=stage.slice(0,call.pos).replace(/^import .*;\r?\n/gm,'');
const context=vm.createContext({fs,ownedDemoFallback,input:home});
vm.runInContext(prefix,context);
const demoStep=call.expression.arguments[1].body.statements.find(n=>n.getText(ast).includes('carregamento automático da demonstração'));
assert.ok(demoStep);context.next=home;
const transformed=vm.runInContext(demoStep.getText(ast)+'; next;',context);
assert.equal(transformed,home,'earlier v1432 demo step must not reinsert an unguarded block');
context.next=home;
const unguardedStep=demoStep.getText(ast).replace('if (!next.includes(ownedDemoFallback)) ','');
const duplicated=vm.runInContext(unguardedStep+'; next;',context);
assert.equal((duplicated.match(/const demoActive =/g)||[]).length,2,'counterproof: the old v1432 step reinserts the legacy block');
assert.throws(()=>repairOwnedDemoFallback(duplicated),/Duplicate demo fallback/,'a previously duplicated tree must fail closed');
// Execute the complete startup apply script on an old prepared tree, twice.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'demo-startup-repair-'));
try{
 const files=['client/src/lib/databaseClient.ts','client/src/main.tsx','scripts/roster-startup/bootstrap-regression.mjs','scripts/regression-p0-530-adjacent-month-retention.mjs','scripts/regression-p2-530-adjacent-fallback-finance.mjs','scripts/regression-p0-multichannel-roster-gate.mjs','scripts/regression-p0-roster-date-integrity.mjs','scripts/regression-p2-738-vacation-work-first.mjs','scripts/regression-departure-positioning-terminal.mjs','scripts/regression-v14-3-39-history-chronological-ui.mjs'];
 for(const file of files){fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.copyFileSync(file,path.join(temp,file));}
 fs.mkdirSync(path.join(temp,'client/src/pages'),{recursive:true});fs.mkdirSync(path.join(temp,'client/src/styles'),{recursive:true});
 const target=path.join(temp,'client/src/pages/Home.tsx');fs.writeFileSync(target,legacy);
 const apply=path.resolve('scripts/roster-startup/apply.mjs');
 execFileSync(process.execPath,[apply],{cwd:temp,stdio:'pipe'});
 assert.equal(fs.readFileSync(target,'utf8'),home,'old prepared marker must receive the repair');
 const snapshot=files.concat(['client/src/pages/Home.tsx','client/src/styles/roster-startup.css','scripts/regression-v14-3-82-active-roster-bootstrap.mjs']).map(file=>[file,fs.readFileSync(path.join(temp,file),'utf8')]);
 execFileSync(process.execPath,[apply],{cwd:temp,stdio:'pipe'});
 for(const [file,bytes]of snapshot)assert.equal(fs.readFileSync(path.join(temp,file),'utf8'),bytes,'repeat stable: '+file);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS old-marker repair, v1432 actual demo-step replay and repeated startup apply byte stability');
