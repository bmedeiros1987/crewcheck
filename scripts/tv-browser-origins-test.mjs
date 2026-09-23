import assert from 'node:assert/strict';
import {allowsTvBrowserOrigin as allow} from '../server/tv/browser-origins.mjs';

const web='https://pilot.example.test';
let count=0;

for(const origin of [
  '',
  'null',
  'https://appassets.androidplatform.net',
  'https://crewcheck.online',
  'file://online.crewcheck.tv.pilot',
  'file://online.crewcheck.tv',
  web,
]){
  assert.equal(allow(origin,web),true,origin);
  count++;
}

// Account-control routes are intentionally narrower: authenticated CrewCheck
// web/mobile may manage TV permissions; packaged TV/file origins may not.
for(const origin of ['',web,'https://crewcheck.online','https://appassets.androidplatform.net']){
  assert.equal(allow(origin,web,true),true,origin);
  count++;
}
for(const origin of ['null','file://online.crewcheck.tv.pilot','file://online.crewcheck.tv']){
  assert.equal(allow(origin,web,true),false,origin);
  count++;
}

for(const origin of [
  '*','file://','file:///','file://evil.app',
  'file://online.crewcheck.tv.pilot.evil',
  'file://online.crewcheck.tv.pilot/',
  'https://online.crewcheck.tv.pilot',
  'https://pilot.example.test.evil',
  'https://crewcheck.online.evil',
  'https://evil.example.test',
]){
  assert.equal(allow(origin,web),false,origin);
  assert.equal(allow(origin,web,true),false,origin);
  count+=2;
}
assert.equal(allow('null',''),false);count++;
assert.equal(allow(null,web),false);count++;

console.log(count+' narrow TV origin checks PASS. Account control remains first-party only; origins are not credentials.');
