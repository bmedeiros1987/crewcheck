import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const file='client/src/pages/Home.tsx',source=process.argv.includes('--baseline')?execFileSync('git',['show','7b53c1cb:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let view;for(const n of ast.statements)if(ts.isFunctionDeclaration(n)&&n.name?.text==='GymsView')view=n;assert(view,'use real GymsView');
const effects=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect')effects.push(n.arguments[0].getText(ast));ts.forEachChild(n,walk)}walk(view);
const searchEffect=effects.find(code=>/\bsearch\(\)/.test(code));assert(searchEffect,'preserve the existing non-gym consumer');
for(const category of ['gym','hotel','pharmacy']){let calls=0;const run=()=>vm.runInNewContext('('+searchEffect+')()',{category,search:()=>{calls++;}});run();assert.equal(calls,category==='gym'?0:1,'mount/search-filter effect is passive for gym only');if(category==='gym'){run();run();assert.equal(calls,0,'filter updates do not repeat gym requests');}}
assert(!effects.some(code=>code.includes('getCurrentGeoPosition()')),'mount does not request GPS');
console.log('PASS actual GymsView effect: no automatic gym/GPS request, existing non-gym effect preserved; no network');
