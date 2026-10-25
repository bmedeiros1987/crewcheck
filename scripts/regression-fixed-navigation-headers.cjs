const { artifactEvidence } = require('./ui-artifact-evidence.cjs');
const exactArtifact = artifactEvidence();
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const { buildSync } = createRequire(process.env.MENU_ESBUILD_PACKAGE || __filename)('esbuild');
const output = path.resolve(process.env.UI_READING_EVIDENCE_DIR || 'artifacts/fixed-headers');
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve('dist');
const serverSource = fs.readFileSync('server.mjs', 'utf8');
const serverAst = ts.createSourceFile('server.mjs', serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const responder = serverAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'serveStatic');
assert.equal(responder.length, 1);
const staticScope = vm.createContext({guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml, fs, path, Buffer, distDir: dist, sendJson: (res, code, body) => { res.writeHead(code); res.end(JSON.stringify(body)); } });
vm.runInContext(responder[0].getText(serverAst) + '\nglobalThis.respond = serveStatic;', staticScope);
const server = http.createServer((req, res) => staticScope.respond(req, res, new URL(req.url, 'http://localhost')));

// Reuse the existing synthetic roster seed; never read production data or user profiles.
const financeSource = fs.readFileSync('scripts/regression-financial-ui-browser.cjs', 'utf8');
const financeAst = ts.createSourceFile('finance.cjs', financeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fixtures = financeAst.statements.filter(n => ts.isFunctionDeclaration(n) && ['roster', 'seed', 'measureMoney', 'contrast'].includes(n.name?.text)
  || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(financeAst) === 'day'));
assert.equal(fixtures.length, 5);
const fixtureScope = vm.createContext({});
vm.runInContext(fixtures.map(n => n.getText(financeAst)).join('\n') + '\nglobalThis.qaRoster=roster; globalThis.qaSeed=seed; globalThis.qaMoney=measureMoney; globalThis.qaContrast=contrast;', fixtureScope);
const homeSource = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const homeAst = ts.createSourceFile('Home.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const confirmation = homeAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'requestCrewCheckImportConfirmation');
assert.equal(confirmation.length, 1);
const modalBundle = buildSync({ stdin: { contents: `import { acquireOverlayLifecycle } from './client/src/lib/overlayLifecycle';\n${confirmation[0].getText(homeAst)}\nwindow.openQAImport=requestCrewCheckImportConfirmation; window.acquireQAOverlay=acquireOverlayLifecycle;`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', write: false }).outputFiles[0].text;
const results = [];
const testedCommit = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const widths = (process.env.UI_READING_WIDTHS || '320,360,390,412,430,768,1024,1440').split(',').map(Number);
assert.ok(widths.every(width => [320, 360, 390, 412, 430, 768, 1024, 1440].includes(width)));
const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) try { animation.finish(); } catch {}
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
async function waitForStableHeading(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.__ccHeadingStability=[];window.__ccHeadingPrevious='';window.__ccHeadingStableFrames=0;
  });
  await page.waitForFunction(() => {
      const button=document.querySelector('.cc-home-layout-heading>button');
      if(!button?.isConnected) {window.__ccHeadingStableFrames=0;return false;}
      const rect=button.getBoundingClientRect();let animating=false;
      for(let node=button;node;node=node.parentElement) {
        if(node.getAnimations().some(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)&&!['finished','idle'].includes(animation.playState))) animating=true;
      }
      const signature=JSON.stringify([rect.x,rect.y,rect.width,rect.height,getComputedStyle(button).transform,document.fonts.status]);
      window.__ccHeadingStableFrames=!animating&&document.fonts.status==='loaded'&&signature===window.__ccHeadingPrevious?window.__ccHeadingStableFrames+1:0;
      window.__ccHeadingPrevious=signature;
      window.__ccHeadingStability.push({time:performance.now(),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},animating,fontStatus:document.fonts.status,stableFrames:window.__ccHeadingStableFrames});
      if(window.__ccHeadingStability.length>24) window.__ccHeadingStability.shift();
      return window.__ccHeadingStableFrames>=3;
  },undefined,{polling:'raf',timeout:3000});
}
// The production event bridge and explicit UI dismissal exercise the compiled
// app's actual queue. No replacement queue or external send.
async function emptyPulseQueue(page) {
  for (let count=0;count<80;count++) {
    const trigger=page.locator('.cz-global-header .cc-pulse-compact-trigger');
    if (!await trigger.count()) return;
    await trigger.click();
    const dismiss=page.getByRole('button',{name:'Dispensar aviso',exact:true});
    await dismiss.waitFor(); await dismiss.click();
    await page.locator('.cc-pulse-popover').waitFor({state:'detached'});
  }
  assert.equal(await page.locator('.cc-pulse-compact-trigger').count(),0,'synthetic queue must be explicitly dismissible');
}
async function activePulseBrandContract(page,{width,size}) {
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:pulse',{detail:{id:'synthetic-header-brand',title:'SYNTHETIC header brand review',compactTitle:'Revisar',category:'compliance',tone:'atencao',priority:'alta',autoDismissMs:0,systemNotification:'never',review:{occurrence:'synthetic-header-brand',version:'v1'}}})));
  const mark=page.getByRole('img',{name:'Notificações CrewCheck',exact:true});
  await mark.waitFor();
  assert.equal(await page.locator('.cz-global-header [data-crewcheck-brand="canonical"]').count(),0,'active queue replaces, never duplicates, the official mark');
  assert.equal(await mark.count(),1,'one accessible semantic notice mark');
  assert.equal(await page.locator('.cz-brand-lockup small').isVisible(),width>=640,'active mobile notice yields the subtitle space; desktop retains it');
  const geometry=await mark.evaluate(element=>{
    const box=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const svg=element.querySelector('svg'),trigger=document.querySelector('.cc-pulse-compact-trigger'),menu=document.querySelector('.cz-menu-btn');
    return{mark:box(element),svg:box(svg),trigger:box(trigger),menu:box(menu),menuVisible:getComputedStyle(menu).display!=='none',row:box(document.querySelector('.cz-brand-row')),stroke:Number(svg.getAttribute('stroke-width'))*svg.getBoundingClientRect().width/24,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(geometry.mark.width,28);assert.equal(geometry.mark.height,28);
  assert.equal(geometry.svg.width,18);assert.equal(geometry.svg.height,18);assert.ok(Math.abs(geometry.stroke-2)<.01);
  assert.ok(geometry.svg.x>=geometry.mark.x&&geometry.svg.right<=geometry.mark.right&&geometry.svg.y>=geometry.mark.y&&geometry.svg.bottom<=geometry.mark.bottom,'pictogram contained in its brand position');
  assert.ok(geometry.trigger.width>=44&&geometry.trigger.height>=44,'notice is a readable keyboard/touch target');
  assert.ok(geometry.mark.right<=geometry.trigger.x+1,'brand and notice never overlap');
  assert.equal(geometry.menuVisible,width>639,'only redundant mobile Menu is hidden');
  if(geometry.menuVisible)assert.ok(geometry.trigger.right<=geometry.menu.x+1,'notice and retained header Menu never overlap');
  else assert.ok(geometry.trigger.right<=geometry.row.right+1,'notice stays inside full available header width');
  assert.equal(geometry.overflow,false);
  const trigger=page.locator('.cc-pulse-compact-trigger');await trigger.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.cc-pulse-compact-trigger')?.getAttribute('aria-expanded')==='true');
  const dismiss=page.getByRole('button',{name:'Dispensar aviso',exact:true});await dismiss.focus();
  const target=await dismiss.boundingBox();assert.ok(target.width>=44&&target.height>=44);
  await page.keyboard.press('Enter');await page.locator('.cz-global-header [data-crewcheck-brand="canonical"]').waitFor();
  assert.equal(await mark.count(),0,'last dismissal restores the official mark');
  assert.equal(await page.locator('.cz-brand-lockup small').isVisible(),!(width<=600&&size>=150),'normal subtitle returns exactly when due');
  const navigationTarget=page.locator(width<=639?'body > nav.cz-bottom-nav button[data-crewcheck-menu-trigger="true"]':'.cz-menu-btn');
  assert.ok(await navigationTarget.isVisible(),'dismissal target remains visible');
  assert.equal(await navigationTarget.evaluate(element=>element===document.activeElement),true,'dismissal restores keyboard focus to the reachable navigation action');
  return geometry;
}
async function recovered(page) {
  await page.waitForFunction(() => !document.body.classList.contains('crewcheck-menu-open') && !history.state?.crewcheckOverlay && document.body.style.overflow !== 'hidden');
  await settle(page);
  const result = await page.evaluate(() => {
    const nav = document.querySelector('body > nav.cz-bottom-nav');
    window.scrollTo({ top: 0, behavior: 'instant' });
    const before = window.scrollY;
    window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
    const after = window.scrollY;
    return { unlocked: !['hidden', 'clip'].includes(getComputedStyle(document.body).overflowY), scrolled: after > before || document.scrollingElement.scrollHeight <= innerHeight,
      navVisible: nav && getComputedStyle(nav).display !== 'none' };
  });
  assert.ok(result.unlocked && result.scrolled && result.navVisible, 'Body scroll or approved navigation not restored: ' + JSON.stringify(result));
}
async function visibleTextBounds(page, selector) {
  return page.locator(selector).evaluateAll(elements => {
    const failures = [];
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      if (!element.getClientRects().length || !box.width || !box.height) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.parentElement.closest('svg, option, [aria-hidden="true"]') || !node.parentElement.getClientRects().length || parseFloat(getComputedStyle(node.parentElement).fontSize) === 0) continue;
        for (let i = 0; i < node.textContent.length; i++) {
          if (/\s/.test(node.textContent[i])) continue;
          const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
          for (const rect of range.getClientRects()) if (rect.width && rect.height && (rect.left < box.left - 2 || rect.right > box.right + 2 || rect.top < box.top - 2 || rect.bottom > box.bottom + 2)) {
            const style = getComputedStyle(node.parentElement);
            failures.push({ text: element.textContent.slice(0, 100), char: node.textContent[i], whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap,
              rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom } }); break;
          }
        }
      }
    }
    return failures.slice(0, 20);
  });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    for (const width of widths) for (const theme of ['light','dark']) for (const size of [100,150,200]) {
      const context = await browser.newContext({viewport:{width,height:844},hasTouch:width<500,isMobile:width<500,serviceWorkers:'block',timezoneId:'America/Sao_Paulo'});
      await context.route('**/*', route => {
        const url=new URL(route.request().url());
        if(url.origin!==origin) return route.abort();
        if(url.pathname.startsWith('/api/')) return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});
        return route.continue();
      });
      await context.addInitScript(fixtureScope.qaSeed,{theme,kind:fixtureScope.qaRoster('multi'),amount:1234567.89});
      await context.addInitScript(()=>{
        window.__ccReadingPointer=null;
        document.addEventListener('pointermove',event=>{window.__ccReadingPointer={x:event.clientX,y:event.clientY,type:event.pointerType,time:performance.now()};},true);
        const ownerId='financial-ui-qa';
        localStorage.setItem('crewcheck_language','pt-BR');
        localStorage.setItem('crewcheck:notification-preferences:v1:'+ownerId,JSON.stringify({ownerId,revision:0,preferences:{settings:{crewcheck_pulse_enabled:true}}}));
        window.Notification=class{static permission='denied';constructor(){throw Error('Synthetic fixture forbids external notifications');}};
      });
      const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));
      await page.locator('#cc-text-size').selectOption(String(size));await settle(page);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'cockpit'})));
      await page.locator('.cc-home-layout-heading').waitFor();await settle(page);
      await page.evaluate(()=>{document.documentElement.style.setProperty('--cc-safe-area-top','24px');document.documentElement.style.setProperty('--cc-safe-area-bottom','20px');});
      await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await settle(page);
      await emptyPulseQueue(page);await settle(page);
      const box=async selector=>page.locator(selector).boundingBox();
      const stable=(before,after,label)=>{assert.ok(before&&after);assert.ok(Math.abs(before.y-after.y)<=1&&Math.abs(before.height-after.height)<=1,label+JSON.stringify({before,after}));};
      // Prepared-cascade geometry: exactly one top inset, with no opaque rectangle.
      const homeGeometry=[];let negativeControl=null;
      for (const inset of [0,24,48]) {
        await page.evaluate(inset=>document.documentElement.style.setProperty('--cc-safe-area-top',inset+'px'),inset);
        await settle(page);
        try {await waitForStableHeading(page);} catch(error) {
          const timeline=await page.evaluate(()=>window.__ccHeadingStability);
          fs.writeFileSync(path.join(output,`${width}-${theme}-${size}-inset${inset}-stability-timeout.json`),JSON.stringify({width,theme,size,inset,timeline},null,2));
          await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-inset${inset}-stability-timeout.png`)});throw error;
        }
        const top=await page.evaluate(()=>{
          const app=document.querySelector('.cz-app'),header=app.querySelector(':scope > .cz-global-header'),row=header.querySelector('.cz-brand-row');
          const h=header.getBoundingClientRect(),r=row.getBoundingClientRect(),a=app.getBoundingClientRect();
          const heading=document.querySelector('.cc-home-layout-heading'),copy=heading.firstElementChild.getBoundingClientRect(),button=heading.querySelector('button').getBoundingClientRect();
          const target=heading.querySelector('button'),style=getComputedStyle(target),ancestors=[];
          for(let node=target;node;node=node.parentElement) ancestors.push({tag:node.tagName,className:node.className,transform:getComputedStyle(node).transform,animations:node.getAnimations().map(animation=>({state:animation.playState,time:animation.currentTime,end:animation.effect?.getComputedTiming().endTime}))});
          return {time:performance.now(),parentPadding:getComputedStyle(app).paddingTop,headerPadding:getComputedStyle(header).paddingTop,background:getComputedStyle(header).backgroundColor,before:getComputedStyle(header,'::before').content,offset:r.top-a.top,headerTop:h.top-a.top,homeGap:Math.min(copy.top,button.top)-h.bottom,homePadding:getComputedStyle(heading).paddingTop,button:{width:button.width,height:button.height,offsetHeight:target.offsetHeight,minHeight:style.minHeight,transform:style.transform,hover:target.matches(':hover'),active:target.matches(':active'),fontStatus:document.fonts.status,pointer:window.__ccReadingPointer,ancestors},stability:window.__ccHeadingStability};
        });
        homeGeometry.push({inset,...top});
        assert.equal(top.parentPadding,'0px','Parent does not duplicate header safe area');
        assert.equal(top.headerPadding,inset+'px','Header retains the full safe area');
        assert.equal(top.background,'rgba(0, 0, 0, 0)','Header shares the app canvas');
        assert.equal(top.before,'none','No opaque header pseudo surface');
        assert.ok(Math.abs(top.offset-inset)<=1,'Brand starts immediately after the single safe inset: '+JSON.stringify(top));
        assert.ok(Math.abs(top.headerTop)<=1,'No obsolete top gap');
        assert.equal(top.homePadding,'16px','Home owns one moderate content inset');
        assert.ok(top.homeGap>=16&&top.homeGap<=24,'Home heading breathes below the header without duplicated shell padding: '+JSON.stringify(top));
        if(top.button.width<44||top.button.height<44) {
          const failure={width,theme,size,inset,top};
          fs.writeFileSync(path.join(output,`${width}-${theme}-${size}-inset${inset}-touch-failure.json`),JSON.stringify(failure,null,2));
          await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-inset${inset}-touch-failure.png`)});
        }
        assert.ok(top.button.width>=44&&top.button.height>=44,'Personalize retains its touch target: '+JSON.stringify({width,theme,size,inset,button:top.button}));
        assert.deepEqual(await visibleTextBounds(page,'.cc-home-layout-heading'),[],'Home title and personalization text fit at every text size');
      }
      if(width===1440&&theme==='light'&&size===100) {
        const target=page.locator('.cc-home-layout-heading>button'),originalStyle=await target.getAttribute('style');
        try {
          await target.evaluate(button=>{button.style.setProperty('min-height','43px','important');button.style.setProperty('height','43px','important');});
          await waitForStableHeading(page);
          negativeControl=await target.evaluate(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height,offsetHeight:button.offsetHeight}));
          assert.equal(negativeControl.offsetHeight,43,'Negative fixture really has a stable 43px layout box');
          assert.throws(()=>assert.ok(negativeControl.width>=44&&negativeControl.height>=44),{code:'ERR_ASSERTION'},'The unchanged touch minimum rejects stable 43px; readiness does not wait for a passing size');
          await page.screenshot({path:path.join(output,'negative-control-stable-43px.png')});
        } finally {
          await target.evaluate((button,style)=>{if(style===null)button.removeAttribute('style');else button.setAttribute('style',style);},originalStyle);
          await waitForStableHeading(page);
        }
        const restored=await target.boundingBox();assert.ok(restored.width>=44&&restored.height>=44,'Restore the real minimum after the negative fixture');
      }
      await page.evaluate(()=>document.documentElement.style.setProperty('--cc-safe-area-top','24px'));
      await settle(page);
      const header=await box('.cz-global-header');
      assert.equal(await page.locator('.cz-global-header').evaluate(el=>getComputedStyle(el).position),'relative','Header follows document flow');
      assert.ok(await page.locator('.cz-global-header').evaluate(el=>parseFloat(getComputedStyle(el).paddingTop))>=24,'Header reserves the simulated status bar');
      assert.equal(await page.locator('.cz-global-header').evaluate(el=>Boolean(el.closest('.cz-menu-scroll'))),false,'Header remains outside the scroll container');
      assert.equal(await page.locator('.cz-global-header .cz-brand-lockup .cz-logo').isVisible(),true,'Restore the previous brand at mobile widths');
      assert.equal(await page.locator('.cz-global-header .cz-brand-lockup small').isVisible(),!(width<=600&&size>=150),'Decorative subtitle yields space at large mobile text');
      if(width<=600)assert.ok(header.height<=110,'Mobile identity chrome stays compact with 200% text');
      const mark=await page.locator('.cz-global-header .cz-logo').boundingBox(),markImage=await page.locator('.cz-global-header .cz-logo img').boundingBox();assert.ok(markImage.x>=mark.x-1&&markImage.x+markImage.width<=mark.x+mark.width+1,'Identity image stays fully inside its mark');
      assert.equal(await page.locator('.cc-fixed-header-space').count(),0,'No obsolete header spacer');
      const navigationTarget=page.locator(width<=639?'body > nav.cz-bottom-nav button[data-crewcheck-menu-trigger="true"]':'.cz-global-header .cz-menu-btn');
      assert.ok(await navigationTarget.isVisible(),'existing Menu remains visible');await navigationTarget.focus();assert.equal(await navigationTarget.evaluate(el=>el===document.activeElement),true,'Available navigation action retains keyboard focus');
      await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-restored-header.png`)});
      const activeBrand=await activePulseBrandContract(page,{width,size});
      assert.deepEqual(await visibleTextBounds(page,'.cz-global-header'),[],'restored normal header remains readable');
      await settle(page);
      // Focus during the Pulse contract can scroll the page. Do not combine a
      // pre-interaction viewport rectangle with a post-interaction scrollY.
      const readHeaderDocumentPosition=()=>page.evaluate(()=>{const rect=document.querySelector('.cz-global-header').getBoundingClientRect(),actualScroll=scrollY;return {y:rect.y,height:rect.height,actualScroll,documentY:rect.y+actualScroll};});
      const headerDocumentBaseline=await readHeaderDocumentPosition();
      for(const top of [900,0,160]) {
        await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),top);await settle(page);
        const current=await readHeaderDocumentPosition(),delta=Math.abs(current.documentY-headerDocumentBaseline.documentY);
        if(delta>1){
          const failure={width,theme,size,requestedScroll:top,baseline:headerDocumentBaseline,current,delta};
          fs.writeFileSync(path.join(output,`${width}-${theme}-${size}-scroll-${top}-failure.json`),JSON.stringify(failure,null,2));
          await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-scroll-${top}-failure.png`)});
        }
        assert.ok(delta<=1,'Header follows document scroll: '+JSON.stringify({baseline:headerDocumentBaseline,current,requestedScroll:top,delta}));
      }
      assert.deepEqual(await visibleTextBounds(page,'.cz-global-header'),[]);
      const before=await page.evaluate(()=>window.scrollY);
      await page.locator('body > nav.cz-bottom-nav > button').last().click();await page.locator('.cz-menu-overlay').waitFor();await settle(page);
      assert.equal(await page.locator('#cc-menu-fixed-heading').innerText(),'');
      await page.locator('#cc-menu-personalization > summary').click();
      await page.locator('#cc-menu-fixed-heading h2').waitFor();await settle(page);
      const menuHead=await box('.cz-menu-header'), title=await box('#cc-menu-fixed-heading');
      assert.deepEqual(await visibleTextBounds(page,'.cz-menu-header'),[],'Menu header action text fits');
      await page.getByRole('button',{name:'Sair da conta',exact:true}).waitFor();
      assert.deepEqual(await visibleTextBounds(page,'.cz-menu-header .cz-menu-logout'),[],'Logout label stays inside its action');
      assert.deepEqual(await visibleTextBounds(page,'#cc-menu-fixed-heading'),[],'Pinned start heading text fits');
      const scroll=page.locator('.cz-menu-scroll');
      const menuDoc=await page.evaluate(()=>{const n=document.querySelector('.cz-menu-scroll');return {header:document.querySelector('.cz-menu-header').getBoundingClientRect().top+n.scrollTop,title:document.querySelector('#cc-menu-fixed-heading').getBoundingClientRect().top+n.scrollTop};});
      const normalMenu=async()=>{const r=await page.evaluate(()=>{const n=document.querySelector('.cz-menu-scroll');return {header:document.querySelector('.cz-menu-header').getBoundingClientRect().top+n.scrollTop,title:document.querySelector('#cc-menu-fixed-heading').getBoundingClientRect().top+n.scrollTop};});assert.ok(Math.abs(r.header-menuDoc.header)<=1&&Math.abs(r.title-menuDoc.title)<=1,'Menu headings remain in content flow');};
      for(const position of ['end','start','end']) {
        await scroll.evaluate((el,position)=>el.scrollTop=position==='end'?el.scrollHeight:0,position);await settle(page);
        await normalMenu();
      }
      assert.ok(title.y>=menuHead.y+menuHead.height-1,'Pinned headings overlap');
      const wheelBox=await scroll.boundingBox();await page.mouse.move(wheelBox.x+wheelBox.width/2,wheelBox.y+wheelBox.height/2);await page.mouse.wheel(0,-500);await settle(page);await normalMenu();
      await page.mouse.wheel(0,500);await settle(page);await normalMenu();
      await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await settle(page);
      const scrollBox=await box('.cz-menu-scroll');assert.ok((await box('.cz-menu-header')).y<scrollBox.y,'Menu header scrolls out of view');
      const last=await page.locator('.cc-menu-destination').last().boundingBox();assert.ok(last.y>=scrollBox.y-1&&last.y+last.height<=scrollBox.y+scrollBox.height+1,'Last destination unreachable');
      await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-fixed-end.png`)});
      if(width<500) {
        await scroll.evaluate(el=>el.scrollTop=0);await page.locator('.cc-menu-search input').focus();
        await page.setViewportSize({width,height:420});await settle(page);
        const keyboardHeader=await box('.cz-menu-header'),keyboardTitle=await box('#cc-menu-fixed-heading');
        await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await settle(page);
        assert.ok((await box('.cz-menu-header')).y<keyboardHeader.y,'Header follows reduced-height menu scrolling');
        const reduced=await box('.cz-menu-scroll');assert.ok(reduced.height>=44,'No usable content area with keyboard viewport');
        const final=await page.locator('.cc-menu-destination').last().boundingBox();assert.ok(final.y+final.height<=reduced.y+reduced.height+1,'Last destination unavailable at reduced height');
        await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-keyboard-height.png`)});
        await page.setViewportSize({width,height:844});await settle(page);
      }
      await page.locator('.cz-menu-close').click();await page.locator('.cz-menu-overlay').waitFor({state:'detached'});await page.waitForFunction(()=>document.body.style.overflow!=='hidden');await settle(page);
      assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-before)<=1,'Original scroll position not restored');
      await recovered(page);
      await page.locator('body > nav.cz-bottom-nav > button').last().click();await page.locator('.cz-menu-overlay').waitFor();await page.keyboard.press('Escape');await page.locator('.cz-menu-overlay').waitFor({state:'detached'});await recovered(page);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'import'})));await page.locator('.cz-import').waitFor();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settle(page);
      const importBox=await box('.cz-import'),importHeader=await box('.cz-global-header');assert.ok(importBox.y>=importHeader.y+importHeader.height-1,'Import begins below pinned header');
      assert.deepEqual(await visibleTextBounds(page,'.cz-import'),[],'Import text fits its card');
      const importColors=await page.locator('.cz-import').evaluate(el=>{
        const rgb=s=>s.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number);
        const luminance=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
        const color=getComputedStyle(el),items=[...el.querySelectorAll('h1,p,small,button,.cz-import-privacy')];
        return {background:color.backgroundColor,surface:color.getPropertyValue('--cc-review-surface').trim(),items:items.map(item=>{
          const style=getComputedStyle(item),bg=item.tagName==='BUTTON'?style.backgroundColor:color.backgroundColor;
          const l1=luminance(rgb(style.color)),l2=luminance(rgb(bg));return {text:item.textContent,ratio:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),opacity:style.opacity};
        })};
      });
      assert.ok(importColors.items.every(item=>item.ratio>=4.5&&item.opacity==='1'),'Import contrast: '+JSON.stringify(importColors));
      await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-import.png`)});
      results.push({width,theme,size,activeBrand,importColors,header,menuHead,title,scrollBox,homeGeometry,negativeControl,safeArea:{top:24,bottom:20},keyboardHeight:width<500?420:null});
      await context.close();console.log('PASS fixed headers',width,theme,size);
    }
    assert.deepEqual(artifactEvidence(),exactArtifact,'Exact source/bundle hashes stay unchanged through the complete flow matrix');
    fs.writeFileSync(path.join(output,'fixed-headers-results.json'),JSON.stringify({testedCommit,cases:results,limitations:['Chromium Android viewport emulation; keyboard represented by reduced visual layout height, not physical Android IME.','Safe-area values injected through CSS variables; no physical cutout device.']},null,2));
  } finally {fs.writeFileSync(path.join(output,'artifact.json'),JSON.stringify(exactArtifact,null,2));
    await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
