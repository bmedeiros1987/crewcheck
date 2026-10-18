import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from'./client/src/pages/VisitorAccessPage';createRoot(document.getElementById('root')).render(<Page/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}));b.onLoad({filter:/^css$/,namespace:'fixture'},()=>({contents:'',loader:'js'}));
 b.onResolve({filter:/^sonner$/},()=>({path:'toast',namespace:'fixture'}));b.onLoad({filter:/toast/,namespace:'fixture'},()=>({contents:'export const toast={success(){},error(){}}',loader:'js'}));
 b.onResolve({filter:/^@\//},({path:p})=>{let target=path.resolve('client/src',p.slice(2));return{path:fs.existsSync(target+'.tsx')?target+'.tsx':target+'.ts'};});
}}]});
function fixtureSetup(){
 window.qa={writes:[],failure:false,success:false};
 window.fetch=async(raw,init={})=>{
  const url=String(raw);let status=200,value;
  if(url==='/api/platform/visitor/data'){status=401;value={ok:false};}
  else if(url.startsWith('/api/platform/visitor/invite?'))value={ok:true,visitor:{email:'visitor@example.invalid',displayName:'Visitante fictício'}};
  else if(['/api/platform/visitor/accept','/api/platform/visitor/login'].includes(url)){
   window.qa.writes.push({url,body:JSON.parse(init.body)});
   status=window.qa.failure?429:401;value={ok:false,code:window.qa.failure?'LOGIN_THROTTLED':'INVALID',message:window.qa.failure?'Muitas tentativas. Aguarde 890 segundos.':'server-private-diagnostic'};
  }else throw Error('Unexpected request '+url);
  return{ok:status<400,status,json:async()=>value};
 };
}
const styles=fs.readFileSync('client/src/visitor-v13-8.css','utf8')+'\n'+fs.readFileSync('client/src/pages/visitor-access.css','utf8');
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · Acesso visitante</title><style>${styles}</style><div id="root"></div><script>(${fixtureSetup.toString()})();</script><script src="/fixture.js"></script></html>`;
if(process.argv.includes('--serve')){http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html);}).listen(4180,'127.0.0.1',()=>console.log('Synthetic visitor QA http://127.0.0.1:4180/?token=synthetic; intercepted requests only'));}
else{
const {JSDOM}=createRequire(process.env.VISITOR_JSDOM_PACKAGE||import.meta.url)('jsdom');
for(const invite of [true,false]){
 const dom=new JSDOM(html.replace('<script src="/fixture.js"></script>',''),{url:'https://fixture.invalid/visitor'+(invite?'?token=synthetic':''),runScripts:'dangerously',pretendToBeVisual:true});const w=dom.window;w.eval(bundle.outputFiles[0].text);const d=w.document;
 const wait=async(fn)=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');};
 const fill=(id,value)=>{const el=d.getElementById(id);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=()=>d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 try{
 await wait(()=>d.querySelector('form'));assert.equal(w.qa.writes.length,0,'mount never submits');assert.equal(d.getElementById('visitor-email').autocomplete,'username');
 const id=invite?'visitor-new':'visitor-password';let input=d.getElementById(id);assert.equal(input.type,'password');assert.equal(input.maxLength,256);assert.equal(input.autocomplete,invite?'new-password':'current-password');
 const eye=()=>d.querySelector(`button[aria-controls="${id}"]`);assert.equal(eye().type,'button');eye().click();await wait(()=>input.type==='text');assert.equal(eye().getAttribute('aria-pressed'),'true');assert.equal(w.qa.writes.length,0);eye().click();await wait(()=>input.type==='password');
 if(invite){assert.equal(input.minLength,10);assert.equal(input.getAttribute('aria-describedby'),'visitor-password-rule');assert(d.getElementById('visitor-password-rule').textContent.includes('Símbolos são opcionais'));fill('visitor-temporary','Temp123456!');fill(id,'abc123');await new Promise(r=>setTimeout(r,0));submit();await wait(()=>d.querySelector('[role=alert]'));assert.equal(w.qa.writes.length,0,'six chars cannot silently lower existing policy');fill(id,'abcdefghij');}
 else{fill('visitor-email','visitor@example.invalid');fill(id,'abcdefghij');assert(d.querySelector('summary').textContent.includes('Esqueci'));}
 await new Promise(r=>setTimeout(r,0));submit();submit();await wait(()=>w.qa.writes.length===1);await wait(()=>!d.querySelector('form').getAttribute('aria-busy')||d.querySelector('form').getAttribute('aria-busy')==='false');assert(d.querySelector('[role=alert]').textContent.includes('Confira'));assert(!d.getElementById('root').textContent.includes('server-private-diagnostic'));assert.equal(w.qa.writes[0].body[invite?'newPassword':'password'],'abcdefghij','symbols not required; exact password preserved');
 w.qa.failure=true;submit();await wait(()=>w.qa.writes.length===2);await wait(()=>d.querySelector('[role=alert]')?.textContent.includes('Aguarde alguns minutos'));await new Promise(r=>setTimeout(r,30));assert.equal(w.qa.writes.length,2,'no automatic retry');assert.equal(d.getElementById(id).value,'abcdefghij','failed request preserves correction');
 console.log('PASS actual visitor UI: '+(invite?'invite':'login')+' masked/reveal, autofill, policy, single submit, short errors, throttle, no retry');
 }finally{w.close();}
}
}
