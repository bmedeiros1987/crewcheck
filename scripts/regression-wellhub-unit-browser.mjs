import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadVerifiedWellhubPartners} from '../server/v14407/wellhub.mjs';
import {wellhubUnitActions} from '../shared/wellhub-unit-actions.mjs';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const output=path.resolve('artifacts/wellhub-hours/unit-actions');fs.mkdirSync(output,{recursive:true});
const unit=loadVerifiedWellhubPartners().find(p=>p.city==='Fortaleza' && p.state==='CE');assert.ok(unit);
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))file=path.join(root,'index.html');if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.WELLHUB_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
try{
for(const theme of ['light','dark'])for(const scale of [1.5,2]){
 const page=await browser.newPage({viewport:{width:320,height:430}});page.on('pageerror',e=>console.error('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});
 await page.route('**/*',async r=>{const req=r.request(),u=new URL(req.url());if(u.origin!==origin||req.method()!=='GET')return r.abort();if(u.pathname==='/api/maintenance/status')return r.fulfill({json:{enabled:false}});if(u.pathname.startsWith('/api/wellhub/unit/')){assert.equal(req.headers().authorization,undefined);assert.equal(req.headers().cookie,undefined);return r.fulfill({json:{ok:true,actions:wellhubUnitActions(unit)}});}if(u.pathname.startsWith('/api/'))return r.abort();return r.continue();});
 await page.goto(`${origin}/academias/unidade/${unit.id}`);await page.locator('.cc-wellhub-unit-page h1').waitFor({timeout:10000}).catch(async e=>{console.error('BODY',await page.locator('body').innerText());throw e;});
 await page.addStyleTag({content:'*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}'});await page.evaluate(({theme,scale})=>{document.documentElement.setAttribute('data-crew-theme',theme);document.documentElement.style.setProperty('font-size',`${16*scale}px`,'important');},{theme,scale});
 assert.equal(await page.locator('h1').innerText(),unit.name);assert.ok((await page.locator('.cc-wellhub-unit-page').innerText()).includes('Fortaleza/CE'));
 assert.equal(await page.locator('.cc-wellhub-unit-primary').count(),1);
 assert.equal(await page.locator('.cc-wellhub-unit-primary').getAttribute('href'),unit.sourceUrl);
 assert.equal(await page.locator('details').getAttribute('open'),null);
 assert.ok((await page.locator('.cc-wellhub-unit-page').innerText()).includes('Destino não preenchido automaticamente'));
 await page.locator('summary').click();assert.equal(await page.locator('nav a').count(),2);
 const map=new URL(await page.locator('nav a').first().getAttribute('href'));assert.equal(map.searchParams.get('api'),'1');assert.ok(map.searchParams.get('query').includes(unit.address));assert.equal(map.searchParams.has('origin'),false);
 assert.equal(await page.locator('nav a').last().getAttribute('href'),'https://m.uber.com/');
 for(const selector of ['h1','nav a:last-child']){const target=page.locator('.cc-wellhub-unit-page '+selector);await target.evaluate(e=>{e.scrollIntoView({block:'start'});const header=document.querySelector('.cc-wellhub-unit-page header').getBoundingClientRect();const delta=e.getBoundingClientRect().top-header.bottom-12;let moved=false;for(let p=e.parentElement;p;p=p.parentElement){if(!['BODY','HTML'].includes(p.tagName)&&p.scrollHeight>p.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(p).overflowY)){p.scrollTop+=delta;moved=true;break;}}if(!moved)window.scrollBy(0,delta);});const b=await target.boundingBox(),h=await page.locator('header').boundingBox();assert.equal(h.y,0);assert.ok(b.y>=h.height-1&&b.y+b.height<=430,JSON.stringify({theme,scale,selector,b,h}));}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
 await page.screenshot({path:path.join(output,`unit-${theme}-320-${scale}-430.png`)});
 await page.goto(`${origin}/academias/unidade/unknown-unit`);await page.getByText('Unidade não disponível neste cadastro').waitFor();assert.equal(await page.locator('.cc-wellhub-unit-primary').count(),0);assert.ok(!(await page.locator('main').innerText()).includes('Brasília'));
 await page.close();console.log(`PASS: real built public route ${theme} 320/${scale}/430, single primary, grouped actions, fixed header, first/last reachable, no private origin or network`);
}
}finally{await browser.close();await new Promise(r=>server.close(r));}
