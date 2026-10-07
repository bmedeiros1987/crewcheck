import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Run against the actual prepared app (Vite dev or preview), with disposable demo
// storage and stubbed API responses. Never contacts a production API/account.
// FOOTER_PLAYWRIGHT_PACKAGE can point to an existing Playwright package.json.
const { chromium } = createRequire(process.env.FOOTER_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const base = process.env.FOOTER_QA_URL || 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local app only');
const baseline = process.argv.includes('--baseline');
const output = path.resolve(process.env.FOOTER_QA_OUTPUT || '/tmp/crewcheck-footer-qa');
fs.mkdirSync(output, { recursive: true });
const sizes = [[320,740],[360,800],[390,844],[430,932],[768,1024],[1440,1000],[844,390]];
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const results = [], regressions = [];
const navSelector = 'body > nav.cz-bottom-nav[aria-label="Navegação principal"]';
function compare(actual, expected, context) {
  for (const key of ['x','y','width','height']) {
    if (Math.abs(actual[key]-expected[key]) > .1) {
      const message = `${context}.${key}: ${actual[key]} != ${expected[key]}`;
      if (baseline) regressions.push(message); else assert.fail(message);
    }
  }
}
async function measure(page) {
  return page.locator(navSelector).evaluate(nav => {
    const box = e => Object.fromEntries(['x','y','width','height'].map(k=>[k,e.getBoundingClientRect()[k]]));
    const style = e => { const s=getComputedStyle(e); return {family:s.fontFamily,size:s.fontSize,line:s.lineHeight,weight:s.fontWeight,transform:s.transform,animation:s.animationName,outline:s.outlineStyle}; };
    return { view:document.querySelector('.cz-app').dataset.view, nav:box(nav), padding:getComputedStyle(nav).padding,
      theme:document.documentElement.dataset.crewTheme, inter:document.fonts.check('12px Inter'),
      buttons:[...nav.children].map(b=>({box:box(b),style:style(b),icon:box(b.querySelector('svg')),label:box(b.querySelector('span')),font:style(b.querySelector('span'))})) };
  });
}
try {
  for (const [width,height] of sizes) for (const theme of ['light','dark']) for (const reducedMotion of ['no-preference','reduce']) {
    const id=`${width}x${height}-${theme}-${reducedMotion}`;
    const context = await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion,serviceWorkers:'block'});
    let apiStubs=0, blocked=0;
    await context.route('**/*',route=>{
      const url = new URL(route.request().url());
      if(url.origin===new URL(base).origin) {
        if(url.pathname.startsWith('/api/')) { apiStubs++; return route.fulfill({status:200,contentType:'application/json',body:'{}'}); }
        return route.continue();
      }
      if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname) && route.request().method()==='GET') return route.continue();
      blocked++; return route.abort();
    });
    await context.addInitScript(theme=>{
      sessionStorage.setItem('crewcheck_demo_active','1');
      localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');
      localStorage.setItem('crewcheck_theme_mode',theme);
    },theme);
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/app`);
    const nav=page.locator(navSelector), buttons=nav.locator(':scope > button');
    await nav.waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(500);
    const reference=await measure(page);
    assert.equal(reference.theme,theme);
    assert.equal(reference.buttons.length,5);
    const snapshots=[];
    async function capture(state) {
      const m=await measure(page);
      compare(m.nav,reference.nav,`${id}/${state}/nav`);
      m.buttons.forEach((b,i)=>{
        const r=reference.buttons[i];
        compare(b.box,r.box,`${id}/${state}/button${i}`);
        compare(b.icon,r.icon,`${id}/${state}/icon${i}`);
        compare(b.label,r.label,`${id}/${state}/label${i}`);
        for(const key of ['family','size','line']) assert.equal(b.font[key],r.font[key],`${id}/${state}/font${i}/${key}`);
        assert.ok(b.box.height>=44 && b.box.width>=44,`${id}: minimum target`);
      });
      snapshots.push({state,...m});
    }
    for(let round=0;round<2;round++) {
      for(const [index,view] of [[1,'roster'],[2,'departure'],[3,'alerts'],[0,'cockpit']]) {
        await buttons.nth(index).click();
        await page.locator(`.cz-app[data-view="${view}"]`).waitFor();
        await capture(`${round}/${view}/immediate`);
        await page.waitForTimeout(200);
        await capture(`${round}/${view}/settled`);
      }
      await buttons.nth(4).click();
      await page.locator('.cz-menu-panel').waitFor();
      assert.equal(await nav.isVisible(),false,'Drawer owns footer visibility');
      await page.locator('.cc-menu-destination[data-menu-label="Apresentação"]').click();
      await page.locator('.cz-app[data-view="presentation"]').waitFor();
      await nav.waitFor({state:'visible'});
      await capture(`${round}/presentation`);
      await buttons.nth(0).click();
      await page.locator('.cz-app[data-view="cockpit"]').waitFor();
    }
    for(let i=0;i<5;i++) {
      await buttons.nth(i).hover(); await capture(`hover${i}`);
      const b=await buttons.nth(i).boundingBox();
      await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
      await page.mouse.down(); await page.waitForTimeout(180); await capture(`pressed${i}`);
      await page.mouse.move(1,1); await page.mouse.up();
    }
    await buttons.nth(0).focus(); await page.keyboard.press('Tab');
    assert.equal(await buttons.nth(1).evaluate(b=>b.matches(':focus-visible')),true);
    const focus=await measure(page); assert.notEqual(focus.buttons[1].style.outline,'none');
    await capture('keyboard-focus');
    await page.screenshot({path:path.join(output,`${id}.png`)});
    assert.deepEqual(errors,[],`${id}: app runtime errors`);
    results.push({id,apiStubs,blocked,snapshots});
    console.log(`${id}: ${snapshots.length} snapshots`);
    await context.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({baseline,results,regressions},null,2));
}
if(baseline) assert.ok(regressions.length>0,'Baseline must reproduce regression');
console.log(`${baseline?'BASELINE REPRODUCED':'PASS'}: ${results.length} cases; ${results.reduce((n,r)=>n+r.snapshots.length,0)} snapshots; ${regressions.length} geometry differences`);
