const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve('artifacts/free-day-pending');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS),responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));}});vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
const seedSource=ts.createSourceFile('fixture.cjs',fs.readFileSync('scripts/regression-financial-ui-browser.cjs','utf8'),99,true,ts.ScriptKind.JS),seed=seedSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='seed'),fixtures=vm.createContext({});vm.runInContext(seed.getText(seedSource)+'\nglobalThis.seed=seed;',fixtures);
function select({owner,roster,planned,notify=true}) {
 if(notify)window.dispatchEvent(new Event('crewcheck:auth-will-change'));
 localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,name:'SYNTHETIC ONLY',role:'user'}));localStorage.setItem('crewcheck_auth_token','SYNTHETIC-'+owner);
 localStorage.setItem('crewcheck_roster_choice_v1_'+owner,JSON.stringify({owner,roster,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'SYNTHETIC CURRENT'}));
 if(planned)localStorage.setItem('crewcheck_planned_roster_snapshot_v2:'+owner,JSON.stringify({...planned,owner}));else localStorage.removeItem('crewcheck_planned_roster_snapshot_v2:'+owner);
 localStorage.setItem('crewcheck_language','pt-BR');localStorage.setItem('crewcheck_device_notifications','0');
 if(notify)window.dispatchEvent(new Event('crewcheck:auth-changed'));
}
(async()=>{
 const {loadClientModules}=await import('./lib/ts-module-harness.mjs');
 const modules=loadClientModules({files:['client/src/lib/freeDayStartEvidence.ts','client/src/lib/rosterComparison.ts'],prefix:'synthetic-free-day-ui-'});
 const evidence=modules.load('freeDayStartEvidence'),fingerprint=modules.load('rosterComparison').rosterFingerprint;
 function kind(clock,dates=[12,16,20,24]) {return evidence.attachPublishedFreeDayTimeZone({crewName:'SYNTHETIC ONLY',crewId:'900001',year:2026,month:8,rank:'CCM',base:'BSB',rawText:'LATAM SYNTHETIC ONLY | 900001 | X | BSB | CCM Timezone -3 : Brasília',days:dates.map(n=>{const date=String(n).padStart(2,'0')+'/08/2026';return {date,year:2026,month:8,type:'DO',pairingCode:'DO',legs:[],freeDayStartEvidence:evidence.capturePublishedFreeDayStart(['DO',...(clock?[clock,'BSB']:['BSB'])],date)};})});}
 const previous=kind('01:46'),incomplete=kind(null),complete=kind('08:30');
 const planned=roster=>({version:2,owner:'financial-ui-qa',period:{year:2026,month:8},roster,source:'SYNTHETIC PREVIOUS',capturedAt:'2026-08-01T12:00:00Z',fingerprint:fingerprint(roster)});
 const reference=planned(previous);modules.cleanup();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 try{for(const timezoneId of ['UTC','America/Sao_Paulo','Pacific/Auckland']){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId,serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[]}'});return route.continue();});
  await context.addInitScript(fixtures.seed,{theme:'dark',kind:incomplete,amount:0});await context.addInitScript(select,{owner:'financial-ui-qa',roster:incomplete,notify:false});
  await context.addInitScript(()=>{window.Notification=class{static permission='denied';constructor(){throw Error('No real notification allowed')}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.goto(origin+'/app');await page.locator('.cz-app[data-version]').waitFor();
  const open=async()=>{await page.locator('.cz-app[data-view="cockpit"]').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'})));await page.locator('.cc-free-day-alerts').waitFor();};
  const panel=page.locator('.cc-free-day-alerts');await open();
  assert.match(await panel.innerText(),/Falta a publicação anterior/);assert.match(await panel.innerText(),/não confirma adiamento/);assert.equal(await panel.locator('[data-free-day-pending-date]').count(),0);
  await panel.getByRole('button',{name:'Conferir as duas publicações',exact:true}).click();assert.equal(await panel.locator('[data-free-day-source-consent]').getAttribute('open'),'');
  await page.evaluate(select,{owner:'financial-ui-qa',roster:incomplete,planned:reference});await open();
  assert.equal(await panel.locator('[data-free-day-pending-date]').count(),4);assert.match(await panel.innerText(),/Escala atual: horário literal de início da folga não comprovado/);
  assert.equal(await panel.getByText('Há dados pendentes para verificar a postergação.',{exact:true}).count(),0);
  for(const date of ['24/08/2026','12/08/2026','24/08/2026']){
   await panel.getByRole('button',{name:'Abrir '+date+' na escala atual',exact:true}).click();await page.getByRole('heading',{name:'Escala inteligente',exact:true}).waitFor();
   assert.equal(await page.locator('input[aria-label="Dia da escala"]').inputValue(),date.split('/').reverse().join('-'));
   await page.getByRole('button',{name:'Voltar à verificação de folga',exact:true}).click();await panel.waitFor();assert.equal(await page.getByText('Esta ocorrência mudou ou não está mais na escala selecionada.',{exact:true}).count(),0);
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'compare'})));await panel.waitFor();await panel.getByRole('button',{name:'Abrir 20/08/2026 na escala atual',exact:true}).click();await page.getByRole('button',{name:'Voltar à verificação de folga',exact:true}).click();await page.locator('.cz-app[data-view="compare"]').waitFor();
  await page.evaluate(select,{owner:'financial-ui-qa',roster:complete,planned:reference});await open();assert.equal(await panel.locator('[data-free-day-alert]').count(),4,'complete comparisons retain valid alerts');assert.equal(await panel.locator('[data-free-day-pending]').count(),0);assert.match(await panel.innerText(),/6h44/);
  const sameInstant=kind('07:46');for(const day of sameInstant.days)day.freeDayStartEvidence.utcOffsetMinutes=180;
  await page.evaluate(select,{owner:'financial-ui-qa',roster:sameInstant,planned:reference});await open();assert.equal(await panel.locator('[data-free-day-alert]').count(),0,'different published UTC offsets compare as instants');assert.equal(await panel.locator('[data-free-day-pending]').count(),0);
  const missingZone=kind('01:46');for(const day of missingZone.days){day.freeDayStartEvidence.utcOffsetMinutes=null;day.freeDayStartEvidence.timeZoneSource='unknown';}
  await page.evaluate(select,{owner:'financial-ui-qa',roster:complete,planned:planned(missingZone)});await open();assert.match(await panel.innerText(),/Publicação anterior: fuso UTC publicado ausente ou ambíguo/);assert.equal(await panel.locator('[data-free-day-alert]').count(),0);
  const mixed=JSON.parse(JSON.stringify(complete));mixed.days[0].freeDayStartEvidence.clock=null;
  await page.evaluate(select,{owner:'financial-ui-qa',roster:mixed,planned:reference});await open();assert.equal(await panel.locator('[data-free-day-alert]').count(),3,'one pending sequence never hides valid alerts for the others');assert.equal(await panel.locator('[data-free-day-pending-date]').count(),1);assert.match(await panel.innerText(),/além das postergações identificadas/);
  const removed={...complete,days:complete.days.slice(1)};
  await page.evaluate(select,{owner:'financial-ui-qa',roster:removed,planned:reference});await open();assert.match(await panel.innerText(),/Escala atual: sequência de folga correspondente não encontrada/);assert.equal(await panel.getByRole('button',{name:'Abrir 12/08/2026 na escala atual',exact:true}).count(),0,'missing current date has no misleading navigation');
  const invalid=kind('01:46');invalid.days[0].date='31/02/2026';
  await page.evaluate(select,{owner:'financial-ui-qa',roster:complete,planned:planned(invalid)});await open();assert.match(await panel.innerText(),/Folga com data não confirmada/);assert.equal(await panel.getByRole('button',{name:/Abrir 31\/02/}).count(),0);
  await page.evaluate(select,{owner:'syn-b',roster:complete});await open();assert.match(await panel.innerText(),/Falta a publicação anterior/);assert.equal(await panel.locator('[data-free-day-alert]').count(),0);assert.equal(await panel.locator('[data-free-day-pending-date]').count(),0,'B inherits no A pending dates or stored reference');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS compiled free-day explanation '+timezoneId+': no reference, four visible dated gaps, repeat open/return, compare return,404min valid alerts, equal instants, missing prior timezone, invalid date, account isolation; synthetic, all APIs intercepted');
 }}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
