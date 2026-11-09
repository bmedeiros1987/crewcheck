/** Lifecycle/signature tests only. Real pixel OCR is a separate browser CI gate. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
const built = await build({ entryPoints: ['client/src/lib/stayScreenshotOcr.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { inspectStayScreenshot, startStayScreenshotOcr, recognizeStayScreenshot } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const manifest = JSON.parse(await fs.readFile('docs/stay-screenshot/ocr-assets-manifest.json', 'utf8'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXxsAAAAASUVORK5CYII=', 'base64');
assert.deepEqual(inspectStayScreenshot(png, ''), { mime: 'image/png', width: 1, height: 1 });
assert.throws(() => inspectStayScreenshot(png, 'application/pdf'), error => error.code === 'unsupported');
assert.throws(() => inspectStayScreenshot(new Uint8Array([1, 2, 3])), error => error.code === 'unsupported');
const oversized = Buffer.from(png); oversized.writeUInt32BE(4000, 16); oversized.writeUInt32BE(4000, 20);
assert.throws(() => inspectStayScreenshot(oversized), error => error.code === 'too-large');
assert.throws(() => inspectStayScreenshot(new Uint8Array(10 * 1024 * 1024 + 1)), error => error.code === 'too-large');
const animated = Buffer.from(png); animated.write('acTL', 37);
assert.throws(() => inspectStayScreenshot(animated), error => error.code === 'unsupported');
const jpeg = Uint8Array.from([255,216,255,192,0,8,8,0,20,0,40,0,255,217]);
assert.deepEqual(inspectStayScreenshot(jpeg), { mime: 'image/jpeg', width: 40, height: 20 });
const webp = Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUInt32LE(10,16);webp[24]=39;webp[27]=19;
assert.deepEqual(inspectStayScreenshot(webp), { mime: 'image/webp', width: 40, height: 20 });
webp[20]=2;assert.throws(() => inspectStayScreenshot(webp), error => error.code === 'unsupported');
let closeCount=0;let workers=[];let mode='ok';let failureAction='';let requests=[];
globalThis.window={location:{origin:'https://crewcheck.example'}};
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){closeCount++;}});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:cb=>cb(new Blob([png],{type:'image/png'}))})};
class FakeWorker {
  constructor(url){this.url=String(url);this.terminated=0;workers.push(this);}
  terminate(){this.terminated++;}
  postMessage(packet){requests.push(packet);if(mode==='hang')return;queueMicrotask(()=>{
    if(this.terminated)return;
    if(mode==='error'){this.onerror?.({preventDefault(){}});return;}
    const rejected=packet.action===failureAction;
    this.onmessage?.({data:{...packet,status:rejected?'reject':'resolve',data:rejected?'SECRET OCR raw upstream failure':packet.action==='recognize'?{text:'synthetic lifecycle result',confidence:95}:{}}});
  });}
}
globalThis.Worker=FakeWorker;
const file=()=>new File([png],'synthetic.png',{type:'image/png'});
const waitFor=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,1));assert(predicate());};
let result=await startStayScreenshotOcr(file()).promise;
assert.equal(result.text,'synthetic lifecycle result');assert.equal(workers.at(-1).terminated,1);assert.equal(closeCount,1);
assert.equal(workers.at(-1).url,'https://crewcheck.example/ocr/v7/'+manifest.boundary.name);
assert.equal(requests.find(item=>item.action==='loadLanguage').payload.options.cacheMethod,'none');
assert.equal(requests.find(item=>item.action==='load').payload.options.logging,false);
assert.equal(requests.find(item=>item.action==='initialize').payload.oem,1);
assert.equal(requests.find(item=>item.action==='recognize').payload.image.every(byte=>byte===0),true,'main-thread input buffer scrubbed after worker completion');
const aborted=new AbortController();aborted.abort();await assert.rejects(recognizeStayScreenshot(file(),{signal:aborted.signal}),error=>error.code==='cancelled');
mode='hang';const previousWorkers=workers.length;const operation=startStayScreenshotOcr(file());const rejection=assert.rejects(operation.promise,error=>error.code==='cancelled');await waitFor(()=>workers.length>previousWorkers);operation.cancel();await rejection;assert.equal(workers.at(-1).terminated,1,'cancel terminates while core is loading');
mode='ok';failureAction='loadLanguage';await assert.rejects(startStayScreenshotOcr(file()).promise,error=>error.code==='unavailable'&&!error.message.includes('SECRET'));assert.equal(workers.at(-1).terminated,1);failureAction='';
mode='error';await assert.rejects(startStayScreenshotOcr(file()).promise,error=>error.code==='unavailable');assert.equal(workers.at(-1).terminated,1);
let finishDecode;globalThis.createImageBitmap=()=>new Promise(resolve=>{finishDecode=resolve;});const decoding=startStayScreenshotOcr(file());const decodingRejection=assert.rejects(decoding.promise,error=>error.code==='cancelled');await waitFor(()=>finishDecode);decoding.cancel();await decodingRejection;let lateClosed=false;finishDecode({width:1,height:1,close(){lateClosed=true;}});await waitFor(()=>lateClosed);
mode='hang';globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});const nativeTimeout=globalThis.setTimeout;let expire;globalThis.setTimeout=(fn,ms,...args)=>ms===90000?(expire=fn, -1):nativeTimeout(fn,ms,...args);const timed=startStayScreenshotOcr(file());globalThis.setTimeout=nativeTimeout;const timeoutRejection=assert.rejects(timed.promise,error=>error.code==='timeout');await waitFor(()=>workers.at(-1).terminated===0);expire();await timeoutRejection;assert.equal(workers.at(-1).terminated,1);
const fetches=[];const imports=[];const cacheEntries=new Map();let quota=false;let cacheDenied=false;
const modelBytes=Object.fromEntries(await Promise.all(['eng','por'].map(async lang=>[lang,await fs.readFile(`client/public/ocr/v7/${lang}.traineddata.gz`)])));
const cache={match:async url=>cacheEntries.get(url)?.clone(),put:async(url,response)=>{if(quota)throw Error('quota');cacheEntries.set(url,response.clone());},delete:async url=>cacheEntries.delete(url)};
const context={URL,Request,Response,Error,Promise,Set,Map,String,Uint8Array,self:{crypto:webcrypto,location:{href:'https://crewcheck.example/ocr/v7/'+manifest.boundary.name},console:{},caches:{open:async name=>{assert.equal(name,manifest.modelCacheName);if(cacheDenied)throw Error('storage unavailable');return cache;}},fetch:async(...args)=>{fetches.push(args);return new Response(modelBytes[args[0].includes('eng.')?'eng':'por']);},importScripts:(...args)=>imports.push(args)}};
vm.runInNewContext(await fs.readFile('scripts/stay-screenshot-worker.js','utf8'),context);
assert.equal(imports[0][0],'https://crewcheck.example/ocr/v7/worker.min.js');
const english='https://crewcheck.example/ocr/v7/eng.traineddata.gz',portuguese='https://crewcheck.example/ocr/v7/por.traineddata.gz';
await context.self.fetch(english);assert.equal(fetches[0][1].credentials,'omit');assert.equal(fetches[0][1].redirect,'error');assert.equal(fetches[0][1].cache,'no-store');
await context.self.fetch(english);assert.equal(fetches.length,1,'verified public model reused despite no-store server');
cacheEntries.set(english,new Response('CORRUPT'));await context.self.fetch(english);assert.equal(fetches.length,2,'corrupt public cache discarded and downloaded again');
await context.self.fetch(portuguese);assert.equal(fetches.length,3);assert.equal(cacheEntries.size,2);
for(const [url,options] of [['https://cdn.example/eng.traineddata.gz',{}],['https://crewcheck.example/api/import',{}],[english,{method:'POST',body:'secret'}]])await assert.rejects(context.self.fetch(url,options));
assert.throws(()=>context.self.importScripts('https://cdn.jsdelivr.net/anything.js'));assert.equal(fetches.length,3);
cacheEntries.clear();quota=true;await context.self.fetch(english);assert.equal(cacheEntries.size,0,'quota never creates partial model cache');quota=false;cacheDenied=true;await context.self.fetch(english);assert.equal(fetches.length,5,'storage failure degrades to verified download');
context.self.fetch=undefined;
console.log('PASS screenshot signature/dimensions/MIME, init cancellation, late decode cleanup, worker errors, timeout, RAM scrub, same-origin model-only worker network boundary, verified public-model cache/corruption/quota; lifecycle fixtures are not OCR accuracy evidence.');
