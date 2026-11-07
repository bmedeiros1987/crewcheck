import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {buildRosterLegendFixture} from './lib/roster-legend-fixture.mjs';
const require=createRequire(import.meta.url),{beginLegendScrollProbe,finishLegendScrollProbe,captureRosterGeometry}=require('./lib/roster-geometry-diagnostics.cjs');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const css=process.env.ROSTER_PRODUCTION_CSS;assert.ok(css&&fs.existsSync(css),'explicit shipping CSS required');
const out=path.resolve(process.env.ROSTER_SCROLL_EVIDENCE||'artifacts/roster-legend-scroll'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-scroll-'));fs.mkdirSync(out,{recursive:true});await buildRosterLegendFixture(path.join(dir,'app.js'));
const server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(path.join(dir,'app.js')));}if(req.url==='/style.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(css));}res.setHeader('content-type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const absoluteOK=({sideways,trace})=>Boolean(trace.baseline&&trace.after&&trace.baseline.sameAncestors&&trace.after.sameAncestors&&[trace.baseline,trace.after].every(s=>s.ancestorsHorizontalZero&&s.ancestorsContained&&s.document.scrollX===0&&s.document.rootScrollWidth-s.viewport.width<=1)&&sideways.scrollX===0&&sideways.moved.length===0&&sideways.doc<=1&&sideways.visible&&trace.after.targetFocused&&trace.after.targetBox.left>=-1&&trace.after.targetBox.right<=trace.after.viewport.width+1&&trace.after.targetBox.top>=-1&&trace.after.targetBox.bottom<=trace.after.viewport.height+1&&trace.after.ancestors.slice(1).every(n=>!['auto','scroll','hidden','clip'].includes(n.overflowX)||(trace.after.targetBox.left>=n.box.left+n.clientLeft-1&&trace.after.targetBox.right<=n.box.left+n.clientLeft+n.clientWidth+1)));
const results=[];let negatives;
try {
 for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const scale of [1,2]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});let external=0;
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(external++,r.abort()));
  await context.addInitScript(({theme,scale})=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:['2032-10-19T15:00:00Z']));}static now(){return D.parse('2032-10-19T15:00:00Z');}};localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-scroll'}));localStorage.setItem('crewcheck_auth_token','synthetic-only');const apply=()=>{if(!document.documentElement)return false;document.documentElement.dataset.crewTheme=theme;document.documentElement.dataset.crewTextSize=String(scale*100);document.documentElement.style.setProperty('--cc-text-scale',String(scale));return true;};if(!apply())new MutationObserver((_,o)=>{if(apply())o.disconnect();}).observe(document,{childList:true});},{theme,scale});
  const page=await context.newPage();await page.goto(origin);await page.locator('.cc-home-roster-list>[data-roster-event-id]').first().waitFor();
  await page.addStyleTag({content:'html body #root .cz-app[data-version] .cc-roster-filter-options button{font-family:"DejaVu Sans"!important}'});
  await page.evaluate(()=>window.__setSurface('roster'));await page.getByRole('button',{name:'Exibir opções da escala',exact:true}).click();
  const list=page.locator('[data-roster-layout-choice="list"]');await list.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Restaurar padrão',exact:true}).click();await page.getByRole('button',{name:'Ver escala',exact:true}).click();
  const legend=page.locator('.cc-roster-filter');await legend.scrollIntoViewIfNeeded();await legend.locator('summary').focus();await page.keyboard.press('Enter');
  const strip=page.locator('.cc-roster-filter-options'),last=strip.locator('button').last();
  await strip.evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));await page.screenshot({path:path.join(out,`${width}-${theme}-${scale}-before-reset.png`)});
  const sourceBefore=await page.evaluate(()=>JSON.stringify(window.__initial));
  await strip.evaluate(beginLegendScrollProbe);await last.click();const report=await strip.evaluate(finishLegendScrollProbe);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__initial)),sourceBefore);
  const fontReport=await captureRosterGeometry({page,browser,selector:'.cc-roster-filter-options>button:last-child>span',file:path.join(out,`${width}-${theme}-${scale}-font.json`),caseInfo:{phase:'after-original-measurement',width,theme,scale}});assert.ok(fontReport.platformFonts?.length===1&&fontReport.platformFonts[0].some(f=>/^DejaVu Sans/.test(f.familyName)&&f.glyphCount>0),'the requested installed fallback must actually render');
  const result={width,theme,scale,engine:browser.version(),font:'installed DejaVu glyphs CDP verified after measurement; no Inter acquisition/acceptance',absoluteOK:absoluteOK(report),externalIntercepted:external,...report};results.push(result);fs.writeFileSync(path.join(out,`${width}-${theme}-${scale}.json`),JSON.stringify(result,null,2));
  await context.close();
 }
 // Counterproofs exercise the same collector, not a relative before/after substitute.
 const page=await browser.newPage();await page.setContent('<div id="ancestor" style="width:260px;height:120px;overflow:hidden"><div id="strip" style="display:flex;width:240px;overflow:auto"><button style="flex:0 0 180px">first</button><button style="flex:0 0 180px">last</button></div></div>');const strip=page.locator('#strip');
 const sample=async mode=>{
  await page.evaluate(()=>{document.querySelector('#overflow-probe')?.remove();document.querySelector('#ancestor').scrollLeft=0;});
  if(mode==='bad-baseline-cleared')await page.evaluate(()=>{const p=document.createElement('div');p.id='overflow-probe';p.style.width='400px';p.style.height='1px';document.querySelector('#ancestor').append(p);document.querySelector('#ancestor').scrollLeft=3;});
  await strip.evaluate(beginLegendScrollProbe);
  await page.evaluate(mode=>{const a=document.querySelector('#ancestor'),s=document.querySelector('#strip'),b=s.lastElementChild;s.scrollLeft=s.scrollWidth;b.focus({preventScroll:true});if(mode==='bad-baseline-cleared'){document.querySelector('#overflow-probe').remove();a.scrollLeft=0;}if(mode==='ancestor-moved'){const p=document.createElement('div');p.id='overflow-probe';p.style.width='400px';p.style.height='1px';a.append(p);a.scrollLeft=4;}if(mode==='lost-focus')b.blur();},mode);
  return strip.evaluate(finishLegendScrollProbe);
 };
 const valid=await sample('strip-only');assert.ok(absoluteOK(valid),'strip-only positive control');
 negatives=[];for(const mode of ['bad-baseline-cleared','ancestor-moved','lost-focus']){const report=await sample(mode);assert.equal(absoluteOK(report),false,mode+' must fail even if a relative metric would hide it');negatives.push({mode,...report});}
 fs.writeFileSync(path.join(out,'counterproofs.json'),JSON.stringify({valid,negatives},null,2));await page.close();
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({synthetic:true,engine:browser.version(),originalInterGateExecuted:false,results,negativeCount:negatives.length},null,2));
 assert.ok(results.every(r=>r.absoluteOK),'focused replay failures are evidence, not an Inter/140 verdict: '+JSON.stringify(results.filter(r=>!r.absoluteOK).map(r=>({width:r.width,theme:r.theme,scale:r.scale,sideways:r.sideways,before:r.trace.baseline.ancestors.filter(n=>n.scrollLeft),after:r.trace.after.ancestors.filter(n=>n.scrollLeft)}))));
 console.log('PASS12 focused real-component scroll cases and3 counterproofs; Chromium151/DejaVu is not original Inter140 acceptance');
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
