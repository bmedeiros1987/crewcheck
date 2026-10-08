import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
const source=process.env.STATIC_MIME_BASELINE_SHA?execFileSync('git',['show',process.env.STATIC_MIME_BASELINE_SHA+':server.mjs'],{encoding:'utf8'}):fs.readFileSync('server.mjs','utf8');
const ast=ts.createSourceFile('server.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='serveStatic');
assert.equal(functions.length,1,'extract only the unique top-level production handler');
const distDir=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-synthetic-module-mime-'));
try {
 const context=vm.createContext({fs,path,Buffer,distDir,sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
 vm.runInContext(functions[0].getText(ast)+'\nglobalThis.respond=serveStatic;',context);
 for(const [filename,body,mime] of [['worker.mjs','export const synthetic=true;','text/javascript; charset=utf-8'],['WORKER.MJS','export const synthetic=true;','text/javascript; charset=utf-8'],['bundle.js','console.log("synthetic");','text/javascript; charset=utf-8'],['style.css','body{}','text/css; charset=utf-8'],['index.html','<p>SYNTHETIC</p>','text/html; charset=utf-8'],['fixture.json','{}','application/json; charset=utf-8'],['opaque.bin','SYNTHETIC','application/octet-stream']]) {
  fs.writeFileSync(path.join(distDir,filename),body);
  const response=await new Promise(resolve=>{let status,headers;context.respond({}, {writeHead:(s,h)=>{status=s;headers=h;},end:data=>resolve({status,headers,data})},new URL('http://synthetic.local/'+filename));});
  assert.equal(response.status,200);assert.equal(response.headers['content-type'],mime,'production responder must serve browser module MIME for '+filename);assert.equal(response.data.toString(),body);assert.equal(response.headers['cache-control'],'no-store, no-cache, must-revalidate');
 }
 console.log('PASS production static MIME: module worker, JS/CSS/HTML/JSON/binary bytes and cache behavior; synthetic only.');
}finally {fs.rmSync(distDir,{recursive:true,force:true});}
