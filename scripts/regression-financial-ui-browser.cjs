const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const out = path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR || 'artifacts/financial-ui');
fs.mkdirSync(out, { recursive: true });
const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/app' || pathname === '/' ? path.join(dist, 'index.html') : path.join(dist, pathname);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const day = (date, airport = 'BSB', short = false) => ({date, dayOfWeek:'SYN', type:'CRM', pairingCode:'CRM', dutyReport:short?'11:00':'05:00', dutyDebrief:short?'11:15':'21:00', legs:[], dutyHours:short ? 0.25 : 16, flyingHours:0, isNextDay:false, hotel:null, base:airport, rawText:'SYNTHETIC UI QA ONLY'});
function roster(kind, month=2) {
  const airports = kind === 'multi' ? ['BSB','JFK','MAD','LHR'] : ['BSB'];
  const days = kind === 'empty' ? [{...day('01/02/2032'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,dutyHours:0}]
    : kind === 'single' ? [day('01/02/2032','BSB',true)]
    : [day('31/01/2032','JFK'), ...Array.from({length:24},(_,i)=>day(String(i+1).padStart(2,'0')+'/02/2032',airports[i%airports.length])),day('01/03/2032')];
  if(kind==='unknown')days[2]={...days[2],base:'ZZZ'};
  return {crewName:'SYNTHETIC UI QA',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month,year:2032,days,rawText:'SYNTHETIC — NO REAL ROSTER OR TARIFF'};
}
function seed({theme,kind,amount}) {
  const NativeDate=Date,instant=Date.parse('2032-02-02T15:00:00Z');
  globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
  localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC UI QA',role:'user'}));
  localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');
  localStorage.setItem('crewcheck_demo_mode_seen','1');
  localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);
  // Synthetic numbers exercise the existing local manual-configuration path;
  // they are not ACT rules, copied statement figures or a production tariff.
  for(const key of ['domestic','north_america','mexico','south_america_caribbean','argentina','chile','england','europe','africa','other_international'])localStorage.setItem('crewcheck_perdiem_rate_'+key,String(amount));
  localStorage.setItem('crewcheck_roster_choice_v1_financial-ui-qa',JSON.stringify({owner:'financial-ui-qa',roster:kind,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic finance UI QA'}));
}
async function settle(page) {
 await page.evaluate(async()=>{
  const finite=document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime));
  await Promise.allSettled(finite.map(animation=>animation.finished));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
}
async function measureMoney(page) {
 return page.evaluate(()=>{
  const violations=[],amounts=[];
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
  }
  return {violations,amounts};
 });
}
async function contrast(page) {
 return page.evaluate(()=>{
  const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const results=[];
  for(const selector of ['.cz-kpi p','.cc-per-diem-source small','.cc-per-diem-scope']) {
   const element=document.querySelector('.cc-per-diem-content '+selector);if(!element||!element.getClientRects().length)continue;
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
   const alignment=await page.evaluate(()=>{const a=document.querySelector('.cz-global-header').getBoundingClientRect(),b=document.querySelector('.cc-per-diem-content').getBoundingClientRect();const panels=Array.from(document.querySelector('.cc-per-diem-content').children).map(e=>{const r=e.getBoundingClientRect();return{className:e.className,x:r.x,width:r.width}});return{header:{x:a.x,width:a.width},content:{x:b.x,width:b.width},panels};});
   assert.ok(Math.abs(alignment.header.x-alignment.content.x)<=1&&Math.abs(alignment.header.width-alignment.content.width)<=1,'content aligns with actual global header');
   assert.ok(alignment.panels.every(panel=>Math.abs(panel.x-alignment.header.x)<=1&&Math.abs(panel.width-alignment.header.width)<=1),'visible panels align with actual header after animations settle: '+JSON.stringify(alignment));
   const name=theme+'-'+label;await page.screenshot({path:path.join(out,name+'-summary.png')});
   await page.locator('.cc-per-diem-periods > summary').click();await page.locator('.cc-per-diem-items > summary').click();await settle(page);
   const rows=page.locator('.cc-per-diem-content .cz-finance-row'),count=await rows.count();
   if(!['empty','single','unknown'].includes(kind))assert.ok(count>40,'monthly list contains all canonical rows beyond forty');
   assert.ok(await rows.evaluateAll(elements=>elements.every(e=>e.dataset.financialIso.startsWith('2032-02-'))),'adjacent months excluded');
   if(count){await rows.first().locator('summary').click();await rows.first().scrollIntoViewIfNeeded();await settle(page);await page.screenshot({path:path.join(out,name+'-origin.png')});}
   const money=await measureMoney(page);assert.deepEqual(money.violations,[],'each money glyph remains inside its own card/row');
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
     await page.waitForFunction(m=>document.querySelector('.cc-per-diem-competence')?.textContent.includes(m===1?'janeiro':'março'),month);
     await page.waitForFunction(prefix=>Array.from(document.querySelectorAll('[data-financial-iso]')).every(e=>e.dataset.financialIso.startsWith(prefix)),'2032-'+String(month).padStart(2,'0'));
     assert.equal(await rows.count(),2,'actual owner selection updates visible monthly items');
    }
   }
   assert.deepEqual(errors,[]);results.push({name,kind,width,height,zoom,deviceScaleFactor:scale,alignment,count,money,colors,last,nav,sizes,blockedExternal,interceptedAPIs:apiRequests,realAPIRequests:0,errors});await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({synthetic:true,methods:{cssZoom:'CSS zoom stress; not native browser zoom',responsive200:'Half CSS viewport with device scale2; not native browser zoom',devices:'Desktop Chromium emulation; no physical-device certification'},results},null,2));
  console.log('PASS actual compiled Diárias: themes, scopes, >40 rows, owner period changes, large money glyph bounds, contrast, navigation clearance');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
