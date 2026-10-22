/** Actual prepared Radar/Follow/ManualGateEditor/BottomNav, synthetic offline data only.
 * --fixture-policy-only and --bundle-only never resolve or launch Playwright.
 * Browser execution belongs to the existing GitHub Actions runner, not local sandboxes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {build} from 'esbuild';

const legacyFont='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
const expectedLogo='https://images.kiwi.com/airlines/64/ZZ.png';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function stylesheetLinks(html){
  const links=[],hrefs=[],excluded=[];
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
    const attr=name=>new RegExp(`\\b${name}=["']([^"']+)["']`,'i').exec(tag)?.[1];
    if(attr('rel')?.toLowerCase()!=='stylesheet')continue;
    const href=attr('href');assert(href,'Stylesheet href required');
    const url=new URL(href,'https://fixture.invalid');
    if(url.origin!=='https://fixture.invalid'){
      assert.equal(href,legacyFont,'Unexpected external production stylesheet');
      excluded.push({url:href,reason:'Existing font link excluded before browsing; production CSS unchanged, local fallback font'});continue;
    }
    assert(/^\/assets\/[^/]+\.css$/.test(url.pathname)&&!url.search&&!url.hash,'Only exact built stylesheet paths');
    links.push(tag);hrefs.push(url.pathname);
  }
  assert(links.length,'Actual shipping CSS required');
  return {html:links.join('\n'),hrefs,excluded};
}
function requestPolicy(input,origin,paths){
  const u=new URL(input.url);
  if(u.origin!==origin)return {allow:false,baseline:u.href===expectedLogo&&input.type==='image'&&input.method==='GET',reason:'external network forbidden'};
  if(input.method!=='GET'||input.body)return {allow:false,baseline:false,reason:'fixture is read-only'};
  if(u.hash||u.pathname.startsWith('/api/')||u.pathname.includes('..'))return {allow:false,baseline:false,reason:'no API or dynamic endpoint'};
  return {allow:paths.has(u.pathname+u.search),baseline:false,reason:'exact static path only'};
}
if(process.argv.includes('--fixture-policy-only')){
  const origin='http://127.0.0.1:1234',paths=new Set(['/','/fixture.js','/assets/app.css','/icons/brand.png?v=1']);
  const test=(url,extra={})=>requestPolicy({url,type:'fetch',method:'GET',body:null,...extra},origin,paths);
  assert(test(origin+'/').allow);assert(test(origin+'/icons/brand.png?v=1').allow);
  for(const url of [origin+'/api/radar-flight',origin+'/fixture.js?upload=1',origin+'/icons/brand.png?v=2','https://example.invalid/','data:text/html,x'])assert.equal(test(url).allow,false);
  assert.equal(test(origin+'/fixture.js',{method:'POST',body:'private'}).allow,false);
  assert.equal(test(expectedLogo,{type:'image'}).baseline,true);assert.equal(test(expectedLogo).baseline,false);
  assert.throws(()=>stylesheetLinks('<link rel="stylesheet" href="https://example.invalid/style.css">'));
  assert.equal(stylesheetLinks('<link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="'+legacyFont+'">').excluded.length,1);
  console.log('PASS Radar fixture policy: exact local GET assets; API, payload, unknown query and external requests rejected');
  process.exit(0);
}

const root=process.cwd(),output=path.resolve(process.env.RADAR_LAYOUT_ARTIFACTS||'artifacts/radar-mobile-layout');
fs.mkdirSync(output,{recursive:true});
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const required=['Brand','BottomNav','safe','normalizedAirlineCode','airlineNameFor','airlineLogoUrl','AirlineLogo','validatedRadarForEvent','radarGateInfo','radarFlightDateLabel','radarSnapshotKey','radarEventOperationalDate','radarSnapshotMatchesEvent','readRadarSnapshot','FollowFlightPanel','followCandidate','RadarView'];
const declarations=required.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,`Missing ${name}; run canonical preparation first`);return node.getText(ast)});
const optional=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='CrewCheckMark');if(optional)declarations.push(optional.getText(ast));
const values=['AIRLINE_NAMES','DEFAULT_VERSION','RADAR_CARD_CACHE_TTL_MS'].map(name=>{const node=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert(node,name);return node.getText(ast)});
const lucide=ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='lucide-react').map(n=>n.getText(ast)).join('\n');assert(lucide);
const fixture=`
import React,{useState,useEffect,useRef,useMemo} from 'react';
import {createRoot} from 'react-dom/client';import {createPortal} from 'react-dom';
import {toast} from 'sonner';
${lucide}
import {getStoredUser,getToken} from '@/lib/authClient';
import {radarFailurePayload,radarAvailabilityLabel} from '@/lib/radarAvailability';
import {canonicalFlightId,RADAR_GATE_STALE_MS,manualGateAccountKey,readManualGate,resolveNextFlightGate,radarSnapshotStorageKey,flightOperationalDate} from '@/lib/nextFlightGate';
import {originalOperationalRadarSnapshot} from '@/lib/operationalRadarAdmission';
import {publishedGateDate,originFlightDate,gateQueryDay,radarResultDecision} from '@shared/gate-query-day.mjs';
import {followedFlight,followedFlightKey,readFollowedFlights,changeFollowedFlights} from '@shared/followedFlights.mjs';
import {ManualGateEditor} from '@/components/nextflight/ManualGateEditor';
import FlightDeckNavigationContext from '@/components/navigation/FlightDeckNavigationContext';
import {peekPendingNavigationContext,setPendingNavigationContext,clearPendingNavigationContext} from '@/lib/navigationContext';
import {InternalHeaderFrame} from '@/components/navigation/InternalHeaderFrame';
import {OperationalLayoutSafety} from '@/components/navigation/OperationalLayoutSafety';
import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';
import {alertText} from '@/lib/alertExperienceText';
import {setCrewCheckThemePreference} from '@/lib/themeRuntime';
import {initializeCrewTextSize,saveCrewTextSize} from '@/lib/textSizePreference';
const storage={get:(key,fallback)=>localStorage.getItem(key)||fallback,set:(key,value)=>localStorage.setItem(key,String(value))};
${values.join('\n')}
window.__radarCalls=[];
// Only this transport boundary is mocked. The actual renderer, source admission,
// manual-field resolver, follow persistence and stale-handler checks remain real.
const fetchRadarSnapshot=async(event,force)=>{window.__radarCalls.push({id:event.id,force});return radarFailurePayload({status:200,payload:{ok:false,queryReason:'provider-unavailable',querySuppressed:false}})};
${declarations.join('\n')}
const event={id:'synthetic-radar-current',kind:'flight',flightNumber:'ZZ123',airlineName:'Companhia sintética',origin:'BSB',destination:'GIG',departure:'12:00',arrival:'13:30',day:{date:'2030-10-21'},canonical:{date:'2030-10-21',startDateTime:'2030-10-21T15:00:00.000Z'}};
window.__radarFixtureEvent=event;window.__radarFixtureKey=radarSnapshotStorageKey(event);window.__radarFixtureTheme=setCrewCheckThemePreference;window.__radarFixtureText=saveCrewTextSize;window.__radarFixtureSetContext=setPendingNavigationContext;window.__radarFixtureContext=peekPendingNavigationContext;
function App(){const [view,setView]=useState('radar'),[revision,setRevision]=useState(0);useEffect(()=>initializeCrewTextSize(),[]);useEffect(()=>{const navigate=e=>setView(e.detail),refresh=()=>setRevision(n=>n+1);window.addEventListener('crewcheck:set-view',navigate);window.addEventListener('crewcheck:auth-changed',refresh);return()=>{window.removeEventListener('crewcheck:set-view',navigate);window.removeEventListener('crewcheck:auth-changed',refresh)}},[]);window.__radarFixtureNavigate=setView;window.__radarFixtureRefresh=()=>setRevision(n=>n+1);return <main className="cz-app" data-version={DEFAULT_VERSION} data-view={view}><OperationalLayoutSafety/><InternalHeaderFrame><Brand back/></InternalHeaderFrame>{view==='radar'?<RadarView key={revision} event={event}/>:<section className="cz-toolbox"><h1>Destino sintético: {view}</h1><button onClick={()=>setView('radar')}>Voltar ao Radar</button></section>}<BottomNav view={view} setView={setView} openMenu={()=>setView('settings')}/></main>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({stdin:{contents:fixture,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',platform:'browser',tsconfig:'tsconfig.json',outfile:path.join(output,'fixture.js'),loader:{'.css':'empty'},jsx:'automatic',define:{'process.env.NODE_ENV':'"test"','import.meta.env':JSON.stringify({DEV:false,PROD:true,BASE_URL:'/'})}});
fs.writeFileSync(path.join(output,'fixture-source.tsx'),fixture);
// esbuild permits unresolved value globals. Check the emitted JS as well so a
// canonical materializer cannot silently add a runtime dependency to this fixture.
const runtimeCheck=path.join(output,'fixture-runtime-check.js');
fs.writeFileSync(runtimeCheck,ts.transpileModule(fixture,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);
const configuration=ts.readConfigFile('tsconfig.json',ts.sys.readFile),compilerOptions=ts.parseJsonConfigFileContent(configuration.config,ts.sys,root).options;
const program=ts.createProgram([runtimeCheck],{...compilerOptions,allowJs:true,checkJs:true,noEmit:true});
const freeValues=ts.getPreEmitDiagnostics(program).filter(d=>d.code===2304&&d.file?.fileName===runtimeCheck).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '));
assert.deepEqual(freeValues,[],'Actual prepared renderer introduced unresolved fixture runtime globals');
const sourcePaths=['client/src/pages/Home.tsx','client/src/styles/radar-layout.css','scripts/follow-flight/apply.mjs','client/src/components/nextflight/ManualGateEditor.tsx','scripts/regression-radar-layout-browser.mjs'];
const evidence={syntheticOnly:true,transport:'mocked before network; unavailable response, not provider success',sourceHashes:Object.fromEntries(sourcePaths.map(p=>[p,sha(fs.readFileSync(p))]))};
try{evidence.checkedOutCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();evidence.checkedOutTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim()}catch{evidence.checkedOutCommit=null}
fs.writeFileSync(path.join(output,'source.json'),JSON.stringify(evidence,null,2));
if(process.argv.includes('--bundle-only')){console.log('PASS actual prepared Radar fixture bundles; no browser resolved or launched');process.exit(0)}

const dist=path.resolve('dist'),styles=stylesheetLinks(fs.readFileSync(path.join(dist,'index.html'),'utf8'));
evidence.stylesheets=styles.hrefs.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(dist,p)))}));evidence.excludedDocumentFonts=styles.excluded;
const allowed=new Set(['/','/fixture.js',...styles.hrefs]);
function addStaticUrl(value){
  const u=new URL(value,'https://fixture.invalid');
  if(u.origin==='https://fixture.invalid'&&!u.hash&&/^\/(?:assets|icons|fonts)\//.test(u.pathname)&&fs.existsSync(path.join(dist,u.pathname)))allowed.add(u.pathname+u.search);
}
for(const p of styles.hrefs){const css=fs.readFileSync(path.join(dist,p),'utf8');for(const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)){const v=m[1]??m[2]??m[3];if(v&&!v.startsWith('data:')&&!v.startsWith('#'))addStaticUrl(new URL(v,new URL(p,'https://fixture.invalid')).href)}}
for(const m of fixture.matchAll(/(?:src|href)=["']([^"']+)["']/g))addStaticUrl(m[1]);
fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles.html}</head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`);
const served=[];
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),p=u.pathname;const base=p==='/'||p==='/fixture.js'?output:dist,file=path.resolve(base,'.'+(p==='/'?'/index.html':p));if(req.method!=='GET'||!allowed.has(p+u.search)||!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.writeHead(403).end();return}served.push({path:p+u.search,method:req.method});res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.svg')?'image/svg+xml':'text/html');res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const require=createRequire(process.env.RADAR_PLAYWRIGHT_PACKAGE||import.meta.url);
let browser;const results=[],network=[];let activePage;
const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
try{
  browser=await require('playwright').chromium.launch({headless:true});
  const scenarios=[...([320,390,430,1440].flatMap(width=>['light','dark'].map(theme=>({width,theme,text:100})))),...([320,390].flatMap(width=>['light','dark'].map(theme=>({width,theme,text:200}))))];
  for(const s of scenarios){
    const name=`${s.width}-${s.theme}-${s.text}`,ctx=await browser.newContext({viewport:{width:s.width,height:844},deviceScaleFactor:1,serviceWorkers:'block',timezoneId:'UTC',colorScheme:s.theme,reducedMotion:'reduce'});
    const denied=[],errors=[];
    await ctx.route('**/*',async route=>{const req=route.request(),entry={scenario:name,url:req.url(),method:req.method(),type:req.resourceType(),body:req.postData()};const policy=requestPolicy(entry,origin,allowed);network.push({...entry,body:entry.body?'[rejected payload]':null,...policy});if(!policy.allow){if(!policy.baseline)denied.push(entry.url);return route.abort()}return route.continue()});
    await ctx.addInitScript(({theme,text})=>{if(!localStorage.getItem('radar-fixture-initialized')){localStorage.setItem('radar-fixture-initialized','1');localStorage.setItem('crewcheck_auth_token','synthetic-radar-token-a');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-radar-a',name:'Synthetic QA',email:'synthetic@example.invalid'}));localStorage.setItem('crewcheck_followed_flights:v1:synthetic-radar-a',JSON.stringify([{eventId:'synthetic-followed-existing',flight:'ZZ98765A',origin:'SSA',destination:'GRU',scheduledDepartureUtc:'2030-10-21T13:00:00.000Z',date:'2030-10-21'}]));localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);localStorage.setItem('crewcheck:text-size:v1:synthetic-radar-a',String(text))}},s);
    const page=await ctx.newPage();activePage=page;page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2030-10-21T12:00:00Z'));await page.goto(origin);await page.locator('.cc-followed-add').waitFor();await page.locator('.cc-manual-gate').waitFor();await page.waitForFunction(()=>document.querySelector('.cz-radar-screen')?.textContent.includes('Nenhuma fonte confirmou'));await page.waitForLoadState('networkidle');
    const panel=page.locator('[data-followed-flights]');assert.match(await panel.innerText(),/Sem dados operacionais válidos no cache/);
    const addTarget=await page.locator('.cc-followed-add').evaluate(e=>{const r=e.getBoundingClientRect(),style=getComputedStyle(e);return {width:r.width,height:r.height,border:parseFloat(style.borderTopWidth)}});assert(addTarget.width>=43.9&&addTarget.height>=43.9,`${name}: follow target below 44px`);assert(addTarget.border<=1.5,`${name}: excessive follow-selection border`);
    const refresh=page.getByRole('button',{name:'Atualizar Radar e card',exact:true});
    const beforeRefresh=await page.evaluate(()=>window.__radarCalls.length);await refresh.click();await refresh.click();
    assert.equal(await page.evaluate(()=>window.__radarCalls.length),beforeRefresh+2,'repeated refresh uses the unchanged mock transport boundary');assert.equal(await page.evaluate(()=>window.__radarCalls.slice(-2).every(call=>call.force===true)),true);
    const calls=await page.evaluate(()=>window.__radarCalls.length);await page.locator('.cc-followed-add').click();assert.equal(await page.locator('.cc-followed-row').count(),2);assert.equal(await page.evaluate(()=>window.__radarCalls.length),calls,'following does not query Radar');
    const layout=await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      const rows=[...document.querySelectorAll('.cc-followed-row')].map(row=>({row:rect(row),identity:rect(row.querySelector('.cc-followed-identity>strong')),date:rect(row.querySelector('.cc-followed-date')),dateFontSize:parseFloat(getComputedStyle(row.querySelector('.cc-followed-date')).fontSize),metadata:rect(row.querySelector('.cc-followed-meta small')),stop:rect(row.querySelector('.cc-followed-stop'))}));
      const targets=[...document.querySelectorAll('.cz-radar-screen summary,.cc-radar-actions button,.cc-followed-list button,.cc-followed-list summary,.cc-manual-gate input,.cc-manual-gate button,.cz-bottom-nav button')].map(e=>({label:e.getAttribute('aria-label')||e.textContent||e.getAttribute('id'),...rect(e)}));
      const textSelectors=['.cz-panel-head h1','.cz-panel-head p','.cz-radar-screen h2','.cz-radar-screen p','.cz-radar-screen strong','.cz-radar-screen span','.cc-radar-sources summary','.cc-radar-actions button','.cc-followed-list h2','.cc-followed-identity strong','.cc-followed-date','.cc-followed-row p','.cc-followed-meta small','.cc-followed-stop','.cc-followed-list summary','.cc-manual-gate h2','.cc-manual-gate>p','.cc-manual-gate label','.cc-manual-gate input','.cc-manual-gate button'];
      const textSizes=Object.fromEntries(textSelectors.map(selector=>[selector,parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)]));
      return {scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,rows,targets,textSizes,actions:[...document.querySelectorAll('.cc-radar-actions button')].map(e=>e.textContent.trim()),textScale:getComputedStyle(document.documentElement).getPropertyValue('--cc-text-scale')};
    });
    assert(layout.scrollWidth<=layout.viewport+1,`${name}: horizontal document overflow`);assert.equal(Number(layout.textScale),s.text/100);
    const normal=results.find(result=>result.scenario===`${s.width}-${s.theme}-100`);
    for(const row of layout.rows){assert(row.dateFontSize>=13.9,`${name}: date below readable baseline`);if(s.text===200)assert(row.dateFontSize>=normal.layout.rows[0].dateFontSize*2-.1,`${name}: time element must respect 200% reading preference`)}
    if(s.text===200)for(const [selector,size] of Object.entries(layout.textSizes))assert(size>=normal.layout.textSizes[selector]*2-.1,`${name}: ${selector} did not respect 200% text (${normal.layout.textSizes[selector]} -> ${size})`);
    assert.deepEqual(layout.actions,['Atualizar','Consultar','Meteo']);
    for(const row of layout.rows){assert(!intersects(row.identity,row.date),`${name}: route/date collide`);assert(!intersects(row.metadata,row.stop),`${name}: cache/Parar collide`);assert(row.date.top>=row.identity.bottom+2||row.date.left>=row.identity.right+6,`${name}: route/date need visible separation`);for(const box of [row.identity,row.date,row.metadata,row.stop])assert(box.left>=row.row.left-1&&box.right<=row.row.right+1,`${name}: followed content outside card`)}
    for(const target of layout.targets)assert(target.width>=43.9&&target.height>=43.9,`${name}: target below 44px ${target.label}: ${target.width}x${target.height}`);
    for(const selector of ['.cc-radar-sources summary','.cc-followed-list summary']){
      const summary=page.locator(selector);await summary.focus();await page.keyboard.press('Space');assert.equal(await summary.evaluate(e=>e.parentElement.open),true);
      const focus=await summary.evaluate(e=>({active:document.activeElement===e,style:getComputedStyle(e).outlineStyle,width:parseFloat(getComputedStyle(e).outlineWidth)}));assert(focus.active&&focus.style!=='none'&&focus.width>=2,`${name}: visible keyboard focus required`);
      await page.keyboard.press('Space');assert.equal(await summary.evaluate(e=>e.parentElement.open),false);
    }
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`${name}-radar.png`),fullPage:true});
    const last=page.locator('.cc-manual-gate form').last().locator('button[type=submit]');await last.focus();await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const clearance=await page.evaluate(()=>{const b=document.querySelector('.cc-manual-gate form:last-of-type button[type=submit]').getBoundingClientRect(),n=document.querySelector('.cz-bottom-nav').getBoundingClientRect();return {buttonTop:b.top,buttonBottom:b.bottom,navTop:n.top,navBottom:n.bottom,viewport:innerHeight}});
    assert(clearance.buttonTop>=0&&clearance.buttonBottom<=clearance.navTop-7,`${name}: last manual action obscured by footer ${JSON.stringify(clearance)}`);
    await page.screenshot({path:path.join(output,`${name}-manual-footer.png`)});
    await page.reload();await page.locator('.cc-followed-row').first().waitFor();assert.equal(await page.locator('.cc-followed-row').count(),2,'following survives reload');
    // An old button cannot write under a different account or token.
    const aKey='crewcheck_followed_flights:v1:synthetic-radar-a',bKey='crewcheck_followed_flights:v1:synthetic-radar-b';
    const before=await page.evaluate(key=>localStorage.getItem(key),aKey);
    await page.evaluate(()=>{const stop=document.querySelector('.cc-followed-stop');localStorage.setItem('crewcheck_auth_token','synthetic-radar-token-b');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-radar-b',name:'Other synthetic'}));stop.click()});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),aKey),before,'stale handler must preserve A');assert.equal(await page.evaluate(key=>localStorage.getItem(key),bKey),null,'stale handler must not write B');
    await page.reload();await page.locator('.cc-followed-add').waitFor();assert.equal(await page.locator('.cc-followed-row').count(),0,'B cannot see A followed rows');
    await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','synthetic-radar-token-a');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-radar-a',name:'Synthetic QA'}))});await page.reload();await page.locator('.cc-followed-row').first().waitFor();
    const stop=page.getByRole('button',{name:'Parar acompanhamento de ZZ123 BSB para GIG',exact:true});await stop.click();await page.locator('.cc-followed-add').waitFor();assert.equal(await page.locator('.cc-followed-row').count(),1);await page.reload();await page.locator('.cc-followed-add').waitFor();assert.equal(await page.locator('.cc-followed-row').count(),1,'stopped candidate stays stopped after reload');
    // Same missing operational evidence must remain visibly missing after manual editing.
    await page.getByLabel('Status informado por você',{exact:true}).fill('Aguardando confirmação sintética');assert.match(await panel.innerText(),/Status sem dados/);assert.equal(await page.getByText('Fonte operacional com evidência válida',{exact:true}).count(),0);
    await page.evaluate(()=>window.__radarFixtureSetContext({sourceView:'cockpit',targetView:'radar',dateEpochMs:Date.parse(window.__radarFixtureEvent.canonical.startDateTime),programId:window.__radarFixtureEvent.id,flightKey:'ZZ123',airportCode:'BSB',returnView:'cockpit',returnLabel:'Voltar ao FlightDeck',policy:'persistent-until-return'}));
    await page.getByRole('button',{name:'Meteorologia',exact:true}).click();await page.getByRole('heading',{name:'Destino sintético: weather'}).waitFor();
    const handoff=await page.evaluate(()=>window.__radarFixtureContext('weather'));assert.equal(handoff?.programId,'synthetic-radar-current');assert.equal(handoff?.returnView,'cockpit');
    await page.getByRole('button',{name:'Voltar ao Radar',exact:true}).click();await page.locator('.cc-followed-add').waitFor();assert.equal(await page.getByLabel('Status informado por você',{exact:true}).inputValue(),'','unsaved draft does not leak after navigation');
    assert.deepEqual(errors,[],`${name}: browser errors`);assert.deepEqual(denied,[],`${name}: unexpected request attempted`);
    results.push({scenario:name,layout,clearance,addTarget,checks:['no overflow','route/date separation','cache/stop separation','44px targets including footer','subtle follow border','short actions','keyboard disclosure/focus','footer clearance','repeated refresh','follow/reload/stop','stale account/session fence','manual no-data honesty','canonical weather context handoff','navigation clears unsaved draft']});
    await ctx.close();activePage=null;console.log(`PASS Radar ${name}: layout, keyboard, 44px targets, footer, follow persistence and account fence`);
  }
}catch(error){if(activePage)await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error}
finally{fs.writeFileSync(path.join(output,'source.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(output,'network-audit.json'),JSON.stringify({requests:network,served},null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
console.log(`PASS ${results.length} actual prepared Radar scenarios; synthetic data, mocked unavailable provider boundary, zero external network sent`);
