import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertNotProtectedReleaseKey} from '../../server/release-journal/namespace.mjs';
const source=fs.readFileSync('server.mjs','utf8');
for(const [name,next] of [['Put','Get'],['Get','Delete'],['Delete','ListSnapshots']]){
 const start=source.indexOf(`async function conciergeDb${name}(`),end=source.indexOf(`async function conciergeDb${next}(`,start);
 const code=source.slice(start,end);assert(code.includes('assertNotProtectedReleaseKey(key)'));assert(code.indexOf('assertNotProtectedReleaseKey')<code.indexOf('await conciergeDbPool'));
 let queries=0,pools=0;
 const pool={async query(){queries++;return [[{payload:'{}'}]];}};
 const fn=new Function('assertNotProtectedReleaseKey','conciergeDbPool',code+`;return conciergeDb${name};`)(assertNotProtectedReleaseKey,async()=>{pools++;return pool;});
 for(const key of ['play-release-approval:com.crewcheck.app:123:1','play-release-revocation:com.crewcheck.app:123:1','play-release-admission:com.crewcheck.app:123:1','play-release-journal:com.crewcheck.app','PLAY-RELEASE-APPROVAL:x','pláy-release-approval:x','\u200bplay-release-approval:x','ｐｌａｙ-release-approval:x'])await fn(key,{});
 assert.equal(pools,0);assert.equal(queries,0);await fn('snapshot:fictional@example.test',{});assert.equal(pools,1);assert.equal(queries,1);
}
console.log('PASS actual generic KV get/put/delete functions reject reserved release prefixes before DB, including collation/format variants; normal namespaces preserved');
