import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {guardStaticHtml,FLOATING_SHORTCUT_GUARD} from '../server/static-html-guard.mjs';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-static-contexts-'));
const source=fs.readFileSync('server.mjs','utf8');
const ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
const handler=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');assert(handler);
const isPrepared=handler.getText(ast).includes('guardStaticHtml(');
const html='<!doctype html><html><head><title>Synthetic</title></head><body>SYNTHETIC</body></html>';
const guarded=html.replace('</head>',FLOATING_SHORTCUT_GUARD+'</head>');
fs.writeFileSync(path.join(temporary,'index.html'),html);fs.writeFileSync(path.join(temporary,'worker.mjs'),'export const synthetic=true;');
const results=[];let checks=0;
try{
 for(const name of fs.readdirSync('scripts').filter(name=>name.endsWith('.cjs')).sort()){
 const file=path.resolve('scripts',name);
 const content=process.env.STATIC_CONTEXT_BASE_SHA?execFileSync('git',['show',process.env.STATIC_CONTEXT_BASE_SHA+':scripts/'+name],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
 if(!content.includes('serveStatic'))continue;
 const parsed=ts.createSourceFile(name,content,99,true,ts.ScriptKind.JS),contexts=[];
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(parsed)==='vm.createContext'&&ts.isObjectLiteralExpression(node.arguments[0])&&node.arguments[0].properties.some(p=>p.name?.getText(parsed)==='distDir'))contexts.push(node.arguments[0]);ts.forEachChild(node,visit);}visit(parsed);
 for(const object of contexts){
 try{
 const context=vm.runInNewContext('('+object.getText(parsed)+')',{fs,path,Buffer,distDir:temporary,dist:temporary,root:process.cwd(),require:createRequire(file)});
 assert.equal(context.guardStaticHtml,guardStaticHtml,'VM must receive the actual shared module function');checks++;
 // Each harness normally points at its production dist. Use only a temporary
 // filesystem fixture here; the actual handler and injected helper stay intact.
 context.distDir=temporary;
 const respond=vm.runInNewContext(handler.getText(ast)+';serveStatic',context);
 const request=route=>new Promise(resolve=>{let status,headers;respond({}, {writeHead:(s,h)=>{status=s;headers=h;},end:data=>resolve({status,headers,body:data.toString()})},new URL(route,'https://synthetic.invalid'));});
 for(const route of ['/','/index.html','/synthetic-route','/missing.js']){
 const response=await request(route);assert.equal(response.status,200);assert.equal(response.body,isPrepared?guarded:html);assert.equal(response.headers['content-type'],'text/html; charset=utf-8');
 if(isPrepared){assert.equal(response.headers['cache-control'],'no-store, no-cache, must-revalidate');assert.equal(response.body.split('id="cc-no-floating-shortcuts"').length-1,1);}checks++;
 }
 const module=await request('/worker.mjs');assert.equal(module.status,200);assert.equal(module.body,'export const synthetic=true;');assert.equal(module.headers['content-type'],'text/javascript; charset=utf-8');assert.equal(module.headers['cache-control'],'no-store, no-cache, must-revalidate');checks++;
 results.push({name,status:'PASS'});
 }catch(error){results.push({name,status:'FAIL',error:String(error.message)});}
 }
 }
 assert(results.length>=31,'scan the complete known family, including future additions');
 const report={prepared:isPrepared,checks,results,failures:results.filter(row=>row.status==='FAIL').length,realProviderRequests:0};
 if(process.env.STATIC_CONTEXT_REPORT)fs.writeFileSync(process.env.STATIC_CONTEXT_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.equal(report.failures,0,'all extracted static contexts must load real HTML guard');console.log(`PASS ${results.length} actual static-handler VM contexts / ${checks} integrity checks`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
