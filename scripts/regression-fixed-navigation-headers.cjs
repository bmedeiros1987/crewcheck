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
const homeSource = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const homeAst = ts.createSourceFile('Home.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const confirmation = homeAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'requestCrewCheckImportConfirmation');
assert.equal(confirmation.length, 1);
const modalBundle = buildSync({ stdin: { contents: `import { acquireOverlayLifecycle } from './client/src/lib/overlayLifecycle';\n${confirmation[0].getText(homeAst)}\nwindow.openQAImport=requestCrewCheckImportConfirmation; window.acquireQAOverlay=acquireOverlayLifecycle;`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', write: false }).outputFiles[0].text;
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    for (const width of [320,390,1440]) for (const theme of ['light','dark']) for (const size of [100,150,200]) {
      const context = await browser.newContext({viewport:{width,height:844},hasTouch:width<500,isMobile:width<500,serviceWorkers:'block',timezoneId:'America/Sao_Paulo'});
      await context.route('**/*', route => {
        const url=new URL(route.request().url());
        if(url.origin!==origin) return route.abort();
        if(url.pathname.startsWith('/api/')) return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});
        return route.continue();
      });
      await context.addInitScript(fixtureScope.qaSeed,{theme,kind:fixtureScope.qaRoster('multi'),amount:1234567.89});
      const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));
      await page.locator('#cc-text-size').selectOption(String(size));await settle(page);
      await page.evaluate(()=>{document.documentElement.style.setProperty('--cc-safe-area-top','24px');document.documentElement.style.setProperty('--cc-safe-area-bottom','20px');});
      await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await settle(page);
      const box=async selector=>page.locator(selector).boundingBox();
      const stable=(before,after,label)=>{assert.ok(before&&after);assert.ok(Math.abs(before.y-after.y)<=1&&Math.abs(before.height-after.height)<=1,label+JSON.stringify({before,after}));};
      const header=await box('.cz-global-header');
      assert.equal(await page.locator('.cz-global-header').evaluate(el=>getComputedStyle(el).position),'fixed','Only scroll behavior stays pinned');
      assert.equal(await page.locator('.cz-global-header').evaluate(el=>Boolean(el.closest('.cz-menu-scroll'))),false,'Header remains outside the scroll container');
      assert.equal(await page.locator('.cz-global-header .cz-brand-lockup .cz-logo').isVisible(),true,'Restore the previous brand at mobile widths');
      assert.equal(await page.locator('.cz-global-header .cz-brand-lockup small').isVisible(),true,'Restore the previous subtitle in portrait/desktop');
      const spacer=await box('.cc-fixed-header-space');assert.ok(spacer.height>=header.y+header.height,'Measured spacer follows the restored header size');
      await page.locator('.cz-global-header button').last().focus();assert.equal(await page.locator('.cz-global-header button').last().evaluate(el=>el===document.activeElement),true,'Header actions retain keyboard focus');
      await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-restored-header.png`)});
      for(const top of [900,0,160]) {await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),top);await settle(page);stable(header,await box('.cz-global-header'),'Page header moved');}
      assert.deepEqual(await visibleTextBounds(page,'.cz-global-header'),[]);
      const before=await page.evaluate(()=>window.scrollY);
      await page.locator('body > nav.cz-bottom-nav > button').last().click();await page.locator('.cz-menu-overlay').waitFor();await settle(page);
      assert.equal(await page.locator('#cc-menu-fixed-heading').innerText(),'');
      await page.locator('#cc-menu-personalization > summary').click();
      await page.locator('#cc-menu-fixed-heading h2').waitFor();await settle(page);
      const menuHead=await box('.cz-menu-header'), title=await box('#cc-menu-fixed-heading');
      assert.deepEqual(await visibleTextBounds(page,'#cc-menu-fixed-heading'),[],'Pinned start heading text fits');
      const scroll=page.locator('.cz-menu-scroll');
      for(const position of ['end','start','end']) {
        await scroll.evaluate((el,position)=>el.scrollTop=position==='end'?el.scrollHeight:0,position);await settle(page);
        stable(menuHead,await box('.cz-menu-header'),'Menu header moved');stable(title,await box('#cc-menu-fixed-heading'),'Start heading moved');
      }
      assert.ok(title.y>=menuHead.y+menuHead.height-1,'Pinned headings overlap');
      const wheelBox=await scroll.boundingBox();await page.mouse.move(wheelBox.x+wheelBox.width/2,wheelBox.y+wheelBox.height/2);await page.mouse.wheel(0,-500);await settle(page);stable(menuHead,await box('.cz-menu-header'),'Wheel up moved header');stable(title,await box('#cc-menu-fixed-heading'),'Wheel up moved title');
      await page.mouse.wheel(0,500);await settle(page);stable(menuHead,await box('.cz-menu-header'),'Wheel down moved header');stable(title,await box('#cc-menu-fixed-heading'),'Wheel down moved title');
      await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await settle(page);
      const scrollBox=await box('.cz-menu-scroll');assert.ok(scrollBox.y>=title.y+title.height-1,'Content overlaps pinned heading');
      const last=await page.locator('.cc-menu-destination').last().boundingBox();assert.ok(last.y>=scrollBox.y-1&&last.y+last.height<=scrollBox.y+scrollBox.height+1,'Last destination unreachable');
      await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-fixed-end.png`)});
      if(width<500) {
        await scroll.evaluate(el=>el.scrollTop=0);await page.locator('.cc-menu-search input').focus();
        await page.setViewportSize({width,height:420});await settle(page);
        const keyboardHeader=await box('.cz-menu-header'),keyboardTitle=await box('#cc-menu-fixed-heading');
        await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await settle(page);
        stable(keyboardHeader,await box('.cz-menu-header'),'Reduced viewport header moved');stable(keyboardTitle,await box('#cc-menu-fixed-heading'),'Reduced viewport title moved');
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
      results.push({width,theme,size,importColors,header,menuHead,title,scrollBox,safeArea:{top:24,bottom:20},keyboardHeight:width<500?420:null});
      await context.close();console.log('PASS fixed headers',width,theme,size);
    }
    fs.writeFileSync(path.join(output,'fixed-headers-results.json'),JSON.stringify({testedCommit,cases:results,limitations:['Chromium Android viewport emulation; keyboard represented by reduced visual layout height, not physical Android IME.','Safe-area values injected through CSS variables; no physical cutout device.']},null,2));
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
