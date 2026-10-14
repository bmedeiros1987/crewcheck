// Benign contract fixtures only; no WebView/iframe exploit or external request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { transformSync } from 'esbuild';
let checks=0;
function ok(value,label){assert(value,label);checks++;}
const main=fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','utf8');
const globalBridge=main.slice(main.indexOf('public class CrewCheckNativeBridge'),main.indexOf('public class CrewCheckIFlightBridge'));
ok(!/public\s+(?:String|boolean)\s+(?:reportSharedPdfSession|claimSharedPdf|blockSharedPdf|beginSharedPdfCommit|confirmSharedPdfCommit|readClaimedSharedPdfChunk|acknowledgeClaimedSharedPdf|readSharedPdfChunk|sharedPdfStatus|acknowledgeSharedPdf)\(/.test(main),'no PDF global methods remain');
ok(main.includes('WebViewCompat.addWebMessageListener')&&main.includes('WebViewFeature.WEB_MESSAGE_LISTENER'),'feature-gated restricted listener');
ok(main.includes('if (!isMainFrame || !SharedPdfChannelPolicy.allowedOrigin(origin)) return;')&&main.includes('raw.length() > 32768'),'origin/frame and size checked before parsing');
ok(main.includes('acceptsDocument(origin, isMainFrame, document)'),'real listener requires document/origin/main frame');
ok(!main.includes('request.optString("owner"'),'owner is never read from a request');
ok(main.includes('pdfSessionExecutor.shutdownNow()'),'PDF executor closes with Activity');
const source=fs.readFileSync('client/src/lib/sharedPdfChannel.ts','utf8').replace(/^import .*;\n/gm,'');
function fixture({supported=true,serverOwner='A',signedIn=true}={}){
 const state={owner:'A',token:signedIn?'synthetic-token':null,epoch:1,phase:'unclaimed',requests:[],deferred:[],delay:false};let serial=0;
 const events=new Map(),timers=new Map();
 const window={__crewcheckPdfDocument:'document-1',addEventListener:(n,f)=>{const list=events.get(n)||[];list.push(f);events.set(n,list);},dispatchEvent:e=>{for(const f of events.get(e.type)||[])f(e);}};window.top=window;
 const bridge={onmessage:null,postMessage:raw=>{const request=JSON.parse(raw);state.requests.push(request);assert.equal(request.owner,undefined);let result=false;if(request.op==='bind'){state.epoch++;result=serverOwner;}else if(request.op==='logout'){state.epoch++;}else if(request.epoch===state.epoch){if(request.op==='status')result={shareId:'receipt-1',owner:serverOwner,phase:state.phase,ownershipProtocol:'mainframe-host-session-v2'};else if(request.op==='claim'){state.phase='claimed';result=true;}else if(request.op==='read')result='JVBERg==';else result=true;}const response={id:request.id,document:request.document,epoch:state.epoch,result};const deliver=()=>bridge.onmessage?.({data:JSON.stringify(response)});if(state.delay&&request.op==='read')state.deferred.push({deliver,response});else queueMicrotask(deliver);}};
 if(supported)window.CrewCheckPdfChannel=bridge;
 const context=vm.createContext({module:{exports:{}},window,getToken:()=>state.token,getStoredUser:()=>({id:state.owner}),crypto:{randomUUID:()=>String(++serial)},setTimeout:f=>{timers.set(++serial,f);return serial;},clearTimeout:id=>timers.delete(id),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}});
 vm.runInContext(transformSync(source,{loader:'ts',format:'cjs'}).code,context);
 return{state,window,bridge,api:context.module.exports,event:type=>window.dispatchEvent({type})};
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const f=fixture();await settle();ok(f.api.sharedPdfChannelStatus()?.owner==='A','verified owner/session status');
ok(await f.api.sharedPdfChannelCall('claim','receipt-1')===true,'async claim');ok(f.api.sharedPdfChannelStatus()?.phase==='claimed','refresh durable phase after claim');
ok(await f.api.sharedPdfChannelCall('read','receipt-1',{offset:0,length:5})==='JVBERg==','correlated read');
f.state.delay=true;const delayed=f.api.sharedPdfChannelCall('read','receipt-1');await settle();f.event('crewcheck:auth-will-change');ok(await delayed===false,'logout clears outstanding read');f.state.deferred[0].deliver();await settle();ok(f.api.sharedPdfChannelStatus()===null,'late response cannot restore session');
const unsupported=fixture({supported:false});await settle();ok(await unsupported.api.sharedPdfChannelCall('read','receipt-1')===false,'unsupported channel uses manual path');
const mismatch=fixture({serverOwner:'B'});await settle();ok(mismatch.api.sharedPdfChannelStatus()===null,'server identity mismatch rejected');
const signedOut=fixture({signedIn:false});await settle();ok(await signedOut.api.sharedPdfChannelCall('claim','receipt-1')===false,'signed out cannot claim');
const stale=fixture();await settle();stale.state.delay=true;const request=stale.api.sharedPdfChannelCall('read','receipt-1');await settle();stale.window.__crewcheckPdfDocument='document-2';stale.state.deferred[0].deliver();await settle();stale.event('pagehide');ok(await request===false,'old document reply discarded');
const changed=fixture();await settle();changed.state.delay=true;const reading=changed.api.sharedPdfChannelCall('read','receipt-1');await settle();changed.state.token='different-synthetic-token';changed.state.deferred[0].deliver();await settle();changed.event('crewcheck:auth-will-change');ok(await reading===false,'token change rejects prior response');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-channel-contract-'));
try{
 const java=process.env.SHARED_PDF_JAVA||'java';const directory=path.join(tmp,'com/crewcheck/app');fs.mkdirSync(directory,{recursive:true});
 fs.copyFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/SharedPdfChannelPolicy.java',path.join(directory,'SharedPdfChannelPolicy.java'));
 fs.writeFileSync(path.join(directory,'PolicyTest.java'),`package com.crewcheck.app;public class PolicyTest{static int n;static void ok(boolean v){if(!v)throw new AssertionError("policy fixture "+n);n++;}public static void main(String[]args){SharedPdfChannelPolicy p=new SharedPdfChannelPolicy();String origin="https://crewcheck.online";ok(SharedPdfChannelPolicy.allowedOrigin(origin));for(String s:new String[]{"http://crewcheck.online","https://crewcheck.online:444","https://crewcheck.online/path","https://crewcheck.online.evil.invalid","https://user@crewcheck.online","null","https://localhost"})ok(!SharedPdfChannelPolicy.allowedOrigin(s));p.invalidate("document-1",origin);ok(p.begin(origin,false,"document-1")==-1);ok(p.begin("https://www.crewcheck.online",true,"document-1")==-1);ok(p.begin(origin,true,"old-document")==-1);long first=p.begin(origin,true,"document-1");ok(p.owner(first,10)==null);long second=p.begin(origin,true,"document-1");ok(!p.validate(first,"A",100,10));ok(p.validate(second,"A",100,10));ok("A".equals(p.owner(second,99)));ok(p.owner(second,100)==null);ok(p.owner(first,10)==null);p.invalidate("document-2",origin);ok(p.owner(second,10)==null);ok(!p.validate(second,"A",100,10));ok(!p.acceptsDocument(origin,true,"document-1"));System.out.println("PASS native channel policy: "+n+" benign contracts");}}`);
 cp.execFileSync(java,['com.sun.tools.javac.Main','-source','17','-target','17','-d',tmp,path.join(directory,'SharedPdfChannelPolicy.java'),path.join(directory,'PolicyTest.java')],{stdio:'inherit'});
 cp.execFileSync(java,['-cp',tmp,'com.crewcheck.app.PolicyTest'],{stdio:'inherit'});
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(`PASS PDF channel: ${checks} web/source benign contracts; no external transport`);
