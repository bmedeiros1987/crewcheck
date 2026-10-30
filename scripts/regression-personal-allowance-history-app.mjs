import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {guardStaticHtml} from '../server/static-html-guard.mjs';

// This companion runs after npm run build in the existing financial UI job.
// No substitute bundle, fabricated styles, optional build or live API is used.
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const out=path.resolve('artifacts/financial-known-values/personal-history-app');
fs.mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const html=fs.readFileSync('dist/index.html','utf8');
const styles=[...html.matchAll(/href="(\/assets\/[^"?]+\.css)"/g)].map(match=>match[1]);
assert(styles.length,'the actual built application must include production CSS');
const assets=styles.map(url=>({url,sha256:hash(fs.readFileSync(path.join('dist',url.slice(1))))}));
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):null;
const report={checkoutCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),pullRequestHead:event?.pull_request?.head?.sha??null,htmlSha256:hash(html),styles:assets,cases:[],blockedApiWrites:[],externalBlocked:[],pageErrors:[]};
const source=fs.readFileSync('server.mjs','utf8');
const ast=ts.createSourceFile('server.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const serve=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='serveStatic');
assert(serve,'use the real application static responder');
const scope=vm.createContext({guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
vm.runInContext(serve.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);
const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;

function seed({owner,language}){
 const NativeDate=Date,instant=Date.parse('2032-02-05T12:00:00Z');
 globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
 localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,email:'synthetic@example.invalid',name:'SYNTHETIC HISTORY',role:'user'}));
 if(language)localStorage.setItem('crewcheck_language',language);localStorage.setItem('crewcheck_auth_token','synthetic-history-only');
 localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');
 sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');
 localStorage.setItem('crewcheck_demo_mode_seen','1');
 const days=Array.from({length:29},(_,index)=>({date:String(index+1).padStart(2,'0')+'/02/2032',dayOfWeek:'SYN',type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,legs:[],dutyHours:0,flyingHours:0,isNextDay:false,hotel:null,base:'BSB',rawText:'SYNTHETIC QA ONLY'}));
 const leg=(flightNumber,from,to,departureTime,arrivalTime)=>({flightNumber,origin:from,destination:to,departureTime,arrivalTime,workType:'OP',duration:120,aircraftType:'SYN'});
 days[4]={...days[4],type:'FLIGHT',pairingCode:'SYN',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'20:30',legs:[leg('SYN1001','BSB','GRU','06:00','08:00'),leg('SYN1002','GRU','BSB','18:00','20:00')],dutyHours:16+1/3,flyingHours:4};
 const roster={crewName:'SYNTHETIC HISTORY',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month:2,year:2032,days,rawText:'SYNTHETIC — NO REAL ROSTER'};
 localStorage.setItem('crewcheck_roster_choice_v1_'+owner,JSON.stringify({owner,roster,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic personal history'}));
 localStorage.setItem('crewcheck_financial_settings_v1:'+owner+':crewcheck_perdiem_rate_domestic','100');
}

try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
  const owner='synthetic-personal-history-app-'+width;
  const context=await browser.newContext({viewport:{width,height:950},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await context.addInitScript(seed,{owner,language:'pt'});
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin){report.externalBlocked.push({host:url.host,method:request.method()});return route.abort();}
   if(url.pathname.startsWith('/api/')){
    if(request.method()!=='GET')report.blockedApiWrites.push({path:url.pathname,method:request.method()});
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,state:'unavailable',code:'SYNTHETIC_OFFLINE'})});
   }
   return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
  const loadedStyles=await page.locator('link[rel="stylesheet"]').evaluateAll(nodes=>nodes.filter(node=>node.href.includes('/assets/')).map(node=>({url:new URL(node.href).pathname,loaded:!!node.sheet})));
  assert(styles.every(url=>loadedStyles.some(style=>style.url===url&&style.loaded)),'initial production stylesheets are present and loaded');assert(loadedStyles.every(style=>style.loaded),'lazy production stylesheets are loaded');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));
  await page.locator('.cc-payment-overview').waitFor();
  await page.getByRole('button',{name:'Extrato',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='statement');
  const show=page.getByRole('button',{name:'Mostrar valores financeiros',exact:true});
  if(await show.count())await show.click();
  await page.locator('[data-taxi-rate-review] > summary').click();
  await page.getByText('Confirmar tarifa informada pelo titular',{exact:true}).click();
  for(const [month,amount,label]of [['2032-01','174,00','Synthetic January history'],['2032-10','200,00','Synthetic October history']]){
   await page.getByLabel('Mês de vigência').fill(month);await page.getByLabel('Refeição integral (BRL)').fill(amount);await page.getByLabel('Referência da confirmação').fill(label);
   await page.getByLabel('Confirmo café a 25% da refeição integral.').check();await page.getByLabel('Confirmo tarifa de táxi a 25%, com elegibilidade calculada separadamente.').check();
   await page.getByRole('button',{name:'Preparar tarifas sem gravar',exact:true}).click();
   await page.getByRole('button',{name:'Confirmar e salvar tarifas nesta conta',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Tarifas salvas nesta conta'}).waitFor();
  }
  const personal=page.locator('.cc-per-diem-items > details').filter({has:page.getByText('Reutilizar referência arquivada nas diárias',{exact:true})});
  await personal.locator('summary').first().click();
  const policyKey='crewcheck_personal_allowance_reference_v1:'+owner;
  const raw=()=>page.evaluate(key=>localStorage.getItem(key),policyKey);
  const archive=await page.evaluate(key=>localStorage.getItem(key),'crewcheck_financial_learned_rates_v2:'+owner);
  const review=async(category,period,from)=>{
   const selector=personal.getByLabel('Referência arquivada');
   const option=await selector.locator('option').filter({hasText:category}).filter({hasText:period}).first().getAttribute('value');assert(option);
   await selector.selectOption(option);await personal.getByLabel('Usar na previsão desde').fill(from);
   const before=await raw();await personal.getByRole('button',{name:'Revisar uso nas previsões',exact:true}).click();
   await personal.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).waitFor();
   assert.equal(await raw(),before,'preview preserves exact policy storage');
  };
  const confirm=async()=>{
   const before=JSON.parse(await raw()||'null')?.revision??0;
   await personal.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();
   await page.waitForFunction(({key,revision})=>JSON.parse(localStorage.getItem(key)||'null')?.revision===revision,{key:policyKey,revision:before+1});
   await personal.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).waitFor({state:'hidden'});
  };
  const capture=async(state)=>{
   await personal.scrollIntoViewIfNeeded();
   const file=width+'-'+state+'.png';await personal.screenshot({path:path.join(out,file)});
   const contextFile=width+'-'+state+'-context.png';await page.screenshot({path:path.join(out,contextFile),fullPage:false});
   const geometry=await personal.locator('select,input,button').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).map(node=>{const r=node.getBoundingClientRect();return {tag:node.tagName,left:r.left,right:r.right,width:r.width,viewport:innerWidth};}));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   const layout=await personal.evaluate(node=>{
    const panel=node.getBoundingClientRect(),parent=node.parentElement,box=parent.getBoundingClientRect(),style=getComputedStyle(parent);
    const scale=parent.offsetWidth?box.width/parent.offsetWidth:1,px=property=>(parseFloat(style[property])||0)*scale;
    return {panel:{left:panel.left,right:panel.right,width:panel.width},parentContent:{left:box.left+px('borderLeftWidth')+px('paddingLeft'),right:box.right-px('borderRightWidth')-px('paddingRight')},parentColumns:style.gridTemplateColumns};
   });
   const currentStyles=await page.locator('link[rel="stylesheet"]').evaluateAll(nodes=>nodes.filter(node=>node.href.includes('/assets/')).map(node=>({url:new URL(node.href).pathname,loaded:!!node.sheet})));
   assert(currentStyles.length&&currentStyles.every(style=>style.loaded),'captured state uses loaded production CSS');
   const styleHashes=currentStyles.map(style=>({...style,sha256:hash(fs.readFileSync(path.join('dist',style.url.slice(1))))}));
   report.cases.push({width,state,file,sha256:hash(fs.readFileSync(path.join(out,file))),contextFile,contextSha256:hash(fs.readFileSync(path.join(out,contextFile))),overflow,geometry,layout,styles:styleHashes});
   assert.equal(overflow,false,'production app has no horizontal overflow at '+width+'/'+state);
   assert(layout.parentContent.right>layout.parentContent.left,'parent content has a measurable width');
   assert(Math.abs(layout.panel.left-layout.parentContent.left)<=2&&Math.abs(layout.panel.right-layout.parentContent.right)<=2,'personal panel spans the actual parent content width at '+width+'/'+state);
   assert(geometry.every(item=>item.left>=-1&&item.right<=item.viewport+1),'all personal controls fit the production viewport at '+width+'/'+state);
  };
  await review('Refeição integral','2032-01-01','2032-01-01');assert.equal(await raw(),null);await capture('creation-preview');
  await personal.getByRole('button',{name:'Cancelar revisão de vigências',exact:true}).click();assert.equal(await raw(),null);await capture('cancelled');
  for(const category of ['Refeição integral','Café da manhã','Táxi']){await review(category,'2032-01-01','2032-01-01');await confirm();}
  await capture('january-active');
  for(const category of ['Refeição integral','Café da manhã','Táxi']){
   await review(category,'2032-10-01','2032-11-01');
   assert.match(await personal.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).innerText(),/2032-01-01 a 2032-10-31/);
   if(category==='Refeição integral')await capture('future-preview');
   await confirm();
  }
  const meal=personal.getByRole('region',{name:'Vigências pessoais de Refeição integral',exact:true});
  assert.match(await meal.innerText(),/Premissa pessoal · 2032-01-01 a 2032-10-31/);assert.match(await meal.innerText(),/Programada · 2032-11-01 em diante/);
  await capture('future-active');
  const beforeReload=await raw();await page.reload();await page.locator('.cc-per-diem-items').waitFor();await personal.locator('summary').first().click();assert.equal(await raw(),beforeReload,'real app reload preserves the reviewed timeline');
  assert.match(await meal.innerText(),/2032-01-01 a 2032-10-31/);assert.match(await meal.innerText(),/2032-11-01 em diante/);await capture('reload');
  await page.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();assert.doesNotMatch(await personal.innerText(),/174,00|200,00|43,50|50,00/);assert.match(await meal.innerText(),/2032-11-01/);await capture('masked');
  await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
  const beforeRevoke=await raw();await personal.getByRole('button',{name:'Revogar Refeição integral',exact:true}).click();assert.equal(await raw(),beforeRevoke,'revocation preview preserves exact policy storage');
  assert.match(await personal.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).innerText(),/todas as datas.*cancela seus usos programados/);await capture('revocation-preview');
  await confirm();assert.equal(await meal.count(),0);assert.equal(await personal.getByRole('region',{name:'Vigências pessoais de Café da manhã',exact:true}).count(),1);assert.equal(await personal.getByRole('region',{name:'Vigências pessoais de Táxi',exact:true}).count(),1);await capture('revoked');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),'crewcheck_financial_learned_rates_v2:'+owner),archive,'reuse and revoke never rewrite archived sources');
  await context.close();
 }
 assert.equal(report.cases.length,18,'all nine visual states exist at both widths');
 assert.equal(report.blockedApiWrites.filter(item=>item.path.startsWith('/api/platform/finance/')).length,0,'no financial API writes');
 assert.deepEqual(report.pageErrors,[]);
 console.log('PASS production-CSS personal history app: 390/1440, preview/cancel/save, current/future timeline, reload, privacy, global revoke, source preservation and no horizontal overflow; synthetic APIs only.');
}finally{
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
