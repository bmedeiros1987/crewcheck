import assert from 'node:assert/strict';
import {allowsTvBrowserOrigin as allow} from '../server/tv/browser-origins.mjs';
const web='https://pilot.example.test';let count=0;
for(const origin of ['','null','https://appassets.androidplatform.net','file://online.crewcheck.tv.pilot','file://online.crewcheck.tv',web]){assert.equal(allow(origin,web),true);count++;}
for(const origin of ['null','https://appassets.androidplatform.net','file://online.crewcheck.tv.pilot','file://online.crewcheck.tv']){assert.equal(allow(origin,web,true),false);count++;}
for(const origin of ['*','file://','file:///','file://evil.app','file://online.crewcheck.tv.pilot.evil','file://online.crewcheck.tv.pilot/','https://online.crewcheck.tv.pilot','https://pilot.example.test.evil','https://evil.example.test']){assert.equal(allow(origin,web),false);count++;}
assert.equal(allow('',web,true),true);assert.equal(allow(web,web,true),true);assert.equal(allow('null',''),false);assert.equal(allow(null,web),false);count+=4;
console.log(count+' narrow TV origin checks PASS. Origins are not credentials.');
