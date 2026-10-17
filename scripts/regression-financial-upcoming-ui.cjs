const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {createRequire}=require('node:module'),{build}=require('esbuild');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR||'artifacts/financial-upcoming-ui');fs.mkdirSync(out,{recursive:true});
const event=(id,currency,amountMinor)=>({id:String(id).repeat(64),category:'allowance',status:'forecast',expectedPaymentDate:'2032-12-21',expectedPaymentTimezone:'UTC',currency,amountMinor});
const dto=owner=>({ok:true,access:'allowed',source:'persisted_financial_ledger',ownerId:owner+'@example.invalid',horizonDays:30,state:'available',hasMore:true,events:[event(1,'USD',12345),event(2,'JPY',500),event(3,'KWD',1234)]});
(async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Card from './client/src/components/finance/ConciergeFinancialPreview';createRoot(document.getElementById('root')).render(<Card openFinance={()=>document.getElementById('navigation').textContent='Financeiro aberto'}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'',loader:'js'}));b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));b.onResolve({filter:/^@shared\//},({path:p})=>({path:path.resolve('shared',p.slice(8))}));}}]});
 const styles=['client/src/components/finance/financial-privacy.css','client/src/components/finance/concierge-financial-preview.css'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
 const html=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#f4f6fa;color:#17213a}body[data-theme=dark]{background:#121b2c;color:#eef4ff}main{padding:16px;max-width:900px;margin:auto}button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:8px}*{box-sizing:border-box}${styles}</style><main><div id="root"></div><p id="navigation"></p></main><script src="/fixture.js"></script>`;
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 let writes=0,external=0;const results=[];
 try{for(const [width,theme] of [[320,'light'],[390,'light'],[1440,'dark']]){
  let mode='available',hold=false,release,started;const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-a',email:'a@example.invalid',role:'user'}));});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin){external++;return route.abort();}if(url.pathname.startsWith('/api/')){
   assert.equal(url.pathname,'/api/platform/finance/upcoming');assert.equal(url.search,'');assert.equal(req.postData(),null);if(req.method()!=='GET')writes++;assert.equal(req.method(),'GET');
   const token=req.headers().authorization?.replace('Bearer ','');assert(['A','B'].includes(token));if(hold&&token==='A'){hold=false;started();await new Promise(r=>release=r);}
   const data=dto(token.toLowerCase());if(token==='B'){data.events=[];data.state='no_data';data.hasMore=false;}
   if(mode==='wrong-owner')data.ownerId='other@example.invalid';if(mode==='empty'){data.events=[];data.state='no_data';data.hasMore=false;}
   if(mode==='incomplete'){data.state='incomplete';data.events=[event(1,'USD',null)];data.hasMore=false;}
   return route.fulfill({status:mode==='unavailable'?503:200,contentType:'application/json',body:JSON.stringify(mode==='unavailable'?{ok:false,state:'unavailable'}:data)});
  }return route.continue();});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('body').evaluate((e,t)=>e.dataset.theme=t,theme);
  const card=page.getByRole('region',{name:'Próximas previsões financeiras'});await card.getByText('Moeda original: KWD',{exact:true}).waitFor();
  assert.equal(await card.locator('li').count(),3);let text=await card.innerText();assert.match(text,/123,45/);assert.match(text,/500/);assert.match(text,/1,234/);assert.match(text,/não confirma recebimento/);assert.match(text,/21\/12/);
  await card.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();assert.equal(await card.getByText('Valor oculto',{exact:false}).count(),3);assert(!/123,45|1,234|500/.test(await card.evaluate(e=>e.textContent)),'hidden values absent from DOM');
  await page.screenshot({path:path.join(out,`${width}-${theme}-hidden.png`),fullPage:true});await card.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
  await card.getByRole('button',{name:'Abrir Financeiro',exact:true}).click();assert.equal(await page.locator('#navigation').textContent(),'Financeiro aberto');
  await page.screenshot({path:path.join(out,`${width}-${theme}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  for(const button of await card.getByRole('button').all()){const box=await button.boundingBox();assert(box.height>=44);}
  for(const state of ['empty','incomplete','unavailable','wrong-owner']){mode=state;await card.getByRole('button',{name:'Atualizar previsões',exact:true}).click();await card.getByRole('status').getByText(state==='empty'?'Nenhuma previsão com data informada nos próximos 30 dias.':state==='incomplete'?'Resumo parcial: há dados, datas ou valores a conferir no Financeiro.':'Previsões indisponíveis nesta consulta.',{exact:true}).waitFor();text=await card.innerText();if(state==='empty')assert.match(text,/Nenhuma previsão com data informada/);else if(state==='incomplete'){assert.match(text,/Resumo parcial/);assert.match(text,/Valor a confirmar/);assert(!text.includes('0,00'));}else assert.match(text,/Previsões indisponíveis/);}
  mode='available';hold=true;const pending=new Promise(r=>started=r);await card.getByRole('button',{name:'Atualizar previsões',exact:true}).click();await pending;
  await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-b',email:'b@example.invalid',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  await card.getByText('Nenhuma previsão com data informada nos próximos 30 dias.',{exact:true}).waitFor();release();await page.waitForTimeout(80);assert.equal(await card.locator('li').count(),0);assert(!/123,45|1,234|500/.test(await card.innerText()));
  await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-expired'));});await card.getByText('Entre na conta proprietária para consultar.',{exact:true}).waitFor();assert.equal(await card.locator('li').count(),0);assert.deepEqual(errors,[]);
  results.push({width,theme,cap3:true,multicurrency:true,privacyDOM:true,ownerLateResponse:true,absentAndUnavailable:true,navigation:true});await context.close();
 }assert.equal(writes,0);assert.equal(external,0);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,writes,external},null,2));console.log('PASS upcoming UI: '+JSON.stringify({results,writes,external}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
