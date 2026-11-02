// Real compiled app, synthetic accounts/roster/publication, UTC month boundary.
// A demo is allowed without an owner choice; an ignored automatic choice must
// not be replaced by a demo while account bootstrap is unavailable.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const output=process.env.DEMO_BOOTSTRAP_OUTPUT||'/tmp/crewcheck-demo-evidence/browser';fs.mkdirSync(output,{recursive:true});
const owner='demo-bootstrap-qa',schema='p0-operational-date-anchor-v2';
const roster={crewName:'SYNTHETIC IMPORT',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month:10,year:2026,days:[{date:'10/10/2026',dayNumber:10,month:10,year:2026,type:'VOO',pairingCode:'LA1234',dutyReport:'07:00',dutyDebrief:'10:00',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:'LA1234',origin:'BSB',destination:'GRU',departureTime:'08:10',arrivalTime:'09:00',presentationTime:'07:00',workType:'OP'}]}]};
(async()=>{
 const code=ts.transpileModule(fs.readFileSync('client/src/lib/rosterPublicationReview.ts','utf8'),{compilerOptions:{target:99,module:99}}).outputText;
 const reviewModule=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const flight={kind:'flight',date:'10/10/2026',flightNumber:'LA1234',origin:'BSB',destination:'GRU',presentation:'07:00',departure:'08:00',arrival:'09:00',startDateTime:'2026-10-10T11:00:00Z',endDateTime:'2026-10-10T12:00:00Z'};
 const first=reviewModule.observePublication(owner,null,reviewModule.publication([flight]));
 const review=reviewModule.observePublication(owner,first,reviewModule.publication([{...flight,departure:'08:10',startDateTime:'2026-10-10T11:10:00Z'}]));
 assert.equal(review.history[0].seen,false);
 const root=path.resolve('dist');
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;const file=pathname.startsWith('/assets/')?path.join(root,pathname):path.join(root,'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const results=[];
 try{for(const selection of ['none','explicit','automatic']){
  const context=await browser.newContext({viewport:{width:1100,height:900},timezoneId:'UTC',serviceWorkers:'block'}),requests=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/')){requests.push(url.pathname+url.search);return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"SYNTHETIC_OFFLINE"}'});}return route.continue();});
  await context.addInitScript(({owner,roster,selection,schema,review})=>{
   localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,email:'demo-bootstrap@example.test',name:'SYNTHETIC QA',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-local-only');localStorage.setItem('crewcheck_language','pt-BR');localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');localStorage.setItem('crewcheck_demo_mode_seen','1');sessionStorage.setItem('crewcheck_demo_active','1');
   if(selection!=='none')localStorage.setItem('crewcheck_roster_choice_v1_'+owner,JSON.stringify({owner,roster,selection,sourceFileName:'SYNTHETIC.pdf',cacheSchema:schema}));
   localStorage.setItem('crewcheck:publication-review:v1:'+owner,JSON.stringify(review));
  },{owner,roster,selection,schema,review});
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/app?view=perdiem&fmode=allowance&fscreen=changes');
   await page.locator('.cz-app').waitFor();
   if(selection==='automatic')await page.getByRole('heading',{name:'Diárias · registros salvos',exact:true}).waitFor({timeout:5000}).catch(()=>{});
   const snapshot=await page.evaluate(owner=>({body:document.body.innerText,competence:document.querySelector('[aria-label="Competência de referência"]')?.value,history:document.querySelector('.cc-financial-changes')?.innerText,review:JSON.parse(localStorage.getItem('crewcheck:publication-review:v1:'+owner)),choice:JSON.parse(localStorage.getItem('crewcheck_roster_choice_v1_'+owner)||'null')}),owner);
   fs.writeFileSync(path.join(output,selection+'.json'),JSON.stringify({snapshot,requests,errors},null,2));await page.screenshot({path:path.join(output,selection+'.png'),fullPage:true});
   if(selection==='none')assert.equal(snapshot.competence,'2026-11','untouched demo still uses tomorrow, without an owner choice');
   if(selection==='explicit'){assert.equal(snapshot.competence,'2026-10');assert.match(snapshot.history,/LA1234[\s\S]*Não vista/);}
   if(selection==='automatic'){
    assert.equal(snapshot.competence,undefined,'automatic owner choice must not silently become the next-month demo');
    assert.match(snapshot.body,/Escalas indisponíveis nesta consulta/,'bootstrap 503 must remain unavailable');
    assert.ok(requests.some(url=>url.includes('manager=1')),'real latest-import bootstrap was attempted');
    assert.equal(snapshot.choice.selection,'automatic','do not promote an automatic cache to explicit');
   }
   assert.deepEqual(snapshot.review,review,'pending history is preserved, never marked seen by a failed bootstrap');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'roster'})));
   if(selection==='automatic'){
    await page.getByRole('heading',{name:'Não foi possível carregar o histórico',exact:true}).waitFor();
    assert.equal(await page.locator('.cc-aims-document').count(),0,'no demo/import roster is fabricated during failed bootstrap');
   }else{
    const details=page.locator('details.cc-roster-view-options');if(!await details.evaluate(e=>e.open))await details.locator(':scope > summary').click();
    await page.getByRole('combobox',{name:'Formato da escala',exact:true}).selectOption('aims');
    const flight=page.locator('.cc-aims-document .cc-doc-overview').getByRole('button',{name:selection==='none'?/CC ?101, dia 2026-11-01/:/LA1234, dia 2026-10-10/});
    await flight.waitFor();snapshot.renderedRoster=await flight.innerText();
    if(selection==='explicit')assert.match(snapshot.renderedRoster,/08:10[\s\S]*09:00/,'actual selected import retains its published clocks');
   }
   await page.screenshot({path:path.join(output,selection+'-roster.png'),fullPage:true});
   fs.writeFileSync(path.join(output,selection+'.json'),JSON.stringify({snapshot,requests,errors},null,2));
   assert.deepEqual(errors,[]);results.push({selection,competence:snapshot.competence,renderedRoster:snapshot.renderedRoster,bootstrapAttempted:requests.some(url=>url.includes('manager=1'))});
  }finally{await context.close();}
 }}finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({results,realAPIRequests:0},null,2));console.log('PASS demo/explicit/automatic choice with bootstrap 503 at UTC 31 Oct; history preserved');
})().catch(error=>{console.error(error);process.exitCode=1;});
