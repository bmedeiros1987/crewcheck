import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {INTER_CSS} from './roster-font-diagnostics.mjs';

// Same declaration-bound mechanism as Weather/Pulse; never trust DOM URLs.
export function interFontDeclarations(css) {
 assert.ok(Buffer.byteLength(css)<=32768,'Inter CSS exceeds capture limit');
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,' ');
 assert.equal(clean.replace(/@font-face\s*\{([^{}]*)\}/gi,'').trim(),'','Only font-face blocks and comments');
 const urls=new Set();let found=0;
 for(const block of clean.matchAll(/@font-face\s*\{([^{}]*)\}/gi)) {
  const descriptors=new Map();
  for(const declaration of block[1].split(';').map(value=>value.trim()).filter(Boolean)) {
   const colon=declaration.indexOf(':');assert.ok(colon>0,'Require descriptor/value');
   const name=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim();
   assert.ok(['font-family','font-style','font-weight','font-display','src','unicode-range'].includes(name),'Only reviewed font descriptors');
   assert.ok(!descriptors.has(name),'Duplicate font descriptor forbidden');descriptors.set(name,value);
  }
  assert.match(descriptors.get('font-family')||'',/^(['"]?)Inter\1$/,'Only Inter family');
  assert.equal(descriptors.get('font-style'),'normal','Only shipping normal style');
  assert.match(descriptors.get('font-weight')||'',/^(?:400|500|600|700|800|900|400\s+900)$/,'Only shipping weights');
  if(descriptors.has('font-display'))assert.equal(descriptors.get('font-display'),'swap');
  if(descriptors.has('unicode-range'))assert.match(descriptors.get('unicode-range'),/^U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?(?:\s*,\s*U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?)*$/i);
  assert.match(descriptors.get('src')||'',/^url\(\s*(['"]?)[^)'"\s]+\1\s*\)\s+format\(\s*(['"])(?:woff2|woff|truetype)\2\s*\)$/,'Exactly one remote font source, no local or fallback');
  for(const match of block[1].matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)) {
   const font=new URL(match[1],INTER_CSS);
   assert.equal(font.origin,'https://fonts.gstatic.com','Only exact official font origin');
   assert.ok(!font.username&&!font.password&&!font.hash,'No font credentials or fragments');
   if(/^\/s\/inter\/v\d+\/[A-Za-z0-9_-]+\.woff2$/.test(font.pathname))assert.equal(font.search,'','Static font query forbidden');
   else {
    assert.equal(font.pathname,'/l/font','Only known font endpoint');
    const keys=[...font.searchParams.keys()].sort();
    assert.deepEqual(keys,['kit','skey','v'],'Exact dynamic font query keys, no duplicates');
    assert.match(font.searchParams.get('kit'),/^[A-Za-z0-9_-]{1,4096}$/);
    assert.match(font.searchParams.get('skey'),/^[a-f0-9]{16}$/);
    assert.match(font.searchParams.get('v'),/^v\d{1,4}$/);
   }
   urls.add(font.href);found++;
  }
 }
 assert.ok(found>0,'Require declared Inter font assets');
 assert.equal([...clean.matchAll(/url\(/gi)].length,found,'No assets outside Inter font faces');
 return urls;
}

const FAILURE=Symbol('Inter acquisition diagnostic');
const MIME=new Set(['text/css','font/woff2','font/woff','application/font-woff','font/ttf']);
function acquisitionError(asset,category,metadata={}) {
 const error=new Error('Inter acquisition failed');
 error[FAILURE]=Object.freeze({asset,category,...metadata});return error;
}
export function interAcquisitionFailure(error) {
 return error?.[FAILURE]||{asset:'unknown',category:'unknown'};
}
async function bodyWithinDeadline(response,asset,metadata) {
 let timer;
 const read=Promise.resolve().then(()=>response.body()).then(value=>({value}),()=>({failed:true}));
 try {
  const result=await Promise.race([read,new Promise(resolve=>{timer=setTimeout(()=>resolve({timeout:true}),1000);})]);
  if(result.failed||result.timeout)throw acquisitionError(asset,'transport',{...metadata,stage:result.timeout?'body-timeout':'body'});
  try{return Buffer.from(result.value);}catch{throw acquisitionError(asset,'transport',{...metadata,stage:'body'});}
 } finally {clearTimeout(timer);}
}

// Acquire once, then replay immutable bytes. Failure is cached too: no retry/fallback.
export function createInterFontPolicy() {
 let acquisition,snapshot;
 return {
  acquire(fetchResource) {
   if(acquisition)return acquisition;
   acquisition=(async()=>{
    const assets=new Map();let totalBytes=0;
    const read=async(href,asset)=>{
     let response;
     try {response=await fetchResource(href,{maxRedirects:0,maxRetries:0,timeout:10000});}
     catch {throw acquisitionError(asset,'transport',{stage:'fetch'});}
     try {
      const status=response.status(),headers=response.headers(),rawType=headers['content-type'];
      const type=typeof rawType==='string'?rawType.split(';')[0].trim().toLowerCase():'';
      const metadata={...(Number.isInteger(status)&&status>=100&&status<=599?{status}:{}),mime:MIME.has(type)?type:type?'other':'missing'};
      if(response.url()!==href)throw acquisitionError(asset,'redirect',metadata);
      if(status!==200)throw acquisitionError(asset,'status',metadata);
      if(asset==='stylesheet'?type!=='text/css':!MIME.has(type)||type==='text/css')throw acquisitionError(asset,'mime',metadata);
      if(asset==='stylesheet'&&['same-origin','same-site'].includes(String(headers['cross-origin-resource-policy']||'').trim().toLowerCase()))throw acquisitionError(asset,'corp',metadata);
      if(asset==='font'&&headers['access-control-allow-origin']!=='*')throw acquisitionError(asset,'cors',metadata);
      const body=await bodyWithinDeadline(response,asset,metadata);
      if(!body.length)throw acquisitionError(asset,'empty',metadata);
      totalBytes+=body.length;
      if(body.length>(asset==='stylesheet'?32768:2*1024*1024)||totalBytes>16*1024*1024)throw acquisitionError(asset,'size',metadata);
      const entry={body:Buffer.from(body),type,asset};assets.set(href,entry);return entry;
     } finally {void Promise.resolve().then(()=>response.dispose?.()).catch(()=>{}); /* never delay or replace acquisition evidence */}
    };
    const css=await read(INTER_CSS,'stylesheet');let declared;
    try{declared=interFontDeclarations(css.body.toString('utf8'));}catch{throw acquisitionError('stylesheet','css');}
    if(declared.size>64)throw acquisitionError('stylesheet','size');
    for(const href of declared)await read(href,'font');
    snapshot=assets;
    return [...assets.values()].map(entry=>({asset:entry.asset,status:200,mime:entry.type,...(entry.asset==='font'?{cors:'public'}:{}),bytes:entry.body.length,sha256:createHash('sha256').update(entry.body).digest('hex')}));
   })();
   return acquisition;
  },
  allows(request){return request.method()==='GET'&&Boolean(snapshot?.has(request.url()));},
  async handle(route) {
   const request=route.request(),entry=request.method()==='GET'&&snapshot?.get(request.url());
   if(!entry)return false;
   await route.fulfill({status:200,contentType:entry.type,headers:entry.asset==='font'?{'access-control-allow-origin':'*'}:{},body:Buffer.from(entry.body)});
   return true;
  },
 };
}
