const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const { buildSync } = createRequire(process.env.MENU_ESBUILD_PACKAGE || __filename)('esbuild');
const output = path.resolve(process.env.UI_READING_EVIDENCE_DIR || 'artifacts/pulse-content-space');
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve('dist');
const serverSource = fs.readFileSync('server.mjs', 'utf8');
const serverAst = ts.createSourceFile('server.mjs', serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const responder = serverAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'serveStatic');
assert.equal(responder.length, 1);
const staticScope = vm.createContext({ fs, path, Buffer, distDir: dist, sendJson: (res, code, body) => { res.writeHead(code); res.end(JSON.stringify(body)); } });
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
const results = [];
const testedCommit = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const widths = (process.env.UI_READING_WIDTHS || '320,360,390,1440').split(',').map(Number);
assert.ok(widths.every(width => [320, 360, 390, 1440].includes(width)));
const settle = page => page.evaluate(async () => {
  for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) try { animation.finish(); } catch {}
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
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
        if (node.parentElement.closest('svg, option, [aria-hidden="true"]') || !node.parentElement.getClientRects().length) continue;
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
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
 try {
  for(const width of (process.env.PULSE_SPACE_QUICK==='1'?[320]:[320,390,1440])) for(const height of (process.env.PULSE_SPACE_QUICK==='1'?[420]:[420,844])) for(const theme of (process.env.PULSE_SPACE_QUICK==='1'?['light']:['light','dark'])) for(const size of (process.env.PULSE_SPACE_QUICK==='1'?[200]:[200,150,100])) {
   const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500,serviceWorkers:'block',timezoneId:'America/Sao_Paulo'});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
   await context.addInitScript(fixtureScope.qaSeed,{theme,kind:fixtureScope.qaRoster('multi'),amount:1234567.89});const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));await page.locator('#cc-text-size').selectOption(String(size));await settle(page);
   await page.evaluate(()=>{document.documentElement.style.setProperty('--cc-safe-area-top','24px');document.documentElement.style.setProperty('--cc-safe-area-bottom','20px');document.querySelector('body > nav.cz-bottom-nav').style.setProperty('bottom','20px','important');window.dispatchEvent(new Event('resize'));});await settle(page);
   const title='QA crítico: confira toda a programação da escala oficial antes de seguir para o aeroporto';
   await page.evaluate(title=>window.dispatchEvent(new CustomEvent('crewcheck:pulse',{detail:{dedupeKey:'qa-space-long',title,detail:('Texto longo sintético para leitura integral, com detalhes operacionais sem qualquer dado real. ').repeat(40)+' FIM DO AVISO SINTÉTICO.',tone:'erro',priority:'critica',category:'compliance',dismissible:true,autoDismissMs:0,systemNotification:'never'}})),title);
   for(let i=0;i<8;i++){await settle(page);if(await page.locator('.cc-pulse-compact-trigger strong').innerText()===title)break;await page.locator('.cc-pulse-compact-details').click();await page.locator('.cc-pulse-dismiss').click();await page.waitForTimeout(220);}
   assert.equal(await page.locator('.cc-pulse-compact-trigger strong').innerText(),title);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settle(page);
   const measure=()=>page.evaluate(()=>{const b=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};const header=b(document.querySelector('.cz-global-header')),nav=b(document.querySelector('body > nav.cz-bottom-nav'));return {header,nav,usable:nav.y-header.bottom,scrollY,bodyOverflow:getComputedStyle(document.body).overflowY};});
   const closed=await measure();fs.writeFileSync(path.join(output,'latest-geometry.json'),JSON.stringify({testedCommit,width,height,theme,size,closed},null,2));
   await page.screenshot({path:path.join(output,`${width}-${height}-${theme}-${size}-closed.png`)});
   assert.ok(closed.usable>=96,'Normal page has less than two usable 44px targets: '+JSON.stringify({width,height,theme,size,closed}));
   await page.locator('.cc-pulse-compact-details').click();await page.locator('.cc-pulse-popover').waitFor();await settle(page);
   const expanded=await measure();assert.ok(Math.abs(expanded.header.height-closed.header.height)<=1,'Expanded Pulse enlarged fixed navigation');assert.ok(expanded.usable>=96,'Expanded Pulse consumed the page canvas');
   assert.equal(await page.locator('.cz-global-header .cc-pulse-compact').count(),0,'Pulse must be outside fixed navigation');
   await page.screenshot({path:path.join(output,`${width}-${height}-${theme}-${size}-expanded.png`)});
   const before=expanded.header;
   await page.evaluate(()=>window.scrollTo({top:800,behavior:'instant'}));await settle(page);const scrolled=await measure();assert.ok(scrolled.scrollY>0&&Math.abs(scrolled.header.y-before.y)<=1,'Page scroll must preserve navigation position');assert.ok(!['hidden','clip'].includes(scrolled.bodyOverflow),'Pulse must never lock page scrolling');
   await page.locator('.cc-pulse-popover-copy').evaluate(el=>{el.scrollIntoView({block:'end',behavior:'instant'});const nav=document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect();window.scrollBy(0,nav.height+16);});await settle(page);
   await page.locator('.cc-pulse-popover-copy small').evaluate(el=>{const node=el.firstChild,r=document.createRange();r.setStart(node,node.textContent.lastIndexOf('FIM DO AVISO'));r.setEnd(node,node.textContent.length);const rect=r.getBoundingClientRect(),header=document.querySelector('.cz-global-header').getBoundingClientRect().bottom,footer=document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect().top;window.scrollBy(0,(rect.top+rect.bottom)/2-(header+footer)/2);});await settle(page);
   const tail=await page.locator('.cc-pulse-popover-copy small').evaluate(el=>{const node=el.firstChild,r=document.createRange();r.setStart(node,node.textContent.lastIndexOf('FIM DO AVISO'));r.setEnd(node,node.textContent.length);const boxes=[...r.getClientRects()].map(r=>({top:r.top,bottom:r.bottom}));return {boxes,header:document.querySelector('.cz-global-header').getBoundingClientRect().bottom,footer:document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect().top};});
   assert.ok(tail.boxes.length&&tail.boxes.every(r=>r.top>=tail.header-1&&r.bottom<=tail.footer+1),'Last lines of long notice must be readable between navigation surfaces: '+JSON.stringify(tail));
   await page.screenshot({path:path.join(output,`${width}-${height}-${theme}-${size}-detail-end.png`)});
   await page.locator('.cc-pulse-popover-copy').focus();await page.keyboard.press('Escape');await page.locator('.cc-pulse-popover').waitFor({state:'detached'});await settle(page);
   assert.ok(await page.locator('.cc-pulse-compact-details').evaluate(el=>document.activeElement===el),'Escape must return focus to details opener');
   const hit=await page.locator('.cc-pulse-compact-details').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(hit,'Details opener covered after collapse');
   await page.keyboard.press('Enter');await page.locator('.cc-pulse-popover').waitFor();
   await page.locator('.cc-pulse-collapse').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));assert.ok(await page.locator('.cc-pulse-collapse').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Collapse control must be visible and uncovered');await page.locator('.cc-pulse-collapse').focus();await page.keyboard.press('Enter');await page.locator('.cc-pulse-popover').waitFor({state:'detached'});await settle(page);
   assert.ok(!['hidden','clip'].includes((await measure()).bodyOverflow),'Collapse must restore normal content scrolling');
   await page.keyboard.press('Enter');await page.locator('.cc-pulse-dismiss').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));assert.ok(await page.locator('.cc-pulse-dismiss').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Dismiss control must be visible and uncovered');await page.locator('.cc-pulse-dismiss').focus();await page.keyboard.press('Enter');await settle(page);
   const afterDismiss=await measure();assert.ok(afterDismiss.usable>=96&&Math.abs(afterDismiss.header.height-closed.header.height)<=1,'Dismiss must preserve usable space and navigation');
   await recovered(page);results.push({width,height,theme,size,closed,expanded,tail,afterDismiss});await context.close();console.log('PASS Pulse canvas',width,height,theme,size);
  }
  assert.equal(results.length,process.env.PULSE_SPACE_QUICK==='1'?1:36,'Complete Pulse geometry matrix');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({testedCommit,results,scope:'Actual app and Pulse; long synthetic critical title/detail, document scroll, safe area24/20; Android viewport and reduced-height keyboard emulation, no physical IME'},null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
