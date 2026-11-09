import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const {captureRosterGeometry}=createRequire(import.meta.url)('./lib/roster-geometry-diagnostics.cjs');

// Full prepared app, built-in fictional demo, fixture APIs; no real account/API.
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/fixture-peer.html') return res.end('<title>Storage fixture</title>');
  const file = path.resolve(dist, '.' + (pathname === '/app' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const results = [];

// Fixture positioning is separate from the arrow gate: one instant request,
// exact destination and unchanged geometry, bounded by Node's real clock.
// It neither reads nor waits for the arrow, and never scrolls a second time.
async function prepareRosterScroll(page, target) {
  let timer;
  const operation = async () => {
    const initial = await page.evaluate(target => {
      const root = document.scrollingElement;
      return { max: root.scrollHeight - root.clientHeight, motion: matchMedia('(prefers-reduced-motion: reduce)').matches, behavior: getComputedStyle(root).scrollBehavior, target };
    }, target);
    assert.equal(initial.motion, true, 'reduced-motion preparation must be applied');
    assert.equal(initial.behavior, 'auto', 'effective reduced-motion scroll style must be applied');
    assert.ok(initial.max >= target, 'fixture cannot reach requested scroll destination '+JSON.stringify(initial));
    await page.evaluate(target => scrollTo({ left: 0, top: target, behavior: 'instant' }), target);
    const read = () => page.evaluate(() => {
      const root = document.scrollingElement, header = document.querySelector('.cz-app > .cz-global-header'), host = header?.closest('.cz-app');
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.width, r.height]; };
      return { x: scrollX, y: scrollY, rootTop: root.scrollTop, max: root.scrollHeight-root.clientHeight, doc: root.scrollHeight, host: host?.getBoundingClientRect().height,
        anchors: [header, document.querySelector('.cc-roster-options-trigger'), document.querySelector('[data-roster-iso]')].map(box),
        ancestors: header ? [...function*(el) { while(el) { yield el; el=el.parentElement; } }(header.parentElement)].map(el=>[el.tagName,el.scrollLeft,el.scrollTop,el.scrollHeight,el.clientHeight]) : [] };
    });
    const baseline = await read();
    assert.equal(baseline.x, 0, 'fixture horizontal scroll is zero');
    assert.equal(baseline.y, target, 'single preparation request must reach its destination');
    assert.equal(baseline.rootTop, target, 'document is the actual fixture scroller');
    for (let sample=0; sample<4; sample+=1) {
      await new Promise(resolve=>setTimeout(resolve,25));
      assert.deepEqual(await read(),baseline,'fixture scroll/layout changed during preparation');
    }
    return baseline;
  };
  try { return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Roster scroll preparation exceeded 2000ms')),2000);})]); }
  finally { clearTimeout(timer); }
}

// Measurement starts AFTER preparation. No scrolling or settling is allowed
// here: even a 1px excursion that returns to the baseline is a gate failure.
function beginRosterArrowWindow() {
  const root=document.scrollingElement,header=document.querySelector('.cz-app > .cz-global-header'),host=header.closest('.cz-app');
  const anchors=[...host.children].filter(el=>!el.classList.contains('cc-back-to-top'));
  const box=el=>{const r=el.getBoundingClientRect();return [r.left+scrollX,r.top+scrollY,r.width,r.height];};
  const read=()=>({scroll:[scrollX,scrollY,root.scrollTop],extent:[root.scrollHeight,host.getBoundingClientRect().height,host.scrollHeight],anchors:anchors.map(box),
    ancestors:[...function*(el){while(el){yield el;el=el.parentElement;}}(header.parentElement)].map(el=>[el.tagName,el.scrollLeft,el.scrollTop,el.scrollHeight,el.clientHeight])});
  const baseline=read();let violation=null,samples=0,frames=0,frame=0,active=true;
  const check=()=>{samples+=1;const current=read();if(JSON.stringify(current)!==JSON.stringify(baseline)&&!violation)violation={baseline,current};};
  const tick=()=>{if(!active)return;frames+=1;check();frame=requestAnimationFrame(tick);};
  document.addEventListener('scroll',check,true);frame=requestAnimationFrame(tick);
  window.__rosterArrowWindow={read:()=>({baseline,current:read(),violation,samples,frames}),finish:()=>{check();active=false;cancelAnimationFrame(frame);document.removeEventListener('scroll',check,true);return {violation,samples,frames};}};
}
// Real browser, synthetic documents: these counterproofs run in the same engine
// as the app gate, not in a mock scroll implementation used to claim success.
async function verifyRosterScrollPreparation(browser) {
  const fixture = async (short=false,reduce=true) => {
    const page=await browser.newPage({viewport:{width:320,height:640}});
    await page.clock.install({time:new Date('2034-01-14T15:00:00Z')});
    await page.setContent(`<!doctype html><style>html{scroll-behavior:smooth}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style><main class="cz-app"><header class="cz-global-header"><button class="cc-roster-options-trigger">SYNTHETIC</button></header><article data-roster-iso="2034-01-15" style="height:${short?100:5000}px">SYNTHETIC</article></main>`);
    assert.equal(await page.evaluate(()=>document.compatMode),'CSS1Compat','preparation counterproof uses the app standards-mode document');
    await page.emulateMedia({reducedMotion:reduce?'reduce':'no-preference'});
    await page.evaluate(()=>{window.__preparationRequests=0;const original=scrollTo;window.scrollTo=function(...args){window.__preparationRequests+=1;return original.apply(this,args);};});
    return page;
  };
  let page=await fixture(false,false);
  try {
    await page.evaluate(()=>scrollTo({top:600,behavior:'instant'}));
    const old=await page.evaluate(()=>{scrollTo(0,0);return {y:scrollY,behavior:getComputedStyle(document.scrollingElement).scrollBehavior};});
    assert.equal(old.behavior,'smooth');assert.notEqual(old.y,0,'old smooth positioning returns before its destination');
    await page.emulateMedia({reducedMotion:'reduce'});
    await prepareRosterScroll(page,0);await prepareRosterScroll(page,80);await prepareRosterScroll(page,0);await prepareRosterScroll(page,80);
    assert.equal(await page.evaluate(()=>window.__preparationRequests),6,'four preparations issue exactly four requests on first/repeated iterations');
  } finally { await page.close(); }
  page=await fixture(true);
  try { await assert.rejects(()=>prepareRosterScroll(page,80),/fixture cannot reach/);assert.equal(await page.evaluate(()=>window.__preparationRequests),0); }
  finally { await page.close(); }
  page=await fixture();
  try {
    await page.evaluate(()=>{window.scrollTo=()=>{window.__preparationRequests+=1;};});
    await assert.rejects(()=>prepareRosterScroll(page,80),/single preparation request must reach/);
    assert.equal(await page.evaluate(()=>window.__preparationRequests),1,'unreachable destination is not retried');
  } finally { await page.close(); }
  page=await fixture();
  try {
    let drifted=false;
    const externalDrift={evaluate:async(fn,arg)=>{const value=await page.evaluate(fn,arg);if(value?.anchors&&!drifted){drifted=true;await page.evaluate(()=>scrollTo({top:81,behavior:'instant'}));}return value;}};
    await assert.rejects(()=>prepareRosterScroll(externalDrift,80),/changed during preparation/);
    assert.equal(await page.evaluate(()=>window.__preparationRequests),2,'one request plus injected external drift, no preparation retry');
  } finally { await page.close(); }
  page=await fixture();
  try {
    await prepareRosterScroll(page,80);await page.evaluate(beginRosterArrowWindow);
    await page.evaluate(()=>scrollTo({top:81,behavior:'instant'}));await new Promise(resolve=>setTimeout(resolve,50));
    await page.evaluate(()=>scrollTo({top:80,behavior:'instant'}));await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(await page.evaluate(()=>scrollY),80);
    const moved=await page.evaluate(()=>window.__rosterArrowWindow.finish());assert.ok(moved.violation,'strict window rejects movement even after return');
    await page.evaluate(beginRosterArrowWindow);await page.evaluate(()=>document.querySelector('.cz-app').style.paddingTop='1px');await new Promise(resolve=>setTimeout(resolve,50));
    await page.evaluate(()=>document.querySelector('.cz-app').style.paddingTop='');await new Promise(resolve=>setTimeout(resolve,50));
    const changed=await page.evaluate(()=>window.__rosterArrowWindow.finish());assert.ok(changed.violation,'strict window rejects layout changes even after restoration');
  } finally { await page.close(); }
  results.push('scroll preparation counterproofs: insufficient extent, unreachable target, 1px drift and strict movement/layout rejection; no repeated positioning');
}

try {
  await verifyRosterScrollPreparation(browser);
  const context = await browser.newContext({ serviceWorkers: 'block', locale: 'pt-BR' });
  let maintenanceRequests = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/maintenance/status') maintenanceRequests++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, enabled: false, items: [], notices: [], data: [], user: null }) });
    }
    return route.continue();
  });
  const page = await context.newPage();
  // The demo roster starts tomorrow and spans five days in the month of its first
  // day; near month end its last day leaves the AIMS view. Pin a mid-month instant.
  await page.clock.install({ time: new Date('2034-01-14T12:00:00-03:00') });
  await page.addInitScript(() => {
    localStorage.setItem('crewcheck_demo_mode_seen', '1');
    localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
    sessionStorage.setItem('crewcheck_demo_active', '1');
    sessionStorage.setItem('crewcheck_initial_view', 'roster');
  });
  await page.goto(origin + '/app');
  if(process.env.ROSTER_FALLBACK_FONT){assert.equal(process.env.ROSTER_FALLBACK_FONT,'DejaVu Sans');await page.addStyleTag({content:'html body #root .cz-app[data-version] .cc-roster-flight-grid-v1397 small{font-family:"DejaVu Sans"!important}'});}
  // Direct controls retain the existing guest/account preference contract.
  const viewReady=async()=>{if(!await page.locator('.cc-roster-options-dialog').evaluate(d=>d.open))await page.getByRole('button',{name:'Exibir opções da escala',exact:true}).click();await page.locator('section.cc-roster-view-options').waitFor();};
  const pick=async value=>{await viewReady();await page.locator(`[data-roster-layout-choice="${value}"]`).click();};
  await viewReady();
  const peer = await context.newPage();
  await peer.goto(origin + '/fixture-peer.html');
  const sync = async () => { await page.waitForTimeout(100); };
  const expectLayout = async (expected, label) => {
    await page.waitForFunction(expected => document.querySelector(`[data-roster-layout-choice="${expected}"]`)?.getAttribute('aria-pressed') === 'true',expected);
    await viewReady();
    assert.equal(await page.locator(`[data-roster-layout-choice="${expected}"]`).getAttribute('aria-pressed'), 'true', label);
    results.push(label);
  };
  for (const layout of ['aims', 'calendar']) {
    await viewReady();
    await pick(layout);
    if (layout === 'aims') {
      // The single AIMS mode uses the document overview.
      const activities = page.locator('.cc-doc-token button');
      await activities.nth(8).waitFor();
      assert.equal(await activities.count(), 9, 'real demo AIMS activities');
    }
    await page.clock.fastForward(1500);
    await peer.evaluate(() => localStorage.setItem('fixture:unrelated-refresh', String(Date.now())));
    await expectLayout(layout, `guest ${layout}: unrelated cross-tab storage preserves selection`);
    const before = maintenanceRequests;
    await page.clock.fastForward(65_000);
    await expectLayout(layout, `guest ${layout}: retained across minute timers`);
    assert(maintenanceRequests > before, 'maintenance minute interval exercised');
    assert.match(await page.locator('.cc-roster-layout-status').innerText(), /nesta sessão/);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('crewcheck:roster-layout:')).length), 0, 'guest never persisted as an account');
    await viewReady();
    await page.getByRole('button', { name: 'Restaurar padrão', exact: true }).click();
    await expectLayout('cards', `guest ${layout}: explicit reset`);
  }
  const owner = async id => {
    await peer.evaluate(id => id ? localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id, name: id, email: `${id}@example.invalid` })) : localStorage.removeItem('crewcheck_auth_user'), id);
    await sync();
  };
  await owner('fixture-A');
  await expectLayout('cards', 'account A starts isolated');
  await viewReady();
  await pick('aims');
  await owner('fixture-B');
  await expectLayout('cards', 'account B does not inherit A');
  await viewReady();
  await pick('calendar');
  await page.clock.fastForward(65_000);
  await expectLayout('calendar', 'account B survives minute timers');
  await owner('fixture-A');
  await expectLayout('aims', 'account A restored');
  await peer.evaluate(() => localStorage.setItem('crewcheck:roster-layout:v1:fixture-A', JSON.stringify({ version: 1, layout: 'list', zoom: 'month' })));
  await expectLayout('list', 'same account preference sync');
  await peer.evaluate(() => localStorage.removeItem('crewcheck:roster-layout:v1:fixture-A'));
  await expectLayout('cards', 'same account storage reset');
  await owner('fixture-B');
  await expectLayout('calendar', 'account B preference untouched');
  await owner(null);
  await expectLayout('cards', 'logout does not inherit account B');
  await viewReady();
  await pick('calendar');
  await peer.evaluate(() => localStorage.clear());
  await expectLayout('cards', 'storage clear resets visitor');
  const clockLabelFonts=new Map();
  const screenshots=path.resolve(process.env.ROSTER_SESSION_EVIDENCE||'artifacts/roster-layout-session');fs.mkdirSync(screenshots,{recursive:true});
  for(const width of [320,390,1440])for(const height of [640,900])for(const theme of ['light','dark'])for(const scale of [1,2]){
    await page.setViewportSize({width,height});
    await page.evaluate(({theme,scale})=>{localStorage.setItem('crewcheck_theme_mode',theme);window.dispatchEvent(new StorageEvent('storage',{key:'crewcheck_theme_mode'}));document.documentElement.dataset.crewTextSize=String(scale*100);document.documentElement.style.setProperty('--cc-text-scale',String(scale));},{theme,scale});
    await page.waitForFunction(theme=>document.documentElement.dataset.crewTheme===theme&&document.documentElement.dataset.crewcheckTheme===theme,theme);
    const appearance=await page.getByRole('button',{name:'Exibir opções da escala',exact:true}).evaluate(e=>({effective:document.documentElement.dataset.crewTheme,legacy:document.documentElement.dataset.crewcheckTheme,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
    assert.equal(appearance.effective,theme,'real theme runtime must apply requested appearance');assert.equal(appearance.legacy,theme,'theme aliases must agree before accepting visual evidence');
    const luminance=color=>{const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return channels.reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);};
    const ink=luminance(appearance.color),surface=luminance(appearance.background),contrast=(Math.max(ink,surface)+.05)/(Math.min(ink,surface)+.05);assert.ok(contrast>=4.5,JSON.stringify({theme,scale,width,appearance,contrast}));

    const countAppearance=await page.locator('.cc-roster-period-count').evaluate(e=>{const st=getComputedStyle(e),panel=getComputedStyle(e.parentElement),base=getComputedStyle(document.querySelector('main.cz-app'));return {color:st.color,opacity:Number(st.opacity),panel:panel.backgroundColor,gradient:panel.backgroundImage,base:base.backgroundColor};});
    const channels=color=>color.match(/[\d.]+/g).map(Number);
    const blend=(foreground,background,opacity=1)=>{const a=channels(foreground),b=channels(background),alpha=(a[3]??1)*opacity;return `rgb(${a.slice(0,3).map((v,i)=>v*alpha+b[i]*(1-alpha)).join(',')})`;};
    const stops=[...countAppearance.gradient.matchAll(/rgba?\([^)]*\)/g)].map(m=>m[0]);assert.equal(stops.length,2,'review the period surface if its two-stop gradient changes');
    const countSurfaces=stops.map(stop=>blend(stop,blend(countAppearance.panel,countAppearance.base)));
    const countContrast=Math.min(...countSurfaces.map(bg=>{const fg=blend(countAppearance.color,bg,countAppearance.opacity),a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));assert.ok(countContrast>=4.5,JSON.stringify({theme,scale,width,countAppearance,countContrast}));
    const monthCaption=await page.locator('.cc-roster-period-v1399>label>span').evaluate(e=>({color:getComputedStyle(e).color,opacity:Number(getComputedStyle(e).opacity)}));
    const captionContrast=Math.min(...countSurfaces.map(bg=>{const fg=blend(monthCaption.color,bg,monthCaption.opacity),a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));assert.ok(captionContrast>=4.5,JSON.stringify({theme,scale,width,monthCaption,captionContrast}));
    const monthSelect=await page.locator('.cc-roster-period-v1399 select').evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),c=document.createElement('canvas').getContext('2d');c.font=s.font;const text=e.selectedOptions[0].textContent,paint=s.textTransform==='capitalize'?text.replace(/\b\p{L}/gu,x=>x.toUpperCase()):text;return {text,font:parseFloat(s.fontSize),fontFamily:s.fontFamily,fontShorthand:s.font,selectedTextWidth:c.measureText(paint).width,height:r.height,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,width:r.width,available:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-20,textWidth:c.measureText(paint).width};});
    if(!/janeiro.*2034/i.test(monthSelect.text)||!(monthSelect.clientHeight>=monthSelect.scrollHeight&&monthSelect.textWidth<=monthSelect.available+1))await captureRosterGeometry({page,browser,selector:'.cc-roster-period-v1399 select',file:path.join(screenshots,`${width}-${height}-${theme}-${scale}-failure-geometry.json`),caseInfo:{width,height,theme,scale,monthSelect}}).catch(error=>console.error('ROSTER_GEOMETRY_DIAGNOSTIC_FAILED '+error.message));assert.match(monthSelect.text,/janeiro.*2034/i);assert.ok(monthSelect.clientHeight>=monthSelect.scrollHeight&&monthSelect.textWidth<=monthSelect.available+1,JSON.stringify({width,height,theme,scale,engine:browser.version(),monthSelect}));
    assert.equal(await page.locator('.cc-roster-premium-v1397 .cc139-head h1').innerText(),'Escala');
    if(width===320&&height===640&&theme==='light'&&scale===1)await captureRosterGeometry({page,browser,selector:'.cc-roster-premium-v1397 .cc139-head h1',file:path.join(screenshots,'rendered-font-evidence.json'),caseInfo:{candidate:'back-to-top',width,height,theme,scale}});
    const title=await page.locator('.cc-roster-premium-v1397 .cc139-head h1').evaluate(h=>({left:h.getBoundingClientRect().left,right:h.getBoundingClientRect().right,overflow:h.scrollWidth-h.clientWidth,color:getComputedStyle(h).color}));assert.ok(title.left>=0&&title.right<=width&&title.overflow<=1,JSON.stringify({width,height,theme,scale,title}));if(theme==='dark')assert.equal(title.color,'rgb(237, 244, 251)','dark heading keeps its reviewed high-contrast ink');
    await viewReady();const actions=page.locator('section.cc-roster-view-options');await actions.scrollIntoViewIfNeeded();
    const closeButton=page.getByRole('button',{name:'Fechar visualização',exact:true});const closeTarget=await closeButton.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,hits:[4,r.width/2,r.width-4].map(dx=>document.elementFromPoint(r.x+dx,r.y+r.height/2)?.closest('button')===e)};});
    assert.ok(closeTarget.width>=48&&closeTarget.height>=48&&closeTarget.hits.every(Boolean),JSON.stringify({width,height,theme,scale,closeTarget}));
    await page.mouse.click(closeTarget.x+4,closeTarget.y+closeTarget.height/2);assert.equal(await page.locator('.cc-roster-options-dialog').evaluate(d=>d.open),false,'close target works near its edge');await viewReady();await closeButton.focus();await page.keyboard.press('Escape');assert.equal(await page.locator('.cc-roster-options-dialog').evaluate(d=>d.open),false,'Escape closes the modal');await viewReady();
    const geometry=await actions.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),span=b.querySelector('span'),range=document.createRange();range.selectNodeContents(span);return {name:b.getAttribute('aria-label'),width:r.width,height:r.height,clipped:b.scrollWidth>b.clientWidth+1,labelLines:new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size,icon:Boolean(b.querySelector('svg'))};})}));
    assert.equal(geometry.overflow,false,JSON.stringify({width,theme,scale,...geometry}));assert.ok(geometry.buttons.length===7&&geometry.buttons.every(b=>b.width>=48&&b.height>=48&&!b.clipped&&b.labelLines===1&&b.icon&&b.name),JSON.stringify({width,theme,scale,...geometry}));
    await page.getByRole('button',{name:'Ver escala',exact:true}).click();await page.emulateMedia({reducedMotion:'reduce'});await prepareRosterScroll(page,0);
    const initial=await page.locator('[data-roster-iso]').first().boundingBox();assert.ok(initial,JSON.stringify({width,theme,scale,initial}));if(scale===1)assert.ok(initial.y<530,JSON.stringify({width,theme,scale,initial}));else results.push(`200% first content y=${initial.y}; small-height initial visibility remains a separate measured exception, not hidden text`);
    const firstTitle=await page.locator('.cc-roster-program-head-v1397').first().boundingBox(),nav=await page.locator('.cz-bottom-nav').boundingBox();assert.ok(firstTitle&&nav);if(scale===1)assert.ok(firstTitle.y>=0&&firstTitle.y+firstTitle.height<=nav.y,JSON.stringify({width,height,theme,scale,firstTitle,nav}));
    const cardReading=await page.locator('.cc-roster-program-head-v1397').first().evaluate(el=>{const h=el.querySelector('h3'),small=el.querySelector('small'),st=getComputedStyle(small),canvas=document.createElement('canvas').getContext('2d');canvas.font=st.font;const words=small.textContent.toUpperCase().split(/\s+/);return {titleColor:getComputedStyle(h).color,activityColor:st.color,activityWidth:small.getBoundingClientRect().width,widestWord:Math.max(...words.map(w=>canvas.measureText(w).width+Math.max(0,w.length-1)*(parseFloat(st.letterSpacing)||0))),icon:getComputedStyle(el.querySelector('.cc-roster-program-icon-v1397')).display};});if(theme==='dark'){assert.equal(cardReading.titleColor,'rgb(237, 244, 251)');assert.equal(cardReading.activityColor,'rgb(200, 214, 227)');}if(width<=600&&scale===2){assert.equal(cardReading.icon,'none','only the redundant decorative icon yields width at enlarged reading');assert.ok(cardReading.widestWord<=cardReading.activityWidth+1,JSON.stringify({width,height,theme,scale,cardReading}));}
    {const timeLabels=await page.locator('.cc-roster-flight-grid-v1397').first().evaluate(el=>[...el.querySelectorAll('small')].map(e=>{const st=getComputedStyle(e),c=document.createElement('canvas').getContext('2d');c.font=st.font;const text=st.textTransform==='uppercase'?e.textContent.toUpperCase():e.textContent;return {text,width:e.getBoundingClientRect().width,widest:Math.max(...text.split(/\s+/).map(w=>c.measureText(w).width+Math.max(0,w.length-1)*(parseFloat(st.letterSpacing)||0))),font:parseFloat(st.fontSize)};}));const key=`${width}:${height}:${theme}`;if(scale===1)clockLabelFonts.set(key,timeLabels.map(x=>x.font));else {const original=clockLabelFonts.get(key);assert.ok(original&&original.length===timeLabels.length);if(process.env.ROSTER_FALLBACK_FONT||!timeLabels.every(x=>x.widest<=x.width+1)){const report=await captureRosterGeometry({page,browser,selector:'.cc-roster-flight-grid-v1397 small',file:path.join(screenshots,`${width}-${height}-${theme}-${scale}-clock-font-evidence.json`),caseInfo:{width,height,theme,scale,timeLabels}});if(process.env.ROSTER_FALLBACK_FONT)assert.ok(report.platformFonts?.length&&report.platformFonts.every(fonts=>fonts.some(font=>/^DejaVu Sans/.test(font.familyName)&&font.glyphCount>0)),'requested installed fallback actually renders');}assert.ok(timeLabels.every((x,i)=>x.widest<=x.width+1&&x.font>=original[i]*2-.1),JSON.stringify({width,height,theme,scale,timeLabels,original}));}}
    await page.screenshot({path:path.join(screenshots,`${width}-${height}-${theme}-${scale}-full-app-fallback.png`),fullPage:false});
    const beforeArrow=await page.evaluate(()=>({doc:document.scrollingElement.scrollHeight,host:document.querySelector('.cz-app').getBoundingClientRect().height}));await prepareRosterScroll(page,80);await page.evaluate(beginRosterArrowWindow);const top=page.getByRole('button',{name:'Voltar ao topo',exact:true});await top.waitFor().catch(async error=>{
      // Preserve the original timeout; diagnostics do not retry or scroll again.
      let timer;try {const after=await Promise.race([page.evaluate(()=>{const read=(includeControls=false)=>{const root=document.scrollingElement,header=document.querySelector('.cz-app > .cz-global-header'),arrow=document.querySelector('.cc-back-to-top'),nav=document.querySelector('body > nav.cz-bottom-nav[aria-label="Navegação principal"]'),active=document.activeElement;return {now:performance.now(),visibility:document.visibilityState,focused:document.hasFocus(),scroll:[scrollX,scrollY],root:{top:root.scrollTop,height:root.scrollHeight,client:root.clientHeight,scrollBehavior:getComputedStyle(root).scrollBehavior,overflow:getComputedStyle(root).overflowY},viewport:{width:innerWidth,height:innerHeight,visualTop:visualViewport?.offsetTop,visualHeight:visualViewport?.height},editing:Boolean(active?.matches('input, textarea, select, [contenteditable="true"]')),active:active?.tagName+':'+(active?.getAttribute('aria-label')||active?.textContent?.trim().slice(0,80)),blocked:[...document.querySelectorAll('dialog[open], [aria-modal="true"], .cz-menu-overlay, .cz-busy, .cc-play-update-notice')].map(el=>el.tagName+'.'+el.className),header:header?.getBoundingClientRect().toJSON(),nav:nav?.getBoundingClientRect().toJSON(),arrow:arrow?{box:arrow.getBoundingClientRect().toJSON(),position:getComputedStyle(arrow).position,display:getComputedStyle(arrow).display,visibility:getComputedStyle(arrow).visibility,opacity:getComputedStyle(arrow).opacity,last:arrow===arrow.parentElement.lastElementChild}:null,controls:includeControls?[...document.querySelectorAll('button, a, input, select, textarea, summary, [role=button], label[for]')].filter(el=>el!==arrow).map(el=>({name:el.getAttribute('aria-label')||el.textContent?.trim().slice(0,80),box:el.getBoundingClientRect().toJSON(),visibility:getComputedStyle(el).visibility,pointer:getComputedStyle(el).pointerEvents})).filter(x=>x.box.width>0&&x.box.height>0&&x.box.top<innerHeight&&x.box.bottom>0&&x.box.right>innerWidth-64):undefined,ancestors:header?[...function*(el){while(el){yield el;el=el.parentElement}}(header)].map(el=>({tag:el.tagName,class:el.className,top:el.scrollTop,height:el.scrollHeight,client:el.clientHeight,overflow:getComputedStyle(el).overflowY})):[]};}; return {...read(true), strictWindow: window.__rosterArrowWindow?.read()};}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('diagnostic read timeout')),2000)})]);console.log('SYNTHETIC_ARROW_TRACE '+JSON.stringify({outcome:'timeout',engine:browser.version(),width,height,theme,scale,baselineExtent:beforeArrow,requestedScroll:80,after}));}catch(diagnostic){console.log('SYNTHETIC_ARROW_TRACE '+JSON.stringify({outcome:'timeout',diagnostic:String(diagnostic)}));}finally{clearTimeout(timer)}throw error;
    });assert.deepEqual(await page.evaluate(()=>({doc:document.scrollingElement.scrollHeight,host:document.querySelector('.cz-app').getBoundingClientRect().height})),beforeArrow,'floating arrow never changes document extent');await page.screenshot({path:path.join(screenshots,`${width}-${height}-${theme}-${scale}-arrow-80px.png`),fullPage:false});
    const topBox=await top.evaluate(b=>{const r=b.getBoundingClientRect(),nav=document.querySelector('.cz-bottom-nav').getBoundingClientRect();return {w:r.width,h:r.height,inside:r.top>=0&&r.bottom<=nav.top&&r.left>=0&&r.right<=innerWidth,pageEnd:b.parentElement.classList.contains('cz-app')&&b===b.parentElement.lastElementChild,position:getComputedStyle(b).position,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b,controlOverlaps:[...document.querySelectorAll('button,a,input,select,textarea,summary,[role=button]')].filter(e=>e!==b&&!b.contains(e)).filter(e=>{const x=e.getBoundingClientRect();return x.width>0&&x.height>0&&x.left<r.right&&x.right>r.left&&x.top<r.bottom&&x.bottom>r.top&&getComputedStyle(e).visibility!=='hidden'}).map(e=>e.getAttribute('aria-label')||e.textContent?.trim().slice(0,60))};});assert.ok(topBox.w>=48&&topBox.h>=48&&topBox.inside&&topBox.pageEnd&&topBox.position==='fixed'&&topBox.hit&&topBox.controlOverlaps.length===0,JSON.stringify({width,height,theme,scale,topBox}));const measured=await page.evaluate(()=>window.__rosterArrowWindow.finish());assert.equal(measured.violation,null,JSON.stringify({width,height,theme,scale,measured}));assert.ok(measured.frames>0,'strict arrow window observed actual frames');await top.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>scrollY===0);await top.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.cz-global-header .cz-brand-row button')),true,'activated arrow restores header focus');
    results.push(`theme ${theme}/${scale}: synchronized aliases; Exibir contrast=${contrast.toFixed(3)}:1; period summary >=${countContrast.toFixed(3)}:1; month caption >=${captionContrast.toFixed(3)}:1`);
    results.push(`full compiled app ${width}x${height}/${theme}/${scale}:direct48px actions and close hit-target, whole labels, no overflow; fallback-font evidence only`);
  }
  // A genuinely ineligible runtime must still fail the original visibility wait
  // even after a successful, stable 80px preparation. Never blur to make it pass.
  await page.evaluate(()=>{const input=document.createElement('input');input.id='qa-arrow-editing';input.setAttribute('aria-label','SYNTHETIC editing counterproof');input.style.position='fixed';document.body.append(input);input.focus({preventScroll:true});});
  await prepareRosterScroll(page,80);await page.evaluate(beginRosterArrowWindow);
  await assert.rejects(()=>page.getByRole('button',{name:'Voltar ao topo',exact:true}).waitFor(),error=>error.name==='TimeoutError');
  assert.equal(await page.evaluate(()=>scrollY),80);
  assert.equal(await page.evaluate(()=>document.activeElement===document.getElementById('qa-arrow-editing')),true);
  const hiddenWindow=await page.evaluate(()=>window.__rosterArrowWindow.finish());assert.equal(hiddenWindow.violation,null);assert.ok(hiddenWindow.frames>0);
  results.push('runtime editing counterproof: stable80, original visibility timeout retained, no blur or forced click');
  console.log(JSON.stringify({ status: 'PASS', scope: 'full app, fictional demo, offline API fixtures, accelerated minute timers, synthetic account identities', results }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
