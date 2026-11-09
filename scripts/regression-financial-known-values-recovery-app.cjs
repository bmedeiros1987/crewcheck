const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
// Called by the existing compiled-app financial gate; all requests are local or mocked.
module.exports=async function recoveryChecks({browser,origin,seed,out}){
 const results=[];
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(seed,{unknown:false,unknownAddition:false,futureForeign:false,language:'pt'});
  await context.addInitScript(theme=>{localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);},theme);
  let healthy=false,reads=0;const blockedNonFinancialMutations=[];
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();if(req.method()!=='GET'){blockedNonFinancialMutations.push(url.pathname);console.log('MOCK_BLOCKED_STARTUP_MUTATION '+url.pathname);assert.equal(url.pathname,'/api/control/telemetry','only the demonstrated startup telemetry may attempt a mocked POST; recovery remains read-only');return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});}if(url.pathname==='/api/rosters'){reads++;return route.fulfill({status:healthy?200:503,contentType:'application/json',body:JSON.stringify(healthy?{ok:true,rosters:[]}:{ok:false})});}return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));
  await page.locator('.cc-payment-hero').waitFor();
  assert.match(await page.locator('.cc-salary-basis-amount').innerText(),/subtotal bruto estimado/,'hero cannot call incomplete inventory a full salary');
  await page.getByRole('button',{name:'Extrato',exact:true}).click();
  const retry=page.getByRole('button',{name:'Tentar leitura novamente',exact:true});await retry.waitFor();
  const target=await retry.boundingBox();assert(target.width>=48&&target.height>=48,'48px retry target');
  const failedReads=reads;healthy=true;await retry.focus();assert(await retry.evaluate(el=>el===document.activeElement));await page.keyboard.press('Enter');
  await retry.waitFor({state:'hidden'});await page.locator('.cc-financial-range[data-financial-content-ready="true"]').waitFor();assert.equal(reads,failedReads+1,'one explicit retry, no automatic loop');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));await page.locator('.cc-payment-hero').waitFor();
  assert.match(await page.locator('.cc-forecast-currencies').innerText(),/Trabalho · 14\/10\/2026 a 20\/10\/2026/);
  assert.match(await page.locator('.cc-forecast-currencies').innerText(),/Crédito previsto · 22\/10\/2026/);
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'financial content remains horizontally contained');
  const font=await page.locator('.cc-payment-hero').evaluate(el=>({family:getComputedStyle(el).fontFamily,faces:Array.from(document.fonts).filter(face=>face.family.includes('Inter')).map(face=>({family:face.family,status:face.status}))}));
  await page.screenshot({path:path.join(out,`recovery-${width}-${theme}.png`),fullPage:true});assert.deepEqual(errors,[]);results.push({width,theme,reads,realAPIRequests:0,financialMutationAttempts:0,blockedNonFinancialMutations,font});await context.close();
 }
 fs.writeFileSync(path.join(out,'recovery-report.json'),JSON.stringify(results,null,2));console.log('PASS compiled financial recovery:6 contexts; explicit keyboard read recovery; partial salary; work versus credit; two themes;320/390/1440.');
};
