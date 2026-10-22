import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
export async function verifyFinancialConsentHostBrowser({makeHandler,conversationId,ownerId,now}){
 const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Consent from './client/src/components/finance/FinancialChannelConsent';createRoot(document.getElementById('root')).render(<Consent/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'aliases',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
 let origin='',handler,hold=false,release,started,requests=0,external=0;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin||'http://localhost');
  if(url.pathname==='/api/platform/finance/capture'){
   requests++;
   if(hold){hold=false;started();await new Promise(r=>release=r);}
   await handler(req,res,url);return;
  }
  res.writeHead(200,{'content-type':url.pathname==='/fixture.js'?'text/javascript':'text/html'});
  res.end(url.pathname==='/fixture.js'?bundle.outputFiles[0].text:'<meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:16px system-ui;margin:16px;background:#f6f8fc;color:#15223b}button,input,select{font:inherit;max-width:100%;min-height:44px}label{display:block;margin:10px 0}fieldset{margin-top:12px;min-width:0}summary{cursor:pointer;min-height:44px}*{box-sizing:border-box;overflow-wrap:anywhere}</style><div id="root"></div><script src="/fixture.js"></script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;handler=makeHandler(()=>origin);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const out='/tmp/crewcheck-financial-consent-host-browser';fs.mkdirSync(out,{recursive:true});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});
   await context.addInitScript(({ownerId,instant})=>{
    localStorage.setItem('crewcheck_auth_token','host');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-host-owner',email:ownerId,role:'user'}));
    const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
   },{ownerId,instant:new Date(now).getTime()});
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external++;return route.abort();}return route.continue();});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
   const panel=page.locator('details');await panel.locator('summary').press('Enter');
   await panel.getByLabel('Conversa privada financeira',{exact:true}).fill(conversationId);
   const [previewResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/platform/finance/capture')),panel.getByRole('button',{name:'Consultar vínculo e preferência',exact:true}).click()]);assert.equal(previewResponse.status(),200,await previewResponse.text());await panel.getByText('Vínculo privado conferido nesta conta.',{exact:true}).waitFor();
   const grant=panel.getByRole('button',{name:'Confirmar preferência por canal',exact:true});assert(await grant.isDisabled());
   await panel.getByLabel('Diárias',{exact:true}).check();assert(await grant.isDisabled());await panel.getByLabel('Confirmo estas categorias, este prazo e somente esta conversa privada. Posso revogar.',{exact:true}).check();assert(await grant.isEnabled());
   await grant.press('Enter');await panel.getByRole('status').getByText('Preferência salva para esta conversa. Nenhum envio foi feito por esta ação.',{exact:true}).waitFor();
   await panel.getByRole('button',{name:'Revogar consentimento',exact:true}).press('Enter');await panel.getByRole('status').getByText('Consentimento revogado.',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:'Revogar consentimento',exact:true}).count(),0);
   await page.screenshot({path:path.join(out,width+'-revoked.png'),fullPage:true});
   hold=true;const targetPending=new Promise(r=>started=r);await panel.getByRole('button',{name:'Consultar vínculo e preferência',exact:true}).click();await targetPending;await panel.getByLabel('Conversa privada financeira',{exact:true}).fill('456');release();await page.waitForTimeout(100);assert.equal(await panel.getByText('Vínculo privado conferido nesta conta.',{exact:true}).count(),0);assert.equal(await panel.getByRole('button',{name:'Revogar consentimento',exact:true}).count(),0);await panel.getByLabel('Conversa privada financeira',{exact:true}).fill(conversationId);
   hold=true;const pending=new Promise(r=>started=r);await panel.getByRole('button',{name:'Consultar vínculo e preferência',exact:true}).click();await pending;
   await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_token','other');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-other-owner',email:'fixture-b@example.invalid',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
   release();await page.waitForTimeout(100);assert.equal(await panel.getByLabel('Conversa privada financeira',{exact:true}).inputValue(),'');assert.equal(await panel.getByText('Vínculo privado conferido nesta conta.',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await context.close();
  }
  assert.equal(external,0);return{widths:[390,1440],actualHttpSqlHost:true,explicitConfirmation:true,grantRevoke:true,lateAccountResponse:true,keyboard:true,requests,external,realMessages:0};
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
