const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
(async()=>{
 const {build}=require('esbuild');
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{FinancialFxProvider,useFinancialFx}from'./client/src/components/finance/FinancialFxProvider';function State(){const fx=useFinancialFx();return <><output>{fx.state}</output><button onClick={()=>fx.setMode('manual')}>manual</button><button onClick={()=>fx.setMode('automatic')}>automatic</button></>}createRoot(document.getElementById('root')).render(<FinancialFxProvider><State/></FinancialFxProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}});
 let enabled=true,calls=0;
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].contents);}if(req.url==='/api/platform/finance/exchange-rates'){calls++;res.setHeader('content-type','application/json');if(!enabled){res.statusCode=503;return res.end('{"state":"unavailable"}');}return res.end(JSON.stringify({state:'available',method:'blended_daily',quotes:{USD:{base:'BRL',quote:'USD',rate:'0.2',asOf:'2032-02-02',retrievedAt:'2032-02-02T15:00:00Z',source:'synthetic',method:'blended_daily'}}}));}res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/bundle.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 try{const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic',email:'synthetic@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-only');});
 const page=await context.newPage();await page.clock.install({time:new Date('2032-02-02T15:00:00Z')});await page.goto(origin);await page.waitForFunction(()=>document.querySelector('output')?.textContent==='available');assert.equal(calls,1);
 enabled=false;await page.clock.fastForward(31*60*1000);assert.equal(await page.locator('output').textContent(),'available');assert.equal(calls,1,'already-open client does not poll or react to server OFF');
 await page.getByRole('button',{name:'manual',exact:true}).click();await page.getByRole('button',{name:'automatic',exact:true}).click();await page.waitForFunction(()=>document.querySelector('output')?.textContent==='unavailable');assert.equal(calls,2,'new revalidation receives OFF');
 await page.getByRole('button',{name:'manual',exact:true}).click();await page.getByRole('button',{name:'automatic',exact:true}).click();assert.equal(calls,2,'failure cooldown avoids retry');
 console.log('PASS synthetic actual FX provider: open client retains old quote beyond 30min/server OFF until explicit mode change; revalidation sees OFF; failure cooldown. GAP: no live revocation/TTL refresh while continuously mounted. No FX code changed.');await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
