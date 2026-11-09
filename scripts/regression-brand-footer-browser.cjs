const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const { artifactEvidence } = require('./ui-artifact-evidence.cjs');
const artifact = artifactEvidence();
const output = path.resolve(process.env.BRAND_FOOTER_EVIDENCE_DIR || 'artifacts/brand-footer');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync('server.mjs', 'utf8');
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const responder = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'serveStatic');
const scope = vm.createContext({guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml, fs, path, Buffer, distDir: path.resolve('dist'), sendJson: (r,s,b) => { r.writeHead(s); r.end(JSON.stringify(b)); } });
vm.runInContext(responder.getText(ast) + ';globalThis.respond=serveStatic', scope);
const server = http.createServer((q,r) => scope.respond(q,r,new URL(q.url,'http://localhost')));
const fixtureText = fs.readFileSync('scripts/regression-financial-ui-browser.cjs','utf8');
const fixtureAst = ts.createSourceFile('finance.cjs',fixtureText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const fixtures = fixtureAst.statements.filter(n => ts.isFunctionDeclaration(n) && ['roster','seed'].includes(n.name?.text)
  || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(fixtureAst)==='day'));
const fixture = vm.createContext({});
vm.runInContext(fixtures.map(n=>n.getText(fixtureAst)).join('\n')+';globalThis.qaSeed=seed;globalThis.qaRoster=roster',fixture);
const devices = [[320,740],[390,844],[430,844],[667,375],[844,390],[932,430],[1024,768],[1440,900]];
async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; for(const a of document.getAnimations()) if(Number.isFinite(a.effect?.getComputedTiming().endTime))try{a.finish();}catch{} await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); });
}
async function measure(page) {
  return page.locator('body > nav.cz-bottom-nav').evaluate(nav => {
    const box = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    return {nav:box(nav),viewport:{width:innerWidth,height:innerHeight},rows:[...nav.querySelectorAll('button')].map(button=>{
      const label=button.querySelector('span'),range=document.createRange();range.selectNodeContents(label);
      const glyphs=[...range.getClientRects()].map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom}));
      const r=button.getBoundingClientRect();return {text:label.textContent,font:parseFloat(getComputedStyle(label).fontSize),button:box(button),label:box(label),glyphs,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
    })};
  });
}
(async () => {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
  const results=[],authResults=[];
  try {
    for(const [width,height,language] of [[320,740,'pt-BR'],...devices.map(d=>[...d,'en-US'])]) for(const theme of ['light','dark']) {
      const context=await browser.newContext({viewport:{width,height},locale:language,hasTouch:width<1000,isMobile:width<1000,serviceWorkers:'block',timezoneId:'America/Sao_Paulo'});
      await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.request().method()==='GET'?route.continue():route.abort();});
      await context.addInitScript(fixture.qaSeed,{theme,kind:fixture.qaRoster('multi'),amount:0});
      await context.addInitScript(language=>localStorage.setItem('crewcheck_language',language.split('-')[0]),language);
      const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));
      const fonts=[];
      for(const size of [100,200]) {
        await page.locator('#cc-text-size').selectOption(String(size));await settle(page);const m=await measure(page);
        assert.equal(m.rows.length,5);assert.deepEqual(m.rows.map(r=>r.text),language==='pt-BR'?['FlightDeck','Escala','Saída','Alertas','Menu']:['FlightDeck','Roster','Depart','Alerts','Menu']);
        for(const row of m.rows) {
          assert(row.button.width>=44&&row.button.height>=44&&row.hit,'Five usable navigation targets');
          assert(row.glyphs.every(g=>g.x>=row.button.x-1&&g.right<=row.button.right+1&&g.y>=row.button.y-1&&g.bottom<=row.button.bottom+1),`Whole label fits: ${JSON.stringify(row)}`);
          if(size===200)assert(row.glyphs.length===1,'Large labels retain whole words on one line');
        }
        assert(m.nav.x>=0&&m.nav.right<=width+1&&m.nav.y>=0&&m.nav.bottom<=height+1,'Footer stays inside viewport');
        fonts.push(m.rows.map(r=>r.font));
        const img=page.locator('.cz-global-header [data-crewcheck-brand="canonical"] img');
        await img.waitFor();assert(await img.evaluate(el=>el.complete&&el.naturalWidth===512&&el.currentSrc.includes('brand=936-3656d39df50e')),'Actual header loads the approved cache-versioned PNG');
        await page.screenshot({path:path.join(output,`${width}-${height}-${theme}-${size}-${language}.png`)});
        results.push({width,height,theme,size,language,...m});
      }
      assert(fonts[1].every((font,i)=>font>=fonts[0][i]*1.8),'200% never shrinks the text to fit columns');
      await page.locator('body > nav.cz-bottom-nav > button').last().click();await page.locator('.cz-menu-overlay').waitFor();await page.keyboard.press('Escape');await page.locator('.cz-menu-overlay').waitFor({state:'detached'});
      await page.waitForFunction(()=>!history.state?.crewcheckOverlay&&document.body.style.overflow!=='hidden');await settle(page);
      assert.equal(await page.locator('body > nav.cz-bottom-nav').isVisible(),true,'Menu close restores the same footer');
      await context.close();console.log('PASS approved mark and footer',width,height,theme);
    }
    for(const theme of ['light','dark']) {
      const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme,serviceWorkers:'block'});
      await context.addInitScript(theme=>{localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);},theme);
      await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});return r.continue();});
      const page=await context.newPage();await page.goto(origin+'/login');await page.locator('.cz-auth').waitFor();await settle(page);
      const brand=await page.locator('.cz-auth-brand > span').evaluate(el=>({background:getComputedStyle(el).backgroundImage,svg:getComputedStyle(el.querySelector('svg')).visibility}));
      assert(brand.background.includes('brand=936-3656d39df50e')&&brand.svg==='hidden','Auth uses approved art instead of the procedural plane');
      await page.screenshot({path:path.join(output,`auth-${theme}.png`)});authResults.push({theme,...brand});await context.close();
    }
    const response=await (await browser.newContext()).request.get(origin+'/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e');
    assert.equal(response.status(),200);assert.equal(crypto.createHash('sha256').update(await response.body()).digest('hex'),'3656d39df50e32094211ef737c0237a26308e7e742bcccc855a87150f47a638c');
    assert.deepEqual(artifactEvidence(),artifact,'Exact prepared sources and bundles remain immutable during full brand/footer capture');
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({artifact,results,authResults,scope:'Actual compiled app, synthetic account, no providers/messages; Chromium emulation, not installed APK'},null,2));
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
