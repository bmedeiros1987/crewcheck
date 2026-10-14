// Benign deterministic counterexamples. No WebView, network, credentials or PDF bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { transformSync } from 'esbuild';
const root=process.env.PDF_DEADLINE_ROOT||process.cwd();
let checks=0;const failures=[];
function check(value,label){checks++;if(!value)failures.push(label);}
const native=fs.readFileSync(root+'/scripts/shared-pdf-native-claim/message-channel.snippet','utf8');
const argument=native.match(/pdfChannelPolicy\.validate\(epoch, result.owner, (.*?), now\)/)?.[1];assert(argument,'actual callback deadline argument');
const callbackCondition=native.match(/if \(([^\n]*pdfChannelPolicy\.validate\(epoch, result.owner, [^\n]*?, now\))\) \{/)[1];
const policySource=fs.readFileSync(root+'/android-wrapper/app/src/main/java/com/crewcheck/app/SharedPdfChannelPolicy.java','utf8');
const calculation=policySource.includes('static long validationDeadline') ? `System.out.println("tokenDeadlineExact="+(SharedPdfChannelPolicy.validationDeadline(105000,100000,1000)==6000));System.out.println("maxLeaseExact="+(SharedPdfChannelPolicy.validationDeadline(300000,100000,1000)==121000));System.out.println("expiredTokenRejected="+(SharedPdfChannelPolicy.validationDeadline(100000,100000,1000)==-1));System.out.println("deadlineOverflowRejected="+(SharedPdfChannelPolicy.validationDeadline(300000,100000,Long.MAX_VALUE-1)==-1));` : `System.out.println("tokenDeadlineExact=false\\nmaxLeaseExact=false\\nexpiredTokenRejected=false\\ndeadlineOverflowRejected=false");`;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-absolute-deadline-'));
try{
 const directory=path.join(tmp,'com/crewcheck/app');fs.mkdirSync(directory,{recursive:true});
 fs.copyFileSync(root+'/android-wrapper/app/src/main/java/com/crewcheck/app/SharedPdfChannelPolicy.java',directory+'/SharedPdfChannelPolicy.java');
 fs.writeFileSync(directory+'/DeadlineTest.java',`package com.crewcheck.app;public class DeadlineTest{static class Attempt{boolean active(){return false;}}static class Result{String owner="A";long lifetimeMs,deadlineElapsedMs;Result(long duration,long deadline){lifetimeMs=duration;deadlineElapsedMs=deadline;}}public static void main(String[]args){SharedPdfChannelPolicy pdfChannelPolicy=new SharedPdfChannelPolicy();String origin="https://crewcheck.online";pdfChannelPolicy.invalidate("document",origin);long epoch=pdfChannelPolicy.begin(origin,true,"document");long now=10000;Result result=new Result(5000,6000);boolean applied=pdfChannelPolicy.validate(epoch,result.owner,${argument},now);System.out.println("expiredCallbackRejected="+!applied);epoch=pdfChannelPolicy.begin(origin,true,"document");result=new Result(120000,121000);applied=pdfChannelPolicy.validate(epoch,result.owner,${argument},now);System.out.println("originalCapPreserved="+(applied&&pdfChannelPolicy.owner(epoch,121000)==null));System.out.println("beforeOriginalCap="+(pdfChannelPolicy.owner(epoch,120999)!=null));epoch=pdfChannelPolicy.begin(origin,true,"document");Attempt attempt=new Attempt();System.out.println("expiredRequestCallbackRejected="+(${callbackCondition}));${calculation}}}`);
 const java=process.env.SHARED_PDF_JAVA||'java';cp.execFileSync(java,['com.sun.tools.javac.Main','-source','17','-target','17','-d',tmp,directory+'/SharedPdfChannelPolicy.java',directory+'/DeadlineTest.java'],{stdio:['ignore','pipe','pipe']});
 const result=cp.execFileSync(java,['-cp',tmp,'com.crewcheck.app.DeadlineTest'],{encoding:'utf8'});console.log(result.trim());for(const label of ['expiredCallbackRejected','originalCapPreserved','beforeOriginalCap','expiredRequestCallbackRejected','tokenDeadlineExact','maxLeaseExact','expiredTokenRejected','deadlineOverflowRejected'])check(result.includes(label+'=true'),label);
}catch(e){failures.push('native fixture: '+e.message);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
const source=fs.readFileSync(root+'/client/src/lib/sharedPdfChannel.ts','utf8').replace(/^import .*;\n/gm,'');
const harness=fs.readFileSync(root+'/scripts/regression-shared-pdf-channel.mjs','utf8');
const code=harness.slice(harness.indexOf('function fixture('),harness.indexOf('const settle=')).replace('return{state,window,bridge,api:', 'return{timers,state,window,bridge,api:');
const fixture=new Function('source','vm','transformSync','assert',code+';return fixture;')(source,vm,transformSync,assert);
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
for(const event of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','pagehide','storage','crewcheck:pdf-channel-ready']){
 const f=fixture();await settle();let emitted=0;f.window.addEventListener('crewcheck:native-pdf',()=>emitted++);
 f.window.__crewcheckPendingNativePdf={shareId:'old-receipt',owner:'A',sourceFileName:'Synthetic metadata only'};
 if(event==='crewcheck:pdf-channel-ready')f.window.__crewcheckPdfDocument='new-document';
 f.event(event);await settle();check(!f.window.__crewcheckPendingNativePdf,event+' clears transient metadata');check(emitted===0,event+' never replays old metadata');
}
const timeoutFixtureCode=code.replace("if(state.delay&&request.op==='read')","if(request.op==='bind'||(state.delay&&request.op==='read'))");
const timeoutFixture=new Function('source','vm','transformSync','assert',timeoutFixtureCode+';return fixture;')(source,vm,transformSync,assert)();
await settle();for(const timer of [...timeoutFixture.timers.values()])timer();await settle();
check(timeoutFixture.state.requests.some(r=>r.op==='cancel'&&r.cancelId),'web timeout sends correlated cancellation');
timeoutFixture.state.deferred[0].deliver();await settle();check(timeoutFixture.api.sharedPdfChannelStatus()===null,'late timed-out bind does not authorize');
console.log(JSON.stringify({checks,failures,callbackArgument:argument},null,2));
if(process.env.PDF_DEADLINE_REPORT)fs.writeFileSync(process.env.PDF_DEADLINE_REPORT,JSON.stringify({checks,failures,callbackArgument:argument},null,2));
if(failures.length)process.exitCode=1;
