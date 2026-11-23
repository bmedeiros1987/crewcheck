import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as icons from 'lucide-react';import ts from 'typescript';
const source=ts.createSourceFile('Home.tsx',fs.readFileSync('client/src/pages/Home.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='BottomNav');assert(fn,'real BottomNav required');
const code=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const scope={React,...React,...icons,HomeIcon:icons.Home,storage:{get:(_k,f)=>f,set:()=>{}},document:{body:{}},createPortal:n=>n};vm.runInNewContext(code+'\nthis.Nav=BottomNav;',scope);
const items=[...fn.getText(source).matchAll(/\['(\w+)','([^']+)',\w+\]/g)].map(m=>m[1]);assert.equal(items.length,5);
let cases=0;for(const view of [...items,'salary','routine','radar']){
 const html=renderToStaticMarkup(React.createElement(scope.Nav,{view,setView:()=>{},openMenu:()=>{},alertCount:2}));
 const buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];assert.equal(buttons.length,5);
 const active=buttons.filter(m=>/class="active"/.test(m[1]));assert.equal(active.length,1,view+' must select exactly one destination');
 const current=buttons.filter(m=>/aria-current="page"/.test(m[1]));assert.equal(current.length,1);assert.equal(current[0][0],active[0][0]);
 for(const button of buttons.filter(m=>m!==active[0]))assert(!/aria-current=/.test(button[1]),'inactive buttons must omit current state');
 assert.equal((html.match(/<svg\b/g)||[]).length,5);cases++;
}
console.log(`PASS ${cases} real BottomNav semantic states; only active button exposes current page, five icons preserved`);
