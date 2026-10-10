import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(process.env.CREWLOCKER_TEST_PACKAGE || import.meta.url)('playwright');
const state=process.env.CREWLOCKER_STATE || 'raw';
const out=path.resolve('artifacts/crewlocker-validity');fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font-family:system-ui,sans-serif"><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import CrewLockerView from '/src/components/v1435/CrewLockerView.tsx';
import '/src/components/v1435/crewlocker.css';
createRoot(document.getElementById('root')).render(React.createElement(CrewLockerView));</script></body></html>`;
const server=await createServer({configFile:false,root:path.resolve('client'),resolve:{alias:{'@':path.resolve('client/src')}},esbuild:{jsx:'automatic'},optimizeDeps:{entries:[]},plugins:[{name:'synthetic-locker',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/__locker'){res.setHeader('content-type','text/html');void server.transformIndexHtml('/__locker',html).then(result=>res.end(result));}else next();});}}],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),fs.realpathSync('node_modules')]}}});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}: {})});
const results=[];
try{
for(const width of [320,390,1440])for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 const errors=[];const external=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 await context.addInitScript(({theme})=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-ui-a',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token');document.addEventListener('DOMContentLoaded',()=>document.documentElement.setAttribute('data-crew-theme',theme));window.__permissionCalls=0;window.Notification=class{static permission='default';static requestPermission(){window.__permissionCalls++;throw Error('Unexpected permission prompt');}};},{theme});
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await page.goto(origin+'/__locker');
 await page.getByLabel('PIN do cofre desta conta').fill('918273');await page.getByRole('button',{name:'Criar PIN desta conta'}).click();
 await page.getByRole('heading',{name:'Guardar cópia offline'}).waitFor();
 await page.getByLabel('Nome do titular').fill('SYNTHETIC ONLY');await page.getByLabel('Nome no cartão').fill('SYNTHETIC COMBINED FILE');
 await page.getByLabel('Arquivo').setInputFiles({name:'synthetic.txt',mimeType:'application/octet-stream',buffer:Buffer.from('SYNTHETIC CONTENT; manual review; no personal document')});
 await page.getByRole('button',{name:'Criptografar e guardar offline'}).click();await page.getByRole('button',{name:'Revisar validades'}).click();
 const edit=page.getByRole('region',{name:'Revisão de validades'});
 // Icon sizing must never shrink text actions; assert actual rendered text fits.
 for(const name of ['Salvar revisão','Cancelar']) {
  const button=edit.getByRole('button',{name,exact:true});
  const sizing=await button.evaluate(el=>{const style=getComputedStyle(el);const canvas=document.createElement('canvas');const context=canvas.getContext('2d');context.font=style.font;const textWidth=context.measureText(el.textContent.trim()).width;const range=document.createRange();range.selectNodeContents(el);return {width:el.clientWidth,textWidth,contentWidth:el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),textLines:range.getClientRects().length};});
  assert.ok(sizing.contentWidth+1>=sizing.textWidth,`${width}/${theme}: ${name} text fits button`);assert.equal(sizing.textLines,1,`${width}/${theme}: ${name} stays legible on one line`);
 }

 await edit.getByLabel('Nome / tipo / classe').fill('SYNTHETIC TYPE B');await edit.getByLabel('Precisão da validade').selectOption('month');await edit.getByLabel('Mês e ano (sem inventar dia)').fill('2031-04');await edit.getByLabel('Conferi esta transcrição no documento').check();await edit.getByRole('button',{name:'Adicionar registro revisado'}).click();
 await edit.getByLabel('Categoria').selectOption('license');await edit.getByLabel('Nome / tipo / classe').fill('SYNTHETIC LICENSE');await edit.getByLabel('Precisão da validade').selectOption('permanent');await edit.getByLabel('Conferi esta transcrição no documento').check();await edit.getByRole('button',{name:'Adicionar registro revisado'}).click();
 await edit.getByLabel('Categoria').selectOption('medical');await edit.getByLabel('Nome / tipo / classe').fill('SYNTHETIC CLASS ONE');await edit.getByLabel('Precisão da validade').selectOption('exact');await edit.getByLabel('Data exata',{exact:true}).fill('2033-08-16');await edit.getByRole('button',{name:'Adicionar registro revisado'}).click();
 await edit.getByRole('button',{name:'Salvar revisão'}).click();await edit.waitFor({state:'detached'});await page.locator('.cc-validity-list').getByText('SYNTHETIC TYPE B',{exact:true}).waitFor();
 assert.equal(await page.locator('.cc-validity-list li').count(),3);
 assert.match(await page.locator('.cc-validity-list').innerText(),/Vence em 04\/2031 · dia não informado/);
 assert.match(await page.locator('.cc-validity-list').innerText(),/Licença permanente/);
 assert.match(await page.locator('.cc-validity-list').innerText(),/Transcrição a conferir/);
 assert.match(await page.locator('.cc-validity-list').innerText(),/Aptidão não avaliada/);
 assert.equal(await page.evaluate(()=>window.__permissionCalls),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile overflow');
 await page.screenshot({path:path.join(out,`ui-${state}-${width}-${theme}.png`),fullPage:true});
 // Keyboard inputs retain labels and a visible focus rule; actual mobile editor tested separately.
 await page.getByRole('button',{name:'Revisar validades'}).click();await edit.waitFor();
 await edit.getByLabel('Nome / tipo / classe').focus();assert.equal(await edit.getByLabel('Nome / tipo / classe').evaluate(el=>parseFloat(getComputedStyle(el).outlineWidth)>0),true,'visible keyboard focus');
 const oldId=await edit.getByLabel('Renovação de').locator('option').nth(1).getAttribute('value');
 await edit.getByLabel('Renovação de').selectOption(oldId);await edit.getByLabel('Nome / tipo / classe').fill('SYNTHETIC TYPE B RENEWED');await edit.getByLabel('Precisão da validade').selectOption('month');await edit.getByLabel('Mês e ano (sem inventar dia)').fill('2034-05');await edit.getByLabel('Conferi esta transcrição no documento').check();await edit.getByRole('button',{name:'Adicionar registro revisado'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'editor mobile overflow');
 await page.screenshot({path:path.join(out,`editor-${state}-${width}-${theme}.png`),fullPage:true});
 await edit.getByRole('button',{name:'Salvar revisão'}).click();await edit.waitFor({state:'detached'});await page.locator('.cc-validity-list').getByText('SYNTHETIC TYPE B RENEWED',{exact:true}).waitFor();assert.equal(await page.locator('.cc-validity-list li').count(),3);assert.doesNotMatch(await page.locator('.cc-validity-list').innerText(),/Vence em 04\/2031/);
 // No source badge is inherited from a file's separate verification metadata.
 await page.reload();await page.getByLabel('PIN do cofre desta conta').fill('918273');await page.getByRole('button',{name:'Desbloquear',exact:true}).click();await page.getByRole('button',{name:'Revisar validades'}).waitFor();assert.equal(await page.locator('.cc-validity-list li').count(),3);
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new CustomEvent('crewcheck:auth-expired'));});await page.getByRole('heading',{name:'Desbloquear cofre local'}).waitFor();assert.equal(await page.locator('.cc-validity-list').count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-ui-b',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token-b');window.dispatchEvent(new CustomEvent('crewcheck:auth-changed'));});await page.getByLabel('PIN do cofre desta conta').fill('918273');await page.getByRole('button',{name:'Criar PIN desta conta'}).click();await page.getByText('Nenhum documento salvo neste aparelho.').waitFor();assert.equal(await page.locator('.cc-validity-list').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push({width,theme,errors,externalRequests:external.length,permissionRequests:0,checks:['manual month/permanent/exact','unconfirmed kept pending','renewal/reload','logout/account switch','editor and cards no overflow']});await context.close();
}
fs.writeFileSync(path.join(out,`ui-${state}.json`),JSON.stringify({synthetic:true,actualCompiledCrewLocker:true,results},null,2));console.log('PASS compiled CrewLocker manual review, precision, renewal, account/logout and 320/390/1440 light/dark');
}finally{await browser.close();await server.close();}
