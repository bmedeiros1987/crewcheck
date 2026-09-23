import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('dist/tv-trusted-client-tests',{recursive:true});
await build({
  entryPoints:['packages/tv-core/src/session.ts'],
  bundle:true,platform:'node',format:'esm',
  outfile:'dist/tv-trusted-client-tests/session.mjs',
});
const {TvSession}=await import('../dist/tv-trusted-client-tests/session.mjs');

const mapStorage=()=>{const map=new Map();return{
  map,
  getItem:k=>map.has(k)?map.get(k):null,
  setItem:(k,v)=>map.set(k,String(v)),
  removeItem:k=>map.delete(k),
};};

const now=Date.parse('2026-09-18T21:40:00-03:00');
const persistent=mapStorage(), sessionA=mapStorage();
const credential={deviceId:'d'.repeat(43),token:'t'.repeat(43),expiresAt:null,privacy:'private',trusted:true};
const snapshot={schemaVersion:1,snapshotId:'s',deviceId:credential.deviceId,sourceVersion:'v',generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),privacy:'private',mode:'ambient',next:null,days:[],summary:{month:'2026-09',flights:0,journeys:0,stays:0},leaveAt:null,gate:null,weather:null,changes:[],ticker:[]};

const request=async()=>new Response(JSON.stringify(snapshot),{status:200,headers:{'Content-Type':'application/json','X-CrewCheck-Server-Time':String(now)}});
const first=new TvSession(sessionA,request,'https://pilot.example.test',persistent);
assert.equal(first.credential,null);
first.pair(credential);
assert.equal(first.credential?.trusted,true);
assert.equal(persistent.map.size,1);
const persisted=JSON.stringify([...persistent.map.values()]);
assert.ok(persisted.includes(credential.token));
assert.ok(!persisted.includes('snapshotId'));

const secondSession=mapStorage();
const second=new TvSession(secondSession,request,'https://pilot.example.test',persistent);
assert.equal(second.credential?.deviceId,credential.deviceId,'cold start must restore trusted credential');
assert.equal((await second.sync(now)).snapshotId,'s');
second.snapshot=snapshot;
assert.equal(second.offline(now+900001),null,'offline snapshot exposure remains bounded');
assert.equal(second.credential?.deviceId,credential.deviceId,'offline snapshot expiry must not forget trusted TV');
assert.equal(persistent.map.size,1);

second.renew(null);
const third=new TvSession(mapStorage(),request,'https://pilot.example.test',persistent);
assert.equal(third.credential?.expiresAt,null,'trusted TV must remain paired without a functional expiry');

third.clear();
assert.equal(persistent.map.size,0,'explicit unlink must forget trusted credential');

const temporaryStore=mapStorage();
const temporary=new TvSession(mapStorage(),request,'https://pilot.example.test',temporaryStore);
temporary.pair({...credential,trusted:false,expiresAt:new Date(now+86400000).toISOString()});
assert.equal(temporaryStore.map.size,0,'temporary pairing must never persist credential');

const rejectedStore=mapStorage();
const seed=new TvSession(mapStorage(),request,'https://pilot.example.test',rejectedStore);
seed.pair(credential);
const rejected=new TvSession(mapStorage(),async()=>new Response('{}',{status:401}),'https://pilot.example.test',rejectedStore);
await assert.rejects(rejected.call('snapshot'),/pair_again/);
assert.equal(rejectedStore.map.size,0,'server revocation/expiry must erase trusted credential');

const forbiddenStore=mapStorage();
const forbiddenSeed=new TvSession(mapStorage(),request,'https://pilot.example.test',forbiddenStore);
forbiddenSeed.pair(credential);
const forbidden=new TvSession(mapStorage(),async()=>new Response('{}',{status:403}),'https://pilot.example.test',forbiddenStore);
await assert.rejects(forbidden.call('snapshot'),/access_forbidden/);
assert.equal(forbidden.credential?.deviceId,credential.deviceId,'temporary 403 must keep trusted credential in memory');
assert.equal(forbiddenStore.map.size,1,'temporary 403 must keep trusted credential persisted');

const malformedStore=mapStorage();
const malformedSeed=new TvSession(mapStorage(),request,'https://pilot.example.test',malformedStore);
malformedSeed.pair(credential);
const malformedResponse=async()=>new Response(JSON.stringify({...snapshot,schemaVersion:99}),{status:200,headers:{'Content-Type':'application/json','X-CrewCheck-Server-Time':String(now)}});
const malformed=new TvSession(mapStorage(),malformedResponse,'https://pilot.example.test',malformedStore);
await assert.rejects(malformed.sync(now),/invalid_snapshot_schema/);
assert.equal(malformed.credential?.deviceId,credential.deviceId,'invalid snapshot must not unlink trusted TV');
assert.equal(malformedStore.map.size,1,'invalid snapshot must keep persistent trusted credential');

const prep=await readFile('scripts/tv-pairing-prepare.mjs','utf8');
assert.match(prep,/new TvSession\(sessionStorage, fetch,[^\n]+localStorage\)/);
assert.match(prep,/trusted:trustedTv/);
assert.match(prep,/Restaurando TV confiável/);
assert.match(prep,/session\.renew/);
assert.match(prep,/Fechar app/);
assert.match(prep,/session\.clear\(forgetTrusted\)/);
const tvBuild=await readFile('scripts/tv-build.mjs','utf8');
assert.match(tvBuild,/tv-pairing-prepare\.mjs/,'every packaged TV build must apply persistent pairing');
const main=await readFile('apps/tv-player/src/main.tsx','utf8');
assert.match(main,/Desvincular esta TV/);

console.log('PASS: trusted personal TV survives restart until revocation, keeps offline snapshot bounded and remains explicitly revocable.');
