import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const output=path.resolve('.tv-care-test.mjs');
try {
  await build({entryPoints:['apps/tv-player/src/screenCarePolicy.ts'],outfile:output,bundle:true,platform:'node',format:'esm'});
  const {CARE_PROFILES,careProfile,carePhase,careShift,careSpot,nextCareElapsed}=await import(pathToFileURL(output).href);
  let checks=0;
  const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  eq(careProfile('off'),'balanced');eq(careProfile('unknown'),'balanced');
  for(const profile of Object.keys(CARE_PROFILES)) {
    const {saverAt,blackAt}=CARE_PROFILES[profile];
    eq(carePhase(0,profile),'active');eq(carePhase(saverAt-1,profile),'active');
    eq(carePhase(saverAt,profile),'saver');eq(carePhase(blackAt-1,profile),'saver');
    eq(carePhase(blackAt,profile),'black');eq(carePhase(blackAt+86400000,profile),'black');
    eq(carePhase(saverAt,profile,false),'black');eq(carePhase(0,profile,false),'active');
  }
  eq(carePhase(NaN,'balanced'),'black');eq(carePhase(Infinity,'balanced'),'black');
  eq(nextCareElapsed(120,-500000,1000),1120);eq(nextCareElapsed(120,600000,1000),600120);
  eq(nextCareElapsed(120,0,0),120);eq(nextCareElapsed(120,NaN,1000),1120);
  eq(careShift(120000,5000,true),{x:0,y:0});eq(careShift(120000,10000,false),{x:0,y:0});
  const points=new Set();
  for(let i=0;i<50;i++) {const p=careShift(i*120000,15000,true);assert.ok(Math.abs(p.x)<=4&&Math.abs(p.y)<=4);points.add(JSON.stringify(p));checks++;}
  eq(points.size,10);
  const spots=new Set();
  for(let i=0;i<18;i++) {const p=careSpot(i*30000);assert.ok(parseFloat(p.left)>=7&&parseFloat(p.left)+32<=93&&parseFloat(p.top)>=10&&parseFloat(p.top)+20<=90);spots.add(JSON.stringify(p));checks++;}
  eq(spots.size,9);
  const main=await readFile('apps/tv-player/src/main.tsx','utf8');
  const hook=await readFile('apps/tv-player/src/ScreenCare.tsx','utf8');
  const css=await readFile('apps/tv-player/src/screen-care.css','utf8');
  assert.match(main,/useScreenCare\(effectiveMotion !== 'off'/);
  assert.match(main,/data-screen-care=\{care.covered/);
  assert.match(main,/paused \|\| care.covered/);
  assert.match(hook,/document.addEventListener\(name,input,true\)/);
  assert.match(hook,/event.stopImmediatePropagation\(\)/);
  assert.match(hook,/if\(document.hidden\) return/);
  assert.match(css,/display:none!important/);
  assert.match(hook,/care.phase==='saver'/);
  assert.doesNotMatch(hook,/fetch\(|session\.|wakeLock|setKeepAlive|webOS\.service|dispatchEvent\(/);
  assert.doesNotMatch(css,/opacity:\s*\.\d/);
  checks+=10;
  console.log('Screen care: '+checks+' policy/boundary/safe-area/source assertions passed. No physical display effectiveness claim.');
} finally {await unlink(output).catch(()=>{});}
