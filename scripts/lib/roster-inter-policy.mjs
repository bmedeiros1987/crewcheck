import assert from 'node:assert/strict';
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

export function createInterFontPolicy() {
 let declared=new Set();
 return {
  allows(request){return request.method()==='GET'&&(request.url()===INTER_CSS||declared.has(request.url()));},
  async handle(route) {
   const request=route.request(),href=request.url(),stylesheet=href===INTER_CSS;
   if(request.method()!=='GET'||(!stylesheet&&!declared.has(href)))return false;
   const response=await route.fetch({maxRedirects:0,timeout:10000});
   assert.equal(response.url(),href,'Inter assets must not redirect');
   assert.equal(response.status(),200,'Inter assets require HTTP 200');
   const type=response.headers()['content-type']?.split(';')[0].trim().toLowerCase();
   if(stylesheet) {
    assert.equal(type,'text/css','Require CSS response');
    const css=await response.text();const next=interFontDeclarations(css);
    declared=next;await route.fulfill({response,body:css});
   } else {
    assert.ok(['font/woff2','font/woff','application/font-woff','font/ttf'].includes(type),'Require a font response');
    await route.fulfill({response});
   }
   return true;
  },
 };
}
