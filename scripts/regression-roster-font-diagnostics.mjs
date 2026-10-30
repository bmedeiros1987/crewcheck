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
