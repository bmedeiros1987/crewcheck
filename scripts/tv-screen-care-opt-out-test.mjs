import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const output=path.resolve('.tv-care-options-test.mjs');
try {
  await build({entryPoints:['apps/tv-player/src/screenCarePolicy.ts'],outfile:output,bundle:true,platform:'node',format:'esm'});
  const {careEnabled,carePhase,careShift,CARE_PROFILES}=await import(pathToFileURL(output).href);
  let checks=0;
  const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  for(const value of [null,undefined,'','true','corrupt','0',false,0,{}]) eq(careEnabled(value),true);
  eq(careEnabled('false'),false);
  for(const profile of Object.keys(CARE_PROFILES)) {
    const {saverAt,blackAt}=CARE_PROFILES[profile];
    for(const idle of [0,saverAt-1,saverAt,blackAt,blackAt+1,86400000,Infinity,NaN]) {
      for(const motion of [true,false]) {
        eq(carePhase(idle,profile,motion,false),'active');
        eq(careShift(idle,idle,motion,false),{x:0,y:0});
      }
    }
    eq(carePhase(saverAt,profile,true,true),'saver');
    eq(carePhase(blackAt,profile,true,true),'black');
    eq(carePhase(saverAt,profile,false,true),'black');
    eq(carePhase(0,profile,true,true),'active');
  }
  eq(carePhase(300000,'balanced'),'saver');
  eq(careShift(120000,15000,true),{x:2,y:0});
  const hook=await readFile('apps/tv-player/src/ScreenCare.tsx','utf8');
  assert.match(hook,/role="switch" aria-checked=\{care.enabled\}/);
  assert.match(hook,/carePhase\(sample.idle,profile,motionAllowed,enabled\)/);
  assert.match(hook,/carePhase\(idleOf\(current\),profileRef.current,motionRef.current,enabledRef.current\)/);
  assert.match(hook,/careShift\(sample.elapsed,sample.idle,motionAllowed,enabled\)/);
  assert.match(hook,/writeVisualSetting\('crewcheck-tv-screen-care-enabled', value \? 'true' : 'false'\)/);
  const toggle=hook.slice(hook.indexOf('function chooseEnabled'),hook.indexOf('function preview'));
  assert.match(toggle,/enabledRef.current = value/);
  assert.match(toggle,/current.manual = false/);
  assert.match(toggle,/current.lastActivity = current.elapsed/);
  assert.match(toggle,/setSample\(\{elapsed:current.elapsed,idle:0,manual:false\}\)/);
  assert.match(hook,/if \(!enabledRef.current\) return/);
  assert.match(hook,/disabled=\{!care.enabled\}/);
  assert.doesNotMatch(hook,/fetch\(|session\.|wakeLock|setKeepAlive|webOS\.service|dispatchEvent\(/);
  checks+=12;
  console.log('Screen care opt-out: '+checks+' assertions PASS; native TV protection unchanged.');
} finally {await unlink(output).catch(()=>{});}
