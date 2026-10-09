const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const out = path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR || 'artifacts/financial-ui');
fs.mkdirSync(out, { recursive: true });
const dist = path.resolve('dist');
// Exercise the production static responder rather than a test-only MIME table.
const vm = require('node:vm'), ts = require('typescript');
const serverSource=fs.readFileSync(path.resolve('server.mjs'),'utf8');
const staticAst=ts.createSourceFile('server.mjs',serverSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const staticFunctions=staticAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='serveStatic');
assert.equal(staticFunctions.length,1,'exactly one production static handler must exist');
const staticContext=vm.createContext({fs,path,Buffer,distDir:dist,sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
vm.runInContext(staticFunctions[0].getText(staticAst)+'\nglobalThis.respond=serveStatic;',staticContext);
const server=http.createServer((req,res)=>staticContext.respond(req,res,new URL(req.url,'http://localhost')));
const day = (date, airport = 'BSB', short = false) => ({date, dayOfWeek:'SYN', type:'CRM', pairingCode:'CRM', dutyReport:short?'11:00':'05:00', dutyDebrief:short?'11:15':'21:00', legs:[], dutyHours:short ? 0.25 : 16, flyingHours:0, isNextDay:false, hotel:null, base:airport, rawText:'SYNTHETIC UI QA ONLY'});
function roster(kind, month=2) {
  const airports = kind === 'multi' ? ['BSB','JFK','MAD','LHR'] : ['BSB'];
  const days = kind === 'empty' ? [{...day('01/02/2032'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,dutyHours:0}]
    : kind === 'single' ? [day('01/02/2032','BSB',true)]
    : [day('31/01/2032','JFK'), ...Array.from({length:24},(_,i)=>day(String(i+1).padStart(2,'0')+'/02/2032',airports[i%airports.length])),day('01/03/2032')];
  if(kind==='unknown')days[2]={...days[2],base:'ZZZ'};
  return {crewName:'SYNTHETIC UI QA',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month,year:2032,days,rawText:'SYNTHETIC — NO REAL ROSTER OR TARIFF'};
}
function seed({theme,kind,amount,history,salaryBase}) {
  const NativeDate=Date,instant=Date.parse('2032-02-02T15:00:00Z');
  globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
  localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC UI QA',role:'user'}));
  localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');
  localStorage.setItem('crewcheck_demo_mode_seen','1');
  localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);
  // Synthetic numbers exercise the existing local manual-configuration path;
  // they are not ACT rules, copied statement figures or a production tariff.
  for(const key of ['domestic','north_america','mexico','south_america_caribbean','argentina','chile','england','europe','africa','other_international'])localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_perdiem_rate_'+key,String(amount));
  if(history)localStorage.setItem('crewcheck_local_history_v11_financial-ui-qa',JSON.stringify(history));
  if(salaryBase!==undefined)localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_salary_base_brl',String(salaryBase));
  localStorage.setItem('crewcheck_roster_choice_v1_financial-ui-qa',JSON.stringify({owner:'financial-ui-qa',roster:kind,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic finance UI QA'}));
}
async function settle(page) {
 await page.evaluate(async()=>{
  await document.fonts.ready;
  const finite=document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime));
  await Promise.allSettled(finite.map(animation=>animation.finished));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
}
async function measureMoney(page) {
 return page.evaluate(()=>{
  const violations=[],amounts=[],intersections=[],splitAmounts=[],splitCurrencyTokens=[];
  for(const element of document.querySelectorAll('.cc-per-diem-content .cz-kpi strong, .cc-per-diem-content .cz-finance-row b')) {
   if(!element.getClientRects().length)continue;
   const box=element.closest('.cz-kpi,.cz-finance-row').getBoundingClientRect();
   const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
   while(node=walker.nextNode())for(let i=0;i<node.textContent.length;i++) {
    if(/\s/.test(node.textContent[i]))continue;
    const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
    for(const rect of range.getClientRects())if(rect.left<box.left-1||rect.right>box.right+1||rect.top<box.top-1||rect.bottom>box.bottom+1)violations.push({value:element.textContent,char:node.textContent[i],rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom}});
   }
   amounts.push(element.textContent);
   const textNodes=[],tw=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let tn,offset=0;
   while(tn=tw.nextNode()){textNodes.push({node:tn,start:offset,end:offset+tn.textContent.length});offset+=tn.textContent.length;}
   const text=textNodes.map(item=>item.node.textContent).join('');
   for(const match of text.matchAll(/[−-]?(?:[A-Z]{1,3}\$|[€£])\s*[−-]?[0-9][0-9.]*,[0-9]{2}/g)) {
    const tops=new Set();
    for(const item of textNodes)for(let at=Math.max(match.index,item.start);at<Math.min(match.index+match[0].length,item.end);at++) {
     const pos=at-item.start;if(/\s/.test(item.node.textContent[pos]))continue;
     const range=document.createRange();range.setStart(item.node,pos);range.setEnd(item.node,pos+1);
     for(const rect of range.getClientRects())tops.add(Math.round(rect.top));
    }
    if(tops.size>1)splitCurrencyTokens.push(match[0]);
   }
  }
  for(const row of document.querySelectorAll('.cc-per-diem-content .cz-finance-row')) {
   const value=row.querySelector('b'), label=row.querySelector('strong');
   const rectangles=element=>{const rects=[],walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const range=document.createRange();range.selectNodeContents(node);rects.push(...range.getClientRects());}return rects;};
   const vr=rectangles(value),lr=rectangles(label);
   if(vr.some(a=>lr.some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1)))intersections.push({value:value.textContent,label:label.textContent});
   if(new Set(vr.map(r=>Math.round(r.top))).size!==1)splitAmounts.push(value.textContent);
  }
  return {violations,amounts,intersections,splitAmounts,splitCurrencyTokens};
 });
}
async function contrast(page) {
 return page.evaluate(()=>{
  const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const results=[];
  for(const selector of ['.cz-kpi p','.cc-per-diem-source small','.cc-per-diem-scope','.cz-kpi .cc-money-token','.cz-finance-row .cc-money-token']) for(const element of document.querySelectorAll('.cc-per-diem-content '+selector)) {
   if(!element.getClientRects().length)continue;
   const fg=getComputedStyle(element);let ancestor=element,bg,opacity=1;for(let e=element;e&&e.closest('.cc-per-diem-content');e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);
   while(ancestor){const color=getComputedStyle(ancestor).backgroundColor;if(!color.includes('rgba')&&color!=='transparent'){bg=color;break;}ancestor=ancestor.parentElement;}
   if(!bg)throw Error('No solid background for contrast');
   const a=lum(rgb(fg.color)),b=lum(rgb(bg));results.push({selector,color:fg.color,background:bg,opacity:String(opacity),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
  }
  return results;
 });
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 const results=[];
 try {
  const cases=[['desktop',1440,900,1,1,'domestic'],['mobile',390,844,1,1,'domestic'],['small-mobile',320,740,1,1,'large'],['desktop-large-200-css',1440,900,2,1,'large'],['mobile-large-200-css',390,844,2,1,'large'],['desktop-200-responsive',720,450,1,2,'large'],['mobile-multi',390,844,1,1,'multi'],['desktop-multi-200',720,450,1,2,'multi'],['mobile-single',390,844,1,1,'single'],['mobile-unknown',390,844,1,1,'unknown'],['mobile-empty',390,844,1,1,'empty']];
  for(const theme of ['light','dark'])for(const [label,width,height,zoom,scale,kind] of cases) {
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:scale,timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
   let blockedExternal=0,apiRequests=0;const errors=[];
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){blockedExternal++;return route.abort();}if(url.pathname.startsWith('/api/')){apiRequests++;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});}return route.continue();});
   await context.addInitScript(seed,{theme,kind:roster(kind),amount:kind==='large'?1234567.89:100});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app');
   await page.locator('.cz-app').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));
   await page.locator('.cc-per-diem-content').waitFor();await page.evaluate(z=>document.body.style.zoom=String(z),zoom);await settle(page);
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   assert.equal(await page.locator('.cc-per-diem-content details[open]').count(),0);
   assert.equal(await page.locator('.cc-per-diem-summary .cz-kpi').count(),1);
   const alignment=await page.evaluate(()=>{const a=document.querySelector('.cz-global-header').getBoundingClientRect(),b=document.querySelector('.cc-per-diem-content').getBoundingClientRect();const panels=Array.from(document.querySelector('.cc-per-diem-content').children).map(e=>{const r=e.getBoundingClientRect();return{className:e.className,x:r.x,width:r.width}});const style=e=>{const s=getComputedStyle(e);return{width:s.width,maxWidth:s.maxWidth,padding:s.padding,boxSizing:s.boxSizing,position:s.position,transform:s.transform,font:s.fontFamily,fontSize:s.fontSize}};return{header:{x:a.x,width:a.width},content:{x:b.x,width:b.width},panels,environment:{innerWidth,clientWidth:document.documentElement.clientWidth,devicePixelRatio,bodyZoom:getComputedStyle(document.body).zoom,fontStatus:document.fonts.status,fonts:Array.from(document.fonts).map(f=>({family:f.family,status:f.status})),headerStyle:style(document.querySelector('.cz-global-header')),contentStyle:style(document.querySelector('.cc-per-diem-content')),appStyle:style(document.querySelector('.cz-app')),viewport:window.visualViewport?{width:visualViewport.width,scale:visualViewport.scale}:null,animations:document.getAnimations().map(a=>({state:a.playState,timing:a.effect?.getComputedTiming()}))}};});
   fs.writeFileSync(path.join(out,theme+'-'+label+'-alignment.json'),JSON.stringify({case:{theme,label,width,height,zoom,scale,kind},userAgent:await page.evaluate(()=>navigator.userAgent),alignment},null,2));
   assert.ok(Math.abs(alignment.header.x-alignment.content.x)<=1&&Math.abs(alignment.header.width-alignment.content.width)<=1,'content aligns with actual global header: '+JSON.stringify({theme,label,alignment}));
   assert.ok(alignment.panels.every(panel=>Math.abs(panel.x-alignment.header.x)<=1&&Math.abs(panel.width-alignment.header.width)<=1),'visible panels align with actual header after animations settle: '+JSON.stringify(alignment));
   const name=theme+'-'+label;await page.screenshot({path:path.join(out,name+'-summary.png')});
   await page.locator('.cc-per-diem-periods > summary').click();await page.locator('.cc-per-diem-items > summary').click();await settle(page);
   const rows=page.locator('.cc-per-diem-content .cz-finance-row'),count=await rows.count();
   if(!['empty','single','unknown'].includes(kind))assert.ok(count>40,'monthly list contains all canonical rows beyond forty');
   assert.ok(await rows.evaluateAll(elements=>elements.every(e=>e.dataset.financialIso.startsWith('2032-02-'))),'adjacent months excluded');
   if(count){await rows.first().locator('summary').click();await rows.first().scrollIntoViewIfNeeded();await settle(page);await page.screenshot({path:path.join(out,name+'-origin.png')});}
   const money=await measureMoney(page);assert.deepEqual(money.violations,[],'each money glyph remains inside its own card/row');assert.deepEqual(money.intersections,[],'amount and description never intersect');assert.deepEqual(money.splitAmounts,[],'currency amount and cents remain on one line');
   const colors=await contrast(page);assert.ok(colors.every(c=>Number(c.opacity)===1&&c.ratio>=4.5),'readable muted/source text in each theme');
   if(kind==='multi')assert.equal(new Set(await rows.evaluateAll(es=>es.map(e=>e.dataset.financialCurrency))).size,4);
   if(kind==='single')assert.match(await page.locator('.cc-per-diem-summary').innerText(),/1 item · 1 moeda/);
   if(kind==='unknown')assert.match(await page.locator('.cc-per-diem-summary').innerText(),/Não calculável/);
   if(kind==='empty'){assert.equal(count,0);assert.doesNotMatch(await page.locator('.cc-per-diem-content').innerText(),/R\$\s*0,00|pagamento confirmado/);}
   let last=null,nav=null;
   if(count){await rows.last().evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await settle(page);last=await rows.last().boundingBox();nav=await page.locator('.cz-bottom-nav').boundingBox();assert.ok(last.y>=0&&last.y+last.height<=nav.y+1,'last row clears unchanged navigation');await page.screenshot({path:path.join(out,name+'-last.png')});}
   const sizes=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.scroll<=sizes.viewport+1,'no page horizontal overflow');
   if(label==='desktop'&&kind==='domestic') {
    for(const month of [1,3]){
     await page.evaluate(payload=>{const value=JSON.stringify({owner:'financial-ui-qa',roster:payload,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic selected period'});localStorage.setItem('crewcheck_roster_choice_v1_financial-ui-qa',value);window.dispatchEvent(new StorageEvent('storage',{key:'crewcheck_roster_choice_v1_financial-ui-qa',newValue:value}));},roster('domestic',month));
     await page.waitForFunction(m=>document.querySelector('[aria-label="Competência de referência"]')?.value==='2032-'+String(m).padStart(2,'0'),month);
     await page.waitForFunction(prefix=>Array.from(document.querySelectorAll('[data-financial-iso]')).length>0&&Array.from(document.querySelectorAll('[data-financial-iso]')).every(e=>e.dataset.financialIso.startsWith(prefix)),'2032-'+String(month).padStart(2,'0'));
     assert.equal(await rows.count(),2,'actual owner selection updates visible monthly items');
    }
   }
   assert.deepEqual(errors,[]);results.push({name,kind,width,height,zoom,deviceScaleFactor:scale,alignment,count,money,colors,last,nav,sizes,blockedExternal,interceptedAPIs:apiRequests,realAPIRequests:0,errors});await context.close();
  }
  const pdfLines=['SYNTHETIC ONLY','DEMONSTRATIVO DE DIARIAS','De 2032-01-28 ate 2032-02-03','Pagamento em 2032-02-05','ALMOCO R$ 100,00','Total depositado R$ 850,00','Total depositado R$ 850,00'];
  const commands='BT /F1 12 Tf 14 TL 20 250 Td '+pdfLines.map((line,index)=>(index?'T* ':'')+'('+line+') Tj').join(' ')+' ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+Buffer.byteLength(commands)+' >>\nstream\n'+commands+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf='%PDF-1.4\n',offsets=[0];for(let index=0;index<objects.length;index++){offsets.push(Buffer.byteLength(pdf));pdf+=(index+1)+' 0 obj\n'+objects[index]+'\nendobj\n';}const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(value=>String(value).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n'+xref+'\n%%EOF';
  const syntheticPdf=path.join(out,'synthetic-reconciliation.pdf');fs.writeFileSync(syntheticPdf,pdf);
  const partialPdf=path.join(out,'synthetic-partial-coincidence.pdf');fs.writeFileSync(partialPdf,pdf.replaceAll('850','600'));
  const historyResults=[];
  for(const theme of ['light','dark'])for(const width of [1440,390]) {
   const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[]}'});return route.continue();});
   const jan={...roster('domestic',1),days:[day('31/01/2032','BSB')]},march={...roster('domestic',3),days:[day('01/03/2032','BSB')]},foreign={...roster('domestic',4),crewId:'900002',crewName:'FOREIGN SYNTHETIC'};
   const oldJan={...jan,days:[day('31/01/2032','BSB',true)]};
   const history=[{id:'local-synthetic-old-jan',checksum:'old-jan',createdAt:'2032-02-01T00:00:00Z',roster:oldJan,sourceFileName:'Synthetic old January'},{id:'local-synthetic-new-jan',checksum:'new-jan',createdAt:'2032-02-02T00:00:00Z',roster:jan,sourceFileName:'Synthetic latest January'},{id:'local-synthetic-march',checksum:'march',createdAt:'2032-03-02T00:00:00Z',roster:march,sourceFileName:'Synthetic March'},{id:'local-synthetic-foreign',checksum:'foreign',createdAt:'2032-04-02T00:00:00Z',roster:foreign,sourceFileName:'FOREIGN SYNTHETIC'}];
   await context.addInitScript(seed,{theme,kind:roster('domestic'),amount:100,history,salaryBase:900});
   const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));await page.locator('.cc-per-diem-content').waitFor();await settle(page);
   const selector=page.getByLabel('Competência de referência',{exact:true});await page.waitForFunction(()=>document.querySelector('[aria-label="Competência de referência"]')?.options.length===3);
   assert.doesNotMatch(await selector.innerText(),/abril/,'foreign crew history excluded');
   const readability=await page.locator('.cc-financial-period').evaluate(root=>Array.from(root.querySelectorAll('label')).map(label=>{const select=label.querySelector('select'),caption=label.querySelector('span'),style=getComputedStyle(select),captionStyle=getComputedStyle(caption),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=style.font;return {width:select.getBoundingClientRect().width,needed:ctx.measureText(select.selectedOptions[0].textContent).width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+20,captionHeight:caption.getBoundingClientRect().height,lineHeight:parseFloat(captionStyle.lineHeight)};}));
   for(const control of readability){assert.ok(control.width>=control.needed,'selected month/year and filter must be legible at actual font width');assert.ok(control.captionHeight<=control.lineHeight*2+1,'label must not wrap letter by letter');}

   await page.locator('.cc-financial-graph > summary').click();await page.getByRole('button',{name:'Comparar meses do ano'}).click();await page.waitForFunction(()=>document.querySelectorAll('.cc-financial-bars>button').length===3);await settle(page);
   assert.match(await page.locator('.cc-financial-graph').innerText(),/Maior previsão: fevereiro/);assert.match(await page.locator('.cc-per-diem-summary').innerText(),/Não calculável/,'missing months do not become a full-year total');
   await page.screenshot({path:path.join(out,theme+'-history-'+width+'-year.png')});
   await page.getByRole('button',{name:'Abrir janeiro de 2032',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cc-per-diem-summary')?.textContent.includes('200,00'));await settle(page);
   assert.equal(await page.locator('[data-financial-iso]').count(),2,'latest January revision selected once');
   await page.screenshot({path:path.join(out,theme+'-history-'+width+'-month.png')});
   await page.locator('.cc-financial-week-list>button').last().click();await page.waitForFunction(()=>document.querySelector('[aria-label="Filtro financeiro"]')?.value==='custom');await settle(page);
   assert.match(await page.locator('.cc-per-diem-summary').innerText(),/200,00/);
   await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('week');await page.getByLabel('Dia da semana de trabalho',{exact:true}).fill('2032-02-01');await page.waitForFunction(()=>document.querySelector('.cc-per-diem-summary')?.textContent.includes('800,00'));
   assert.equal(await page.locator('[data-financial-iso]').count(),8,'cross-month week includes nominal sources without duplicate adjacency');
   await page.screenshot({path:path.join(out,theme+'-history-'+width+'-week.png')});
   await page.locator('.cc-financial-reconciliation>summary').click();await page.locator('.cc-financial-reconciliation input[type=file]').setInputFiles(syntheticPdf);await page.getByLabel('Conciliação de diárias',{exact:true}).waitFor();const reconciliation=await page.getByLabel('Conciliação de diárias',{exact:true}).innerText();assert.match(reconciliation,/850,00/);assert.match(reconciliation,/800,00/);assert.match(reconciliation,/50,00/);assert.doesNotMatch(reconciliation,/1\.700,00/,'repeated document total counts once');await page.screenshot({path:path.join(out,theme+'-history-'+width+'-reconciliation.png')});
   await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('custom');await page.getByLabel('Início financeiro',{exact:true}).fill('2032-02-10');await page.getByLabel('Fim financeiro',{exact:true}).fill('2032-02-10');await page.waitForFunction(()=>document.querySelector('.cc-per-diem-summary')?.textContent.includes('200,00'));
   assert.equal(await page.locator('[data-financial-iso]').count(),2);assert.match(await page.locator('.cc-financial-bars').innerText(),/200,00/,'graph and selected detail use the same interval');
   await page.getByLabel('Início financeiro',{exact:true}).fill('2032-02-11');await page.waitForFunction(()=>document.querySelector('.cc-per-diem-summary')?.textContent.includes('Não calculável'));
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.locator('.cc-salary-history').waitFor();await settle(page);
   assert.match(await page.locator('.cc-per-diem-summary').innerText(),/900,00/);await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('week');await settle(page);
   assert.match(await page.locator('.cc-per-diem-summary').innerText(),/Não calculável/,'monthly salary is not prorated into a week');
   await page.screenshot({path:path.join(out,theme+'-history-'+width+'-salary-week.png')});
   assert.equal(await page.locator('.cc-per-diem-competence').count(),0,'reference competence must not masquerade as the selected work interval');
   await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'foreign-owner',name:'FOREIGN SYNTHETIC',role:'user'}));localStorage.setItem('crewcheck_auth_token','foreign-synthetic-token');window.dispatchEvent(new CustomEvent('crewcheck:auth-changed'));});await settle(page);
   assert.equal(await page.locator('.cc-per-diem-summary').count(),0,'account switch hides prior owner financial view');
   await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC',role:'visitor'}));window.dispatchEvent(new CustomEvent('crewcheck:auth-changed'));window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'}));});await settle(page);assert.equal(await page.locator('.cc-per-diem-summary').count(),0,'visitor has no financial access');
   historyResults.push({theme,width,checks:['latest revision','foreign crew excluded','year incomplete','month drilldown','cross-month week','custom sync','salary no weekly proration','account switch','visitor denied','private read-only document reconciliation','repeated total dedup'],synthetic:true});await context.close();
  }
  for(const scenario of ['newer-current','conflicting-current','missing-document-month','fx-refresh','online-newer-current','online-conflicting-current']) {
   const context=await browser.newContext({viewport:{width:390,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(scenario.startsWith('online-')&&route.request().method()==='GET'){const older={id:'server-old',createdAt:'2032-02-01T00:00:00Z',checksum:null,year:2032,month:2,crewId:'900001',crewName:'SYNTHETIC UI QA',isActive:false},newest={...older,id:'server-new',createdAt:'2032-02-03T00:00:00Z'};if(url.pathname==='/api/rosters')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rosters:scenario.includes('conflicting')?[newest,{...newest,id:'server-conflict'}]:[older,newest]})});if(url.pathname==='/api/rosters/active')return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"roster":null}'});if(url.pathname==='/api/rosters/server-new')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{roster:newer,compliance:{score:0,alerts:[]},gym:[]}})});}if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[]}'});return route.continue();});
   const newer={...roster('domestic'),days:[day('02/02/2032')]};
   const history=scenario==='newer-current'||scenario==='conflicting-current'?[{id:'local-current-new',checksum:'new',createdAt:'2032-02-03T00:00:00Z',roster:newer,sourceFileName:'Synthetic latest current'},...(scenario==='conflicting-current'?[{id:'local-current-conflict',checksum:'conflict',createdAt:'2032-02-03T00:00:00Z',roster:{...newer,days:[day('03/02/2032')]},sourceFileName:'Synthetic conflicting current'}]:[])]:[];
   const payload=scenario==='fx-refresh'?{...roster('domestic'),days:[day('02/02/2032','JFK')]}:roster('domestic');
   await context.addInitScript(seed,{theme:'light',kind:payload,amount:100,history});const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));await page.locator('.cc-per-diem-content').waitFor();await settle(page);
   if(scenario.includes('newer-current')){await page.waitForFunction(()=>document.querySelector('.cc-per-diem-summary')?.textContent.includes('200,00'));assert.equal(await page.locator('[data-financial-iso]').count(),2,'current month uses newest saved revision');}
   if(scenario.includes('conflicting-current')){await page.getByText(/Revisões ambíguas/).waitFor();assert.match(await page.locator('.cc-per-diem-summary').innerText(),/Não calculável/);assert.equal(await page.locator('[data-financial-iso]').count(),0,'current month conflict rejects the selected roster too');}
   if(scenario==='missing-document-month'){await page.locator('.cc-financial-reconciliation>summary').click();await page.locator('.cc-financial-reconciliation input[type=file]').setInputFiles(partialPdf);const panel=page.getByLabel('Conciliação de diárias',{exact:true});await panel.waitFor();assert.match(await panel.innerText(),/Cobertura incompleta.*2032-01/);assert.doesNotMatch(await panel.innerText(),/Diferença a conferir:/,'missing month cannot produce an apparent exact comparison');}
   if(scenario==='fx-refresh'){page.on('dialog',dialog=>dialog.accept('5'));await page.getByRole('button',{name:'Informar câmbio'}).click();await page.locator('.cc-per-diem-periods>summary').click();await page.waitForFunction(()=>document.querySelector('.cc-per-diem-converted')?.textContent.includes('1.000,00')||Array.from(document.querySelectorAll('.cz-finance-grid')).some(element=>element.textContent.includes('1.000,00')));await page.locator('.cc-financial-graph>summary').click();assert.match(await page.locator('.cc-financial-bars').innerText(),/200,00/,'native USD graph remains native after BRL conversion');}
   await page.screenshot({path:path.join(out,scenario+'.png')});historyResults.push({scenario,synthetic:true});await context.close();
  }
  for (const width of [390,1440]) {
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[]}'});return route.continue();});
   await context.addInitScript(seed,{theme:'light',kind:roster('domestic'),amount:100});
   await context.addInitScript(()=>localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC ADMIN',role:'admin'})));
   const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'admin'})));
   const importer=page.getByLabel('Importar demonstrativo de diárias',{exact:true});await importer.waitFor();
   await importer.locator('input[type=file]').setInputFiles(syntheticPdf);await importer.locator('.finance-learning-review').waitFor();
   assert.match(await importer.locator('.finance-learning-review').innerText(),/2032-01-28 até 2032-02-03/);
   assert.equal(await importer.getByRole('button',{name:'Confirmar valores',exact:true}).isDisabled(),true,'document review requires owner confirmation');
   await importer.locator('input[type=checkbox]').check();await importer.getByRole('button',{name:'Confirmar valores',exact:true}).click();await importer.locator('.finance-learning-review').waitFor({state:'hidden'});
   const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_financial_learned_rates_v2:financial-ui-qa')));
   assert.equal(stored.ownerId,'financial-ui-qa');assert.equal(stored.rates.length,1);assert.equal(stored.rates[0].effectiveTo,'2032-02-03');
   await importer.locator('input[type=file]').setInputFiles(syntheticPdf);await importer.locator('.finance-learning-review').waitFor();await importer.locator('input[type=checkbox]').check();await importer.getByRole('button',{name:'Confirmar valores',exact:true}).click();await importer.locator('.finance-learning-review').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_financial_learned_rates_v2:financial-ui-qa')).rates.length),1,'actual repeat import deduplicates');
   await importer.locator('input[type=file]').setInputFiles(syntheticPdf);await importer.locator('.finance-learning-review').waitFor();
   await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'different-admin',name:'OTHER SYNTHETIC',role:'admin'}));localStorage.setItem('crewcheck_auth_token','other-synthetic');window.dispatchEvent(new CustomEvent('crewcheck:auth-changed'));});await settle(page);
   assert.equal(await page.locator('.finance-learning-review').count(),0,'account change clears pending document review');
   assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_financial_learned_rates_v2:different-admin')),null,'no document is written to the other account');
   historyResults.push({scenario:'actual-owner-document-review',width,synthetic:true,checks:['bounded review dates','explicit owner consent','owner-scoped write','repeat PDF dedup','account switch clears review']});await context.close();
  }
  for (const width of [390,1440]) {
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[]}'});return route.continue();});
   const march={...roster('domestic',3),days:[day('01/03/2032')]};
   await context.addInitScript(seed,{theme:'light',kind:roster('domestic'),amount:100,history:[{id:'local-fixed-march',checksum:'synthetic-fixed-march',createdAt:'2032-03-02T00:00:00Z',roster:march,sourceFileName:'Synthetic March'}]});
   await context.addInitScript(()=>{const source={ownerId:'financial-ui-qa',currency:'BRL',sourceDocument:'synthetic-payroll.pdf',sourceFingerprint:'synthetic-separated-competences',confidence:'high',valueOrigin:'printed',confirmed:true,revision:1,payrollCompetence:'2032-03',cycleSource:'user-reported-absa-tam'};localStorage.setItem('crewcheck_financial_learned_rates_v2:financial-ui-qa',JSON.stringify({version:2,ownerId:'financial-ui-qa',rates:[{...source,key:'salary.base',label:'Synthetic base',unit:'month',value:2400,effectiveFrom:'2032-03-01',effectiveTo:'2032-03-31'},{...source,key:'salary.dayKm',label:'Synthetic variable',unit:'km',value:.07,effectiveFrom:'2032-02-01',effectiveTo:'2032-02-29'}]}));});
   const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.locator('.cc-salary-history').waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Competência de referência"]')?.options.length===2);
   assert.match(await page.locator('.cc-per-diem-summary').innerText(),/Não calculável/,'February operational variables cannot consume the March fixed base');
   const details=page.locator('.cc-salary-history details').filter({has:page.locator('summary').filter({hasText:'Composição mensal'})});await details.locator(':scope>summary').click();assert.match(await details.innerText(),/Salário-base: Não informado/);assert.match(await details.innerText(),/Variáveis operacionais:2032-02|Variáveis operacionais: 2032-02/);
   await page.getByLabel('Competência de referência',{exact:true}).selectOption('2032-03');await page.waitForFunction(()=>document.querySelector('.cc-per-diem-summary')?.textContent.includes('2.400,00'));assert.match(await details.innerText(),/Salário-base: R\$\s*2\.400,00/);
   await page.screenshot({path:path.join(out,'fixed-base-once-'+width+'.png')});historyResults.push({scenario:'one-fixed-base-separated-from-operational-variables',width,synthetic:true});await context.close();
  }
  for (const width of [320,1440]) for(const theme of ['light','dark']) for(const size of [150,200]) {
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[]}'});return route.continue();});
   const flight={...roster('domestic'),days:[{...day('10/02/2032'),type:'FLIGHT',pairingCode:'SYN',legs:[{flightNumber:'SYN001',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:45',workType:'OP',duration:105,aircraftType:'SYNTHETIC'}]}]};
   await context.addInitScript(seed,{theme,kind:flight,amount:100,salaryBase:2400});
   await context.addInitScript(size=>{localStorage.setItem('crewcheck:text-size:v1:financial-ui-qa',String(size));for(const key of ['day','night'])localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_act_'+key+'_km_metric_brl','1234567.89');},size);
   const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.locator('.cc-salary-history').waitFor();await page.waitForFunction(size=>document.documentElement.dataset.crewTextSize===String(size),size);
   await page.locator('.cc-per-diem-items>summary').click();const row=page.locator('.cc-salary-history .cz-finance-row');await row.waitFor();assert.equal(await row.count(),1);await row.scrollIntoViewIfNeeded();await settle(page);assert.match(await row.locator('b').innerText(),/R\$.*[0-9.]{9,},[0-9]{2}/,'actual salary row has large synthetic amount');
   const measured=await measureMoney(page);assert.deepEqual(measured.violations,[]);assert.deepEqual(measured.intersections,[]);assert.deepEqual(measured.splitAmounts,[]);assert.deepEqual(measured.splitCurrencyTokens,[]);const colors=await contrast(page);assert.ok(colors.every(item=>Number(item.opacity)===1&&item.ratio>=4.5));
   await page.screenshot({path:path.join(out,'combined-salary-'+width+'-'+theme+'-'+size+'.png')});historyResults.push({scenario:'combined-large-salary-money',width,theme,size,money:measured,colors,synthetic:true});await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({synthetic:true,methods:{cssZoom:'CSS zoom stress; not native browser zoom',responsive200:'Half CSS viewport with device scale2; not native browser zoom',devices:'Desktop Chromium emulation; no physical-device certification'},results,historyResults},null,2));
  console.log('PASS actual compiled Diárias: themes, scopes, >40 rows, owner period changes, large money glyph bounds, contrast, navigation clearance');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
