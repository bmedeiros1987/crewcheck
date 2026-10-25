const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{createRequire}=require('module');
const ts=require('typescript'),esbuild=require('esbuild');
const fixtureRequire=process.env.MENU_PLAYWRIGHT_PACKAGE?createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE):require;
const {chromium}=fixtureRequire('playwright');
const source=fs.readFileSync('client/src/components/platform/PlatformCenter.tsx','utf8');
const ast=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const selected=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['PermissionEditor','VisitorsPanel'].includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText()==='PERMISSION_LABELS')).map(n=>n.getText()).join('\n');
const defaults=fs.readFileSync('client/src/lib/platformClient.ts','utf8').match(/export const defaultVisitorPermissions:[\s\S]*?\n};/)[0].replace('export ','');
const entry=fs.readFileSync('client/src/components/platform/GuestInvitationEntry.tsx','utf8').replace(/import[^\n]+\n/,'').replace('export default ','');
const icons=['UserPlus','Loader2','Mail','AlertTriangle','Copy','MessageCircle','ShieldCheck','Check','X','Send'].map(n=>`const ${n}=()=>null;`).join('\n');
const fixture=`import React,{useState,useEffect,useRef} from 'react';import{createRoot}from'react-dom/client';
window.qa={requests:[],resolve:null};const listVisitors=async()=>({visitors:[]});
const createVisitor=async payload=>{window.qa.requests.push(payload);return new Promise(resolve=>window.qa.resolve=resolve)};
const toast={success(){},error(){}};${icons}\n${defaults}\n${entry}\n${selected}\ncreateRoot(document.getElementById('root')).render(<VisitorsPanel/>);`;
(async()=>{
 const result=await esbuild.build({stdin:{contents:fixture,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife'});
 const css=fs.readFileSync('client/src/platform-v13-8.css','utf8');
 const html='<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:8px;box-sizing:border-box}*{box-sizing:border-box}'+css+'</style><div id="root"></div><script src="/fixture.js"></script></html>';
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?result.outputFiles[0].text:html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;try{
  browser=await chromium.launch({headless:true});const out=path.resolve('artifacts/guest-invitation');fs.mkdirSync(out,{recursive:true});
  for(const width of [320,390])for(const zoom of [1,2]){
   const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await page.goto(origin);await page.evaluate(z=>document.body.style.zoom=String(z),zoom);
   const button=name=>page.getByRole('button',{name,exact:true});
   await page.getByRole('heading',{name:'Convidados',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement===document.body),true);await button('Familiar').focus();await page.keyboard.press('Enter');
   await page.getByRole('heading',{name:'Convidar familiar',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('h3')),true);await page.locator('input[type=email]').fill('synthetic@example.invalid');await page.getByPlaceholder('Nome da pessoa').fill('Pessoa sintética');
   const boxes=page.locator('input[type=checkbox]');assert.deepEqual(await boxes.evaluateAll(items=>items.map(x=>x.checked)),[true,true,false,false,true,false,true,true,false]);
   await boxes.nth(2).check();await button('Voltar aos convidados').click();assert.equal(await button('Familiar').evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('input[type=email]').count(),0);await button('Colega').click();
   await page.getByRole('heading',{name:'Convidar colega',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('h3')),true);assert.equal(await page.locator('input[type=email]').inputValue(),'synthetic@example.invalid');assert(await boxes.nth(2).isChecked());
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`horizontal overflow ${width}px zoom ${zoom}`);
   await page.screenshot({path:path.join(out,`${width}-${zoom}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>window.qa.requests.length),0);await button('Enviar convite pelo CrewCheck').click();
   assert.equal(await page.evaluate(()=>window.qa.requests.length),1);assert(await button('Voltar aos convidados').isDisabled());
   const payload=await page.evaluate(()=>window.qa.requests[0]);assert.deepEqual(Object.keys(payload).sort(),['displayName','email','permissions','telegram']);assert.equal(payload.permissions.hotels,true);
   await page.evaluate(()=>window.qa.resolve({emailSent:true}));await page.waitForFunction(()=>document.querySelector('input[type=email]').value==='');assert(await boxes.nth(2).isChecked());
   await button('Voltar aos convidados').click();assert.equal(await button('Colega').evaluate(el=>el===document.activeElement),true);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS actual guest UI browser fixtures: 320/390px, 100/200% CSS zoom, keyboard entry, navigation, preserved defaults/drafts, bounded layout, unchanged fake payload; zero external requests.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
