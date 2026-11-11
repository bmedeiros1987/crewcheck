import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const output=await build({stdin:{contents:`import React from 'react';import {createRoot}from'react-dom/client';import Explorer from './client/src/components/finance/FinancialHistoryExplorer';const roster={year:2026,month:99,crewId:'SYN',crewName:'SYNTHETIC',rank:'CC',base:'BSB',airline:'LA',days:[]};createRoot(document.getElementById('root')).render(<Explorer roster={roster} mode="salary" calculate={()=>({})} metric={()=>({})} render={()=>null}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'/tmp/SYNTHETIC-invalid-financial-period.js',format:'iife',jsx:'automatic',logLevel:'silent'});
const js=output.outputFiles.find(f=>f.path.endsWith('.js'))?.text||output.outputFiles[0].text;
const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});return res.end('{"ok":false}');}res.setHeader('content-type','text/html');res.end('<div id="root"></div><script>'+js.replaceAll('</script','<\\/script')+'</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYN',role:'user'}));localStorage.setItem('crewcheck_auth_token','SYN');});await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('heading',{name:'Competência não informada',exact:true}).waitFor();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.deepEqual(errors,[]);console.log('PASS invalid source competence remains pending; registered history effects do not throw RangeError');}
finally{await browser.close();await new Promise(r=>server.close(r));}
