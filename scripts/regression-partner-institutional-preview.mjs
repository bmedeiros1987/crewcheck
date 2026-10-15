import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
import { crewCheckEmailIdentity, crewCheckEmailSignatureText as institutionalSignatureText } from '../shared/crewcheckEmailIdentity.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out=path.resolve('artifacts/partner-institutional-preview');fs.mkdirSync(out,{recursive:true});
const backend=vm.createContext({crewCheckEmailIdentity,institutionalSignatureText,env:(_key,fallback)=>fallback,defaultLogoUrl:'https://example.invalid/logo.png'});
for(const [file,names] of [['server/v139/delivery.mjs',['escapeHtml','crewCheckEmailSignatureText','crewCheckEmailSignature']],['server/v1410/partnerAccounts.mjs',['templateText']]]){
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 for(const name of names){const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn);vm.runInContext(fn.getText(ast).replace(/^export\s+/,''),backend);}
}
const authFile=path.resolve('client/src/lib/authClient.ts');
await build({absWorkingDir:process.cwd(),stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './client/src/pages/AdminPartnerAccountsPage';createRoot(document.getElementById('root')).render(<Page/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',outfile:path.join(out,'app.js'),jsx:'automatic',plugins:[{name:'synthetic-auth',setup(b){b.onLoad({filter:/authClient\.ts$/},args=>args.path===authFile?{contents:`export const getStoredUser=()=>({role:'admin'});export async function authFetch(_url,options){if(options?.method&&options.method!=='GET')throw Error('SYNTHETIC_WRITE_FORBIDDEN');return {ok:true,partners:[]};}`,loader:'ts'}:null);}}],logLevel:'silent'});
const server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(out,'app.js')));}else{res.setHeader('content-type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const results=[],errors=[],unexpectedRequests=[];
try{for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin||u.pathname.startsWith('/api/')||route.request().method()!=='GET'){unexpectedRequests.push(u.pathname);return route.abort();}return route.continue();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('heading',{name:'Pré-visualização'}).waitFor();
 const body=page.locator('.cc-body-editor');const initial=await body.inputValue();
 for(const [variant,template] of [['default-placeholder',initial],['no-placeholder','Convite sintético sem variável de assinatura.'],['case-space-placeholder','Convite sintético\n{{ ASSINATURA }}']]){
 await body.fill(template);const values={nome:'Nome do contato',empresa:'Empresa',email:'nome@empresa.com',senha_temporaria:'Senha gerada automaticamente',url_acesso:crewCheckEmailIdentity.url,assinatura:backend.crewCheckEmailSignatureText()};
 assert.equal(await page.locator('.cc-mail-body').textContent(),backend.templateText(template,values),'placeholder parity with actual backend');
 const footer=page.locator('.cc-signature');assert.equal(await footer.locator('strong').textContent(),crewCheckEmailIdentity.name);assert.equal(await footer.locator('.cc-brand small').textContent(),crewCheckEmailIdentity.description);assert.equal(await footer.getByRole('link').getAttribute('href'),crewCheckEmailIdentity.url);assert.equal(await footer.getByRole('link').textContent(),crewCheckEmailIdentity.websiteLabel);
 const expected=await page.evaluate(html=>{const div=document.createElement('div');div.innerHTML=html.replace(/<img\b[^>]*>/g,'');return div.textContent;},backend.crewCheckEmailSignature());assert.equal((await footer.textContent()).replace('✈',''),expected,'visible institutional footer matches actual backend content');
 assert.doesNotMatch(await page.locator('.cc-preview').innerText(),/Bruno|Saraiva|Medeiros|Founder|CEO|Brasília/i);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('.cc-preview').screenshot({path:path.join(out,`${width}-${variant}.png`)});results.push({width,variant,backendParity:true,personalSignatureAbsent:true});
 }await context.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({cases:results,errors,unexpectedRequests,realSends:0},null,2));console.log('PASS admin preview:6 synthetic cases, actual backend placeholder/footer parity, personal signature absent, mobile/desktop, no requests or sends');
}finally{await browser.close();server.close();}
