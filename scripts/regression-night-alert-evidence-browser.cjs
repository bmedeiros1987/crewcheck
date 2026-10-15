const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve('artifacts/night-alert-evidence');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS),responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));}});vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
const seedSource=ts.createSourceFile('fixture.cjs',fs.readFileSync('scripts/regression-financial-ui-browser.cjs','utf8'),99,true,ts.ScriptKind.JS),seed=seedSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='seed'),fixtures=vm.createContext({});vm.runInContext(seed.getText(seedSource)+'\nglobalThis.seed=seed;',fixtures);
const night=(date,flight)=>({date,year:2032,month:10,type:'VOO',pairingCode:flight,dutyReport:'02:10',dutyDebrief:'10:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:flight,origin:'GRU',destination:'REC',departureTime:'02:50',arrivalTime:'10:00',presentationTime:'02:10',workType:'OP'}]});
const kind={year:2032,month:10,base:'GRU',rank:'CC',airline:'LA',crewName:'SYNTHETIC ONLY',days:[night('04/10/2032','LA9901'),night('06/10/2032','LA9902'),night('07/10/2032','LA9903')]};
function swap({owner,roster}) {
 window.dispatchEvent(new Event('crewcheck:auth-will-change'));
 localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,name:'SYNTHETIC',role:'user'}));localStorage.setItem('crewcheck_auth_token','SYNTHETIC-'+owner);
 localStorage.setItem('crewcheck_roster_choice_v1_'+owner,JSON.stringify({owner,roster,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'SYNTHETIC ONLY'}));
 window.dispatchEvent(new Event('crewcheck:auth-changed'));
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 try {for(const timezoneId of ['UTC','America/Sao_Paulo','Pacific/Auckland']) {
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId,serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[]}'});return route.continue();});
  await context.addInitScript(fixtures.seed,{theme:'dark',kind,amount:0});
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_language','pt-BR');window.Notification=class{static permission='denied';constructor(){throw Error('No real notification allowed')}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.goto(origin+'/app');await page.locator('.cz-app[data-version]').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'})));
  const card=page.locator('.cc-alert-card').filter({has:page.getByRole('heading',{name:/Madrugadas.*consecutivas/})});
  await card.waitFor();await card.locator('summary').click();assert.match(await card.innerText(),/Contagem comprovada: 3/);
  assert.equal(await card.getByRole('button',{name:/Abrir .* na escala/}).count(),3);
  for(const date of ['07/10/2032','04/10/2032','07/10/2032','06/10/2032']) {
   await card.getByRole('button',{name:'Abrir '+date+' na escala',exact:true}).click();
   await page.getByRole('heading',{name:'Escala inteligente',exact:true}).waitFor();
   const iso=date.split('/').reverse().join('-');const group=page.locator('[data-roster-iso="'+iso+'"]').first();
   await group.waitFor();assert.equal(await page.getByRole('textbox',{name:'Dia da escala'}).count(),0);
   await page.waitForFunction(key=>{const box=document.querySelector('[data-roster-iso="'+key+'"]')?.getBoundingClientRect();return box&&box.top<innerHeight&&box.bottom>0},iso);
   assert.equal(await page.locator('input[aria-label="Dia da escala"]').inputValue(),iso);
   await page.getByRole('button',{name:'Voltar ao alerta',exact:true}).click();await card.waitFor();
   assert.equal(await card.getAttribute('data-alert-selected'),'true');assert.equal(await card.locator('details[open]').count(),1);
  }
  await card.getByRole('button',{name:'Abrir 07/10/2032 na escala',exact:true}).click();await page.getByRole('button',{name:'Fechar contexto do alerta',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Voltar ao alerta',exact:true}).count(),0);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'})));await card.locator('summary').click();
  await card.getByRole('button',{name:'Abrir 04/10/2032 na escala',exact:true}).click();
  const other={...kind,days:[{...night('20/10/2032','LA9999'),dutyReport:'12:00',dutyDebrief:'18:00',legs:[{flightNumber:'LA9999',origin:'GRU',destination:'REC',departureTime:'12:40',arrivalTime:'17:30',workType:'OP'}]}]};
  await page.evaluate(swap,{owner:'syn-b',roster:other});await page.locator('.cz-app[data-view="cockpit"]').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'roster'})));await page.getByRole('heading',{name:'Escala inteligente',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Voltar ao alerta',exact:true}).count(),0);assert.equal(await page.locator('[data-roster-iso="2032-10-04"]').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'})));assert.equal(await page.getByRole('button',{name:/Abrir .* na escala/}).count(),0);
  const pending={...kind,days:[{...night('01/10/2032','LA9904'),dutyDebrief:null,dutyDebriefSource:undefined},{date:'02/10/2032',year:2032,month:10,type:'HSB',pairingCode:'HSB',dutyReport:'12:00',dutyReportSource:'published',legs:[]},{...night('09/10/2032','LA9905'),dutyReport:'20:10',dutyDebrief:'01:00',legs:[{flightNumber:'LA9905',origin:'GRU',destination:'REC',departureTime:'20:50',arrivalTime:'00:30',presentationTime:'20:10',workType:'OP'}]}]};
  await page.evaluate(swap,{owner:'pending-qa',roster:pending});await page.locator('.cz-app[data-view="cockpit"]').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'})));
  const pendingDetails=page.locator('.cc-alert-center details').filter({has:page.locator('summary').filter({hasText:'Sequência de madrugadas indeterminada'})});
  await pendingDetails.waitFor();await pendingDetails.locator('summary').click();assert.match(await pendingDetails.innerText(),/Contagem comprovada: 1 jornada\(s\); possível: 2/);
  assert.equal(await page.locator('.cc-alert-card').filter({has:page.getByRole('heading',{name:/Madrugadas.*consecutivas/})}).count(),0,'possible sequence is not a confirmed three-night warning');
  for(const date of ['01/10/2032','09/10/2032']) {
   await pendingDetails.getByRole('button',{name:'Abrir '+date+' na escala',exact:true}).click();await page.getByRole('button',{name:'Voltar ao alerta',exact:true}).click();
   await pendingDetails.waitFor();assert.equal(await pendingDetails.getAttribute('data-alert-selected'),'true');assert.equal(await pendingDetails.getAttribute('open'),'');
   assert.equal(await page.getByText('Esta ocorrência mudou ou não está mais na escala selecionada.',{exact:true}).count(),0,'existing pending occurrence remains findable on return');
  }
  assert.deepEqual(errors,[]);await context.close();console.log('PASS actual compiled app '+timezoneId+': dates/evidence, repeated date opens and returns, offscreen dates, close, account switch, pending lower/upper count and return; synthetic, all APIs intercepted');
 }}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
