import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
const functions=['loadRoster','buildCrewCheckDemoRoster'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name));
assert.ok(functions.every(Boolean),'requires canonical prepared sources');
const code=ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:99}}).outputText;
const key='crewcheck_roster_choice_v1_a',schema='p0-operational-date-anchor-v2',real={crewId:'900001',month:10,year:2026,days:[{date:'10/10/2026'}]};
function load(selection,options={}){
 const values=new Map();if(selection)values.set(options.foreign?'crewcheck_roster_choice_v1_b':key,JSON.stringify({owner:options.wrongOwner?'b':'a',selection,roster:real,cacheSchema:schema,cleared:options.cleared}));if(Object.hasOwn(options,'raw'))values.set(key,options.raw);
 const clock=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-31T12:00:00Z']));}};
 const context=vm.createContext({Date:clock,Intl,Boolean,JSON,pad2:n=>String(n).padStart(2,'0'),ROSTER_CACHE_SCHEMA:schema,startupOwner:()=> 'a',startupKey:()=>key,localStorage:{getItem:k=>{if(options.blocked)throw Error('synthetic blocked');return values.has(k)?values.get(k):null;}},sessionStorage:{getItem:k=>k==='crewcheck_demo_active'?'1':null},analyzeSafe:()=>({}),emptyRoster:()=>({days:[]}),neutralCompliance:()=>({})});
 vm.runInContext(code+'\nglobalThis.result=loadRoster();',context);return {result:context.result,values};
}
assert.equal(load(null).result.roster.crewId,'DEMO-001','genuine demo remains available without an owner choice');
assert.equal(load('explicit').result.roster.crewId,'900001','explicit own import remains available');
assert.equal(load('automatic').result.roster.days.length,0,'automatic choice must not silently become the next-month demo');
assert.equal(load('automatic',{foreign:true}).result.roster.crewId,'DEMO-001','another owner choice cannot select an import for this owner');
assert.equal(load(null,{blocked:true}).result.roster.days.length,0,'unreadable owner choice cannot authorize demo fallback');
for(const raw of ['', '{', 'null'])assert.equal(load(null,{raw}).result.roster.days.length,0,'present invalid value must not authorize a demo: '+JSON.stringify(raw));
assert.equal(load('explicit',{wrongOwner:true}).result.roster.days.length,0,'foreign owner in own key cannot be restored or authorize demo');
assert.equal(load('explicit',{cleared:true}).result.roster.days.length,0,'explicit clear cannot become a demo');
console.log('PASS real prepared loadRoster: demo/explicit/automatic/foreign/storage failure at UTC31Oct');
