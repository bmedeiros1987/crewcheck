import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {INTER_CSS,describeFontRequest,createFontDiagnostics,withFontDiagnostics} from './lib/roster-font-diagnostics.mjs';
import {createInterFontPolicy,interFontDeclarations,interAcquisitionFailure} from './lib/roster-inter-policy.mjs';

const dynamic='https://fonts.gstatic.com/l/font?kit=synthetic_123&skey=0123456789abcdef&v=v99';
const cssFor=url=>`@font-face{font-family:'Inter';font-style:normal;font-weight:700;src:url('${url}') format('woff2');}`;
for(const [name,css] of [
 ['local fallback',cssFor(dynamic).replace('src:','src:local("Arial"),')],
 ['duplicate weight',cssFor(dynamic).replace('font-weight:700;','font-weight:700;font-weight:300;')],
 ['duplicate family',cssFor(dynamic).replace("font-family:'Inter';","font-family:'Inter';font-family:Arial;")],
 ['outside override',cssFor(dynamic)+'body{font-family:Arial!important}'],
])test(`whole CSS rejects ${name}`,()=>assert.throws(()=>interFontDeclarations(css)));
test('official-shaped Inter blocks preserve all shipping weights, swap and Unicode subsets',()=>{
 const css='/* latin subset */\n'+[400,500,600,700,800,900].map(weight=>cssFor(dynamic)
  .replace('font-weight:700;',`font-weight:${weight};font-display:swap;`)
  .replace(/}$/, 'unicode-range:U+0000-00FF, U+0131, U+1F??;}')).join('\n/* another weight */\n');
 assert.deepEqual([...interFontDeclarations(css)],[dynamic]);
 for(const malformed of [cssFor(dynamic).replace('src:','SRC:local("Arial"),'),
  cssFor(dynamic).replace('700;','700!important;'),cssFor(dynamic).replace('700;','700;FONT-WEIGHT:700;'),
  cssFor(dynamic).replace('700;','700;font-display:swap;font-display:block;'),
  cssFor(dynamic).replace('700;','700;unicode-range:U+0000-00FF;unicode-range:U+0100-FFFF;'),
  cssFor(dynamic)+'@media all{}',cssFor(dynamic).replace('700;','7/* comment */00;')])
  assert.throws(()=>interFontDeclarations(malformed));
});
const request=(url,method='GET')=>({url:()=>url,method:()=>method});
const response=(href,{status=200,type=href===INTER_CSS?'text/css':'font/woff2',body=href===INTER_CSS?Buffer.from(cssFor(dynamic)):Buffer.from('synthetic font bytes, never rendering acceptance')}={})=>({
 url:()=>href,status:()=>status,headers:()=>({'content-type':type,'access-control-allow-origin':'*'}),body:async()=>body,dispose:async()=>{},
});
test('one acquisition replays identical bytes through all combinations, never a second external fetch',async()=>{
 const policy=createInterFontPolicy();let calls=0;const returned=[];
 assert.equal(policy.allows(request(dynamic)),false,'undeclared font fails closed');
 const fetch=async(href,options)=>{
  calls++;assert.ok(calls<=2,'simulated second acquisition would fail');
  assert.deepEqual(JSON.parse(JSON.stringify(options)),{maxRedirects:0,maxRetries:0,timeout:10000});
  const result=response(href);returned.push(await result.body());return result;
 };
 const first=policy.acquire(fetch);assert.equal(policy.acquire(fetch),first,'single shared in-flight acquisition');
 const manifest=await first;assert.equal(calls,2);assert.equal(manifest.length,2);
 for(const body of returned)body.fill(0); // Fetched buffers are not the private snapshot.
 assert.equal(policy.allows(request(dynamic)),true);assert.equal(policy.allows(request(INTER_CSS)),true);
 for(const url of [dynamic+'&extra=1',dynamic+'#fragment','https://fonts.gstatic.com/s/inter/v99/undeclared.woff2',INTER_CSS+'&extra=1'])assert.equal(policy.allows(request(url)),false);
 assert.equal(policy.allows(request(dynamic,'POST')),false);
 for(let combination=0;combination<8;combination++)for(const href of [INTER_CSS,dynamic]){
  const index=href===INTER_CSS?0:1;
  assert.equal(await policy.handle({request:()=>request(href),fetch:async()=>assert.fail('replay must not acquire'),fulfill:async result=>{
   assert.equal(result.status,200);assert.deepEqual(result.headers,index===1?{'access-control-allow-origin':'*'}:{});
   assert.equal(createHash('sha256').update(result.body).digest('hex'),manifest[index].sha256);
   result.body.fill(0); // A consumer cannot mutate the next replay.
  }}),true);
 }
 assert.equal(calls,2);assert.equal(await policy.handle({request:()=>request(dynamic,'POST')}),false);
 assert.deepEqual(describeFontRequest(dynamic),{category:'inter-font',url:'https://fonts.gstatic.com/l/font',queryRedacted:true});
});
test('declarations reject malicious origin/path/query/credentials and unrelated CSS',()=>{
 for(const url of [
  dynamic.replace('fonts.gstatic.com','fonts.gstatic.com.evil.invalid'),
  dynamic.replace('https:','http:'),dynamic.replace('fonts.gstatic.com','user:pass@fonts.gstatic.com'),
  dynamic.replace('fonts.gstatic.com','fonts.gstatic.com:444'),dynamic+'#fragment',
  dynamic+'&token=synthetic',dynamic+'&kit=duplicate',dynamic.replace('/l/font','/l/other'),
  dynamic.replace('kit=synthetic_123','kit=%2Fsecret'),
  'https://fonts.gstatic.com/s/inter/v99/synthetic.woff2?extra=1',
 ])assert.throws(()=>interFontDeclarations(cssFor(url)));
 for(const css of [cssFor(dynamic).replace('Inter','Other'),cssFor(dynamic).replace('700','300'),
  cssFor(dynamic)+`body{background:url('${dynamic}')}`,`@import '${INTER_CSS}';`+cssFor(dynamic),
  '/* '+cssFor(dynamic)+' */','x'.repeat(32769)])assert.throws(()=>interFontDeclarations(css));
});
test('acquisition failures distinguish transport/status/MIME without URL, header or error text',async()=>{
 for(const asset of ['stylesheet','font'])for(const flaw of ['transport','status','mime','redirect','body']){
  const policy=createInterFontPolicy();let calls=0;
  const fetch=async href=>{
   calls++;const selected=(href===INTER_CSS?'stylesheet':'font')===asset;
   if(!selected)return response(href);
   if(flaw==='transport')throw Error('SECRET_URL?token=SECRET_TOKEN');
   const value=response(href,{status:flaw==='status'?503:200,type:flaw==='mime'?'text/html; SECRET_HEADER':href===INTER_CSS?'text/css':'font/woff2'});
   if(flaw==='redirect')value.url=()=> 'https://private.invalid/SECRET_URL';
   if(flaw==='body')value.body=async()=>{throw Error('SECRET_BODY_ERROR');};
   return value;
  };
  const pending=policy.acquire(fetch);
  await assert.rejects(pending,error=>{
   const diagnostic=interAcquisitionFailure(error);
   assert.equal(diagnostic.asset,asset);assert.equal(diagnostic.category,flaw==='body'?'transport':flaw);
   if(flaw==='transport')assert.deepEqual(diagnostic,{asset,category:'transport',stage:'fetch'});
   else {assert.equal(diagnostic.status,flaw==='status'?503:200);assert.equal(diagnostic.mime,flaw==='mime'?'other':asset==='stylesheet'?'text/css':'font/woff2');}
   assert.doesNotMatch(JSON.stringify(diagnostic),/SECRET|https:|token|header/i);return true;
  });
  assert.equal(policy.allows(request(INTER_CSS)),false,'partial assets cannot escape failed acquisition');
  assert.equal(policy.allows(request(dynamic)),false);
  assert.equal(policy.acquire(fetch),pending,'failure retained without retry');
  await assert.rejects(pending);assert.equal(calls,asset==='stylesheet'?1:2);
 }
 assert.deepEqual(interAcquisitionFailure(Error('private')),{asset:'unknown',category:'unknown'});
});
test('CSS rejection and invalid metadata remain sanitized, without partial replay',async()=>{
 for(const flaw of ['css','status','mime','empty','size']){
  const policy=createInterFontPolicy();
  await assert.rejects(policy.acquire(async href=>response(href,{
   ...(flaw==='status'?{status:99999}:{}),...(flaw==='mime'?{type:''}:{}),
   body:Buffer.from(flaw==='css'?cssFor(dynamic)+'body{font-family:Arial}':flaw==='empty'?'':flaw==='size'?'x'.repeat(32769):cssFor(dynamic)),
  })),error=>{
   const d=interAcquisitionFailure(error);assert.equal(d.category,flaw);assert.equal(d.asset,'stylesheet');
   if(flaw==='status')assert.equal('status' in d,false);return true;
  });
  assert.equal(await policy.handle({request:()=>request(INTER_CSS)}),false);
 }
});
for(const corp of ['same-origin','same-site'])test(`shipping external CSS rejects restrictive CORP ${corp} before replay`,async()=>{
 const policy=createInterFontPolicy();let calls=0;
 await assert.rejects(policy.acquire(async href=>{
  calls++;const value=response(href);value.headers=()=>({'content-type':'text/css','cross-origin-resource-policy':corp});return value;
 }),error=>{assert.deepEqual(interAcquisitionFailure(error),{asset:'stylesheet',category:'corp',status:200,mime:'text/css'});return true;});
 assert.equal(calls,1,'do not acquire font bytes after blocked CSS');
 assert.equal(policy.allows(request(INTER_CSS)),false);
 assert.equal(await policy.handle({request:()=>request(INTER_CSS),fulfill:async()=>assert.fail('blocked CSS must not replay')}),false);
});
test('font replay cannot manufacture CORS permission absent from the acquired response',async()=>{
 for(const cors of [undefined,'https://private.invalid','null']){
  const policy=createInterFontPolicy();
  await assert.rejects(policy.acquire(async href=>{
   const value=response(href);if(href!==INTER_CSS)value.headers=()=>({'content-type':'font/woff2',...(cors===undefined?{}:{'access-control-allow-origin':cors})});
   return value;
  }),error=>{assert.deepEqual(interAcquisitionFailure(error),{asset:'font',category:'cors',status:200,mime:'font/woff2'});return true;});
  assert.equal(policy.allows(request(dynamic)),false);
 }
});
test('never-resolving acquisition body times out; late completion cannot publish partial bytes',async()=>{
 const policy=createInterFontPolicy();let release,calls=0;
 const pending=policy.acquire(async href=>{calls++;const value=response(href);value.body=()=>new Promise(resolve=>{release=resolve;});return value;});
 await assert.rejects(pending,error=>{
  assert.deepEqual(interAcquisitionFailure(error),{asset:'stylesheet',category:'transport',status:200,mime:'text/css',stage:'body-timeout'});return true;
 });
 release(Buffer.from(cssFor(dynamic)));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(policy.allows(request(INTER_CSS)),false);assert.equal(calls,1);
 assert.equal(policy.acquire(async()=>assert.fail('no retry')),pending);await assert.rejects(pending);
});

test('actual setup block closes isolated context, persists sanitized outcomes and stops on acquisition failure',async()=>{
 const source=await fs.readFile(new URL('./regression-roster-legend-browser.mjs',import.meta.url),'utf8');
 const block=source.slice(source.indexOf(' const fontPolicy=createInterFontPolicy();'),source.indexOf(' for(const width'));
 for(const mode of ['success','transport','mime','evidence-write-failure']){
  let closed=false,calls=0;const writes=[],logs=[];
  const setup={newPage:async()=>({evaluate:async()=> 'synthetic-browser-agent'}),close:async()=>{closed=true;},request:{get:async(href,options)=>{
   calls++;assert.deepEqual(JSON.parse(JSON.stringify(options)),{maxRedirects:0,maxRetries:0,timeout:10000,headers:{'user-agent':'synthetic-browser-agent'}});
   if(href!==INTER_CSS&&mode!=='success'){
    if(mode==='mime')return response(href,{type:'text/html; SECRET_HEADER'});
    throw Error('SECRET_URL?token=SECRET_TOKEN');
   }
   return response(href);
  }}};
  const run=new vm.Script('(async()=>{'+block+';return fontPolicy;})()');
  const pending=run.runInNewContext({createInterFontPolicy,interAcquisitionFailure,browser:{newContext:async()=>setup},
   fs:{writeFileSync:(file,text)=>{if(mode==='evidence-write-failure')throw Error('synthetic disk unavailable');writes.push(JSON.parse(text));}},
   console:{error:(...args)=>logs.push(args.join(' '))},path,output:'/synthetic'});
  if(mode==='success'){
   const policy=await pending;assert.equal(policy.allows(request(dynamic)),true);assert.equal(writes[0].status,'acquired');assert.equal(logs.length,0);
  }else{
   await assert.rejects(pending,error=>error.message==='Shipping Inter acquisition failed: '+(mode==='mime'?'mime':'transport'));
   assert.match(logs[0],mode==='mime'?/"category":"mime"/:/"category":"transport"/);
   if(mode==='evidence-write-failure')assert.equal(logs[1],'[roster-font-acquisition] evidence-unavailable');
   else assert.equal(writes[0].status,'failed');
  }
  assert.equal(closed,true);assert.equal(calls,2);
  assert.doesNotMatch(JSON.stringify({writes,logs}),/SECRET|https:|token=|user-agent/);
 }
});

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

test('actual harness uses declaration policy and mandatory Inter assertions retain original bytes',async()=>{
 const source=await fs.readFile(new URL('./regression-roster-legend-browser.mjs',import.meta.url),'utf8');
 // Acceptance checks retain original bytes; routing intentionally uses the closed declaration policy.
 assert.match(source,/const fontPolicy=createInterFontPolicy\(\);/);
 assert.match(source,/const shippingFont=fontPolicy.allows\(route.request\(\)\)/);
 assert.match(source,/await fontPolicy.handle\(route\)/);
 assert.ok(source.indexOf('await fontPolicy.acquire(')<source.indexOf('for(const width'),'acquisition finishes before matrix');
 assert.equal([...source.matchAll(/fontPolicy.acquire\(/g)].length,1,'one acquisition entry point');
 assert.equal([...source.matchAll(/createInterFontPolicy\(/g)].length,1,'one shared snapshot policy');
 const assertions=source.split('\n').filter(line=>line.includes('const homeFont=await fontCheck')||line.includes("const fonts=await fontCheck")||line.includes('const fontCheck=async')).join('\n');
 assert.equal(createHash('sha256').update(assertions).digest('hex'),'660c06175cd1ed93050adff99184cffb2083b27c9f4ffa2ad828472c9ce19a5e');
 const allowed=url=>createInterFontPolicy().allows({url:()=>url,method:()=> 'GET'});
 assert.equal(allowed(INTER_CSS),false);assert.equal(allowed(font),false,'even static assets require stylesheet declaration');
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
