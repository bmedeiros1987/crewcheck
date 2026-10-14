const {chromium}=require(require('path').resolve(process.env.CHAT_PLAYWRIGHT_MODULE || 'node_modules/playwright'));
const esbuild=require('esbuild'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const out=path.resolve('artifacts/chat-idempotency');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await esbuild.build({stdin:{contents:`import {sendChatOperation} from '${path.resolve('client/src/lib/chatSend.ts')}'; window.sendChatOperation=sendChatOperation;`,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',tsconfig:'tsconfig.json',outfile:path.join(out,'harness.js')});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/harness.js'?'text/javascript':'text/html');res.end(req.url==='/harness.js'?fs.readFileSync(path.join(out,'harness.js')):'<script src="/harness.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({...(process.env.CHAT_CHROMIUM_PATH?{executablePath:process.env.CHAT_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{
   const send=window.sendChatOperation,records=new Map(),attempts=[];
   localStorage.setItem('crewcheck_auth_token','synthetic-A');
   const persist=(body,lose=false)=>async id=>{attempts.push(id);records.set(id,body);if(lose)throw Error('response lost after commit');return {id}};
   await send('main','peer:A','hello',persist('hello',true)).catch(()=>{});
   const retry=await send('main','peer:A','hello',persist('hello'));
   const replay={sameId:attempts[0]===retry.id,count:records.size};
   const intentional=await send('main','peer:A','hello',persist('hello'));
   const newIntent=intentional.id!==retry.id&&records.size===2;
   let old;await send('main','peer:A','old',async id=>{old=id;throw Error('offline')}).catch(()=>{});
   const changed=await send('main','peer:A','edited',persist('edited'));
   let failedA;await send('main','peer:A','again',async id=>{failedA=id;throw Error('offline')}).catch(()=>{});
   const other=await send('main','peer:B','again',persist('again'));
   localStorage.setItem('crewcheck_auth_token','synthetic-B');
   const account=await send('main','peer:A','again',persist('again'));
   let visitorA;document.cookie='crewcheck_visitor_session=visitor-A;path=/';
   await send('visitor','owner','visitor',async id=>{visitorA=id;throw Error('offline')}).catch(()=>{});
   document.cookie='crewcheck_visitor_session=visitor-B;path=/';
   const visitorB=await send('visitor','owner','visitor',persist('visitor'));
   const original=crypto.subtle.digest.bind(crypto.subtle);let release,started;
   const ready=new Promise(r=>started=r);
   crypto.subtle.digest=async(...args)=>{started();await new Promise(r=>release=r);return original(...args)};
   let transportCalls=0;const pending=send('main','peer:A','late',async()=>{transportCalls++}).then(()=>false,()=>true);
   await ready;localStorage.setItem('crewcheck_auth_token','synthetic-C');release();const rejected=await pending;crypto.subtle.digest=original;
   return {replay,newIntent,editedNewId:changed.id!==old,recipientIsolation:other.id!==failedA,accountIsolation:account.id!==failedA,visitorIsolation:visitorB.id!==visitorA,sessionChangeBeforeTransport:rejected&&transportCalls===0};
  });
  assert.deepStrictEqual(result,{replay:{sameId:true,count:1},newIntent:true,editedNewId:true,recipientIsolation:true,accountIsolation:true,visitorIsolation:true,sessionChangeBeforeTransport:true});
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({result,note:'Actual client helper bundled in Chromium. Synthetic transport commits then loses its response; no production API.'},null,2));console.log(result);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
