import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {INTER_CSS,describeFontRequest,createFontDiagnostics,withFontDiagnostics} from './lib/roster-font-diagnostics.mjs';

const font='https://fonts.gstatic.com/s/inter/v99/synthetic.woff2';
class Context extends EventEmitter {
 closed=false;
 pages(){return [{evaluate:async()=>({faces:[{family:'Inter',status:'error',weight:'700'}]})}];}
 async close(){this.closed=true;}
}

test('rejected font, failed request and bounded exact CSS survive failure before context close',async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'roster-font-diagnostics-'));
 try{
  const context=new Context(),diagnostic=createFontDiagnostics(context,{output,width:1440,theme:'dark',scale:2,browserVersion:'synthetic-offline'});
  const original=new Error('synthetic font load failure');
  const rejected=font+'?sensitive=DO_NOT_PERSIST';
  await assert.rejects(withFontDiagnostics(context,diagnostic,async()=>{
   diagnostic.route(rejected,false);
   diagnostic.route('https://private.invalid/personal/DO_NOT_PERSIST?token=DO_NOT_PERSIST',false);
   context.emit('requestfailed',{url:()=>rejected,failure:()=>({errorText:'net::ERR_FAILED'})});
   context.emit('response',{url:()=>INTER_CSS,status:()=>200,body:async()=>Buffer.from('/* synthetic CSS */'+'x'.repeat(40000))});
   throw original;
  }),error=>error===original);
  assert.equal(context.closed,true);
  const raw=await fs.readFile(path.join(output,'font-diagnostics-1440-dark-2.json'),'utf8'),report=JSON.parse(raw);
  assert.equal(raw.includes('DO_NOT_PERSIST'),false);
  assert.deepEqual(report.events[0],{kind:'route',category:'inter-font',url:font,queryRedacted:true,allowed:false});
  assert.deepEqual(report.events[1],{kind:'route',category:'other-external',destinationRedacted:true,allowed:false});
  assert.equal(report.events[2].error,'net::ERR_FAILED');
  const css=report.events[3].css;
  assert.equal(report.events[3].status,200);assert.equal(css.capturedBytes,32768);assert.equal(css.truncated,true);
  assert.equal(css.sha256Captured,createHash('sha256').update(Buffer.from(css.text)).digest('hex'));
  assert.equal(report.fonts[0].faces[0].status,'error');
 }finally{await fs.rm(output,{recursive:true,force:true});}
});

test('CSS body failure is visible; other responses never have bodies collected; event count bounded',async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'roster-font-diagnostics-'));
 try{
  const context=new Context(),diagnostic=createFontDiagnostics(context,{output,width:320,theme:'light',scale:1,browserVersion:'synthetic-offline'});
  let bodyReads=0;
  await withFontDiagnostics(context,diagnostic,async()=>{
   context.emit('response',{url:()=>INTER_CSS,status:()=>200,body:async()=>{throw Error('synthetic body unavailable');}});
   for(const url of [font,INTER_CSS+'&token=private','https://private.invalid/token'])context.emit('response',{url:()=>url,status:()=>403,body:async()=>{bodyReads++;throw Error('must never read');}});
   for(let i=0;i<150;i++)diagnostic.route('https://private.invalid/?token=private',false);
  });
  const report=JSON.parse(await fs.readFile(path.join(output,'font-diagnostics-320-light-1.json'),'utf8'));
  assert.equal(bodyReads,0);assert.deepEqual(report.events[0].css,{unavailable:true});
  assert.equal(report.events.length,128);assert.ok(report.dropped>0);assert.equal(context.closed,true);
  assert.deepEqual(describeFontRequest(INTER_CSS+'&token=private'),{category:'other-external',destinationRedacted:true});
 }finally{await fs.rm(output,{recursive:true,force:true});}
});

test('actual harness guard and mandatory Inter assertions retain original bytes and reject other external requests',async()=>{
 const source=await fs.readFile(new URL('./regression-roster-legend-browser.mjs',import.meta.url),'utf8');
 // Fingerprints pin the original a6de310/e9446e0 policy and font acceptance checks.
 const guard=source.match(/const shippingFont=(.*?);if\(url.origin===origin\)/)[1];
 assert.equal(createHash('sha256').update(guard).digest('hex'),'55f107713edab877c90545f7ea64b2f3ee370ba2936b9fce917b9c80676b9e32');
 const assertions=source.split('\n').filter(line=>line.includes('const homeFont=await fontCheck')||line.includes("const fonts=await fontCheck")||line.includes('const fontCheck=async')).join('\n');
 assert.equal(createHash('sha256').update(assertions).digest('hex'),'660c06175cd1ed93050adff99184cffb2083b27c9f4ffa2ad828472c9ce19a5e');
 const allowed=url=>vm.runInNewContext(guard,{url:new URL(url)});
 assert.equal(allowed(INTER_CSS),true);assert.equal(allowed(font),true);
 for(const url of [font+'?token=private',font.replace('.woff2','.ttf'),font.replace('synthetic','sub/file'),INTER_CSS+'&extra=1','https://private.invalid/'])assert.equal(allowed(url),false);
});

 test('cleanup failures do not replace the original regression failure',async()=>{
 const original=new Error('synthetic regression failure');
 const context={close:async()=>{throw Error('synthetic close failure');}};
 const diagnostics={save:async()=>{throw Error('synthetic disk failure');}};
 await assert.rejects(withFontDiagnostics(context,diagnostics,async()=>{throw original;}),error=>error===original);
 });

test('never-resolving CSS and FontFaces are bounded, persisted and cannot hide the original error', {timeout:6000}, async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'roster-font-diagnostics-'));
 try{
  const context=new Context();context.pages=()=>[{evaluate:()=>new Promise(()=>{})}];
  const diagnostic=createFontDiagnostics(context,{output,width:1440,theme:'dark',scale:2,browserVersion:'synthetic-offline'});
  const original=new Error('ORIGINAL');
  await assert.rejects(withFontDiagnostics(context,diagnostic,async()=>{
   context.emit('response',{url:()=>INTER_CSS,status:()=>200,body:()=>new Promise(()=>{})});
   throw original;
  }),error=>error===original);
  assert.equal(context.closed,true);
  const report=JSON.parse(await fs.readFile(path.join(output,'font-diagnostics-1440-dark-2.json'),'utf8'));
  assert.deepEqual(report.events[0].css,{unavailable:true,timeout:true});
  assert.deepEqual(report.fonts,[{unavailable:true,timeout:true}]);
 }finally{await fs.rm(output,{recursive:true,force:true});}
});

test('late CSS/FontFaces completion and rejection do not mutate persisted timeout evidence', {timeout:6000}, async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'roster-font-diagnostics-'));
 try{
  let resolveBody,rejectBody,resolveFaces;
  const body=new Promise(resolve=>{resolveBody=resolve;});
  const rejectedBody=new Promise((_,reject)=>{rejectBody=reject;});
  const faces=new Promise(resolve=>{resolveFaces=resolve;});
  const context=new Context();context.pages=()=>[{evaluate:()=>faces}];
  const diagnostic=createFontDiagnostics(context,{output,width:320,theme:'light',scale:1,browserVersion:'synthetic-offline'});
  await withFontDiagnostics(context,diagnostic,async()=>{
   for(const pending of [body,rejectedBody])context.emit('response',{url:()=>INTER_CSS,status:()=>200,body:()=>pending});
  });
  const file=path.join(output,'font-diagnostics-320-light-1.json');
  const persisted=await fs.readFile(file,'utf8'),before=JSON.parse(persisted);
  resolveBody(Buffer.from('late synthetic CSS'));rejectBody(Error('late synthetic rejection'));
  resolveFaces({faces:[{family:'Inter',status:'loaded',weight:'700'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.closed,true);
  assert.equal(await fs.readFile(file,'utf8'),persisted);
  // Re-serialize the same diagnostic objects to expose any late mutation in memory.
  await diagnostic.save();
  const after=JSON.parse(await fs.readFile(file,'utf8'));
  assert.deepEqual(after.events,before.events);
  assert.deepEqual(before.events.map(event=>event.css),[{unavailable:true,timeout:true},{unavailable:true,timeout:true}]);
  assert.deepEqual(before.fonts,[{unavailable:true,timeout:true}]);
 }finally{await fs.rm(output,{recursive:true,force:true});}
});

test('failed regression logs only bounded sanitized categories, outcomes and Inter faces',async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'roster-font-summary-'));
 const logged=[],prior=console.error;console.error=(...args)=>logged.push(args);
 try {
  const context=new Context();context.pages=()=>[{evaluate:async()=>({faces:Array.from({length:30},(_,i)=>({family:'Inter',status:i===0?'SECRET_FACE_STATUS':'error',weight:'SECRET_FACE_VALUE'}))})}];
  const diagnostic=createFontDiagnostics(context,{output,width:320,theme:'light',scale:1,browserVersion:'SECRET_BROWSER_VALUE'});
  const original=Error('SECRET_ORIGINAL_ERROR');
  await assert.rejects(withFontDiagnostics(context,diagnostic,async()=>{
   diagnostic.route(font+'?token=SECRET_QUERY_VALUE',false);
   context.emit('response',{url:()=>INTER_CSS,status:()=>200,body:async()=>Buffer.from('SECRET_CSS_BODY')});
   context.emit('requestfailed',{url:()=>font,failure:()=>({errorText:'net::ERR_CONNECTION_FAILED'})});
   context.emit('requestfailed',{url:()=>font,failure:()=>({errorText:'net::ERR_SECRET_ERROR_VALUE'})});
   context.emit('response',{url:()=>font,status:()=> 'SECRET_STATUS_VALUE',body:async()=>{assert.fail('non-CSS body must not be read');}});
   for(let i=0;i<180;i++)diagnostic.route('https://private.invalid/SECRET_PATH_VALUE?token=SECRET_TOKEN_VALUE',false);
   throw original;
  }),error=>error===original);
  const entry=logged.find(args=>args[0]==='[roster-font-diagnostics]');assert(entry,'failed regression must log diagnostic summary');
  const encoded=entry[1],summary=JSON.parse(encoded);
  assert(encoded.length<4096);assert.doesNotMatch(encoded,/SECRET_|https?:|\?|headers|cookies|token|payload/i);
  assert.equal(summary.events.length,16);assert(summary.omittedEvents>0);assert(summary.droppedEvents>0);
  assert.deepEqual(summary.events[0],{kind:'route',category:'inter-font',allowed:false});
  assert.deepEqual(summary.events[1],{kind:'response',category:'inter-css',status:200});
  assert.equal(summary.events[2].code,'net::ERR_CONNECTION_FAILED');assert.equal(summary.events[3].code,'other-network-error');
  assert.deepEqual(summary.events[4],{kind:'response',category:'inter-font'});
  assert.equal(summary.fontFaces.length,8);assert.equal(summary.omittedFontFaces,22);
  assert.deepEqual(summary.fontFaces[0],{family:'Inter',status:'unknown'});assert.deepEqual(summary.fontFaces[1],{family:'Inter',status:'error'});assert.equal(context.closed,true);
 }finally{console.error=prior;await fs.rm(output,{recursive:true,force:true});}
});

test('successful regression does not log a failure summary',async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'roster-font-summary-'));
 const logged=[],prior=console.error;console.error=(...args)=>logged.push(args);
 try{
  const context=new Context(),diagnostic=createFontDiagnostics(context,{output,width:320,theme:'light',scale:1,browserVersion:'synthetic'});
  await withFontDiagnostics(context,diagnostic,async()=>{});
  assert.equal(logged.length,0);assert.equal(context.closed,true);
 }finally{console.error=prior;await fs.rm(output,{recursive:true,force:true});}
});
