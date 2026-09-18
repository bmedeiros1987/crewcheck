import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = await mkdtemp(join(tmpdir(), 'tv-receive-time-'));
const originalNow = Date.now;
const base = Date.parse('2026-09-18T12:00:00Z');
let clock = base;
let passed = 0;
try {
  const bundle = join(directory, 'session.mjs');
  await build({entryPoints:['packages/tv-core/src/session.ts'],bundle:true,platform:'node',format:'esm',outfile:bundle});
  const { TvSession } = await import(pathToFileURL(bundle).href);
  Date.now = () => clock;
  const iso = value => new Date(value).toISOString();
  function fixture({generated=base+250, received=base+1000, expiry=base+86400000, privacy='family', responsePrivacy=privacy, responseDevice='device-a', status=200, duringRequest}={}) {
    clock = base;
    const values = new Map();
    const storage = {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const snapshot = {schemaVersion:1,snapshotId:'test',deviceId:responseDevice,sourceVersion:'1',generatedAt:iso(generated),expiresAt:iso(generated+60000),privacy:responsePrivacy,mode:'ambient',next:null,days:[],summary:{month:'2026-09',flights:0,journeys:0,stays:0},leaveAt:null,gate:null,weather:null,changes:[],ticker:[]};
    const client = new TvSession(storage, async () => {
      clock = received;
      if (duringRequest) duringRequest(client);
      return new Response(JSON.stringify(snapshot), {status});
    }, 'https://pilot.example.test');
    client.pair({deviceId:'device-a',token:'test-only-device-credential',expiresAt:iso(expiry),privacy});
    return {client,values,snapshot};
  }
  async function check(name, fn) {await fn(); passed++; console.log('PASS '+name);}
  await check('fresh snapshot generated after request starts is accepted on receipt', async()=>{
    const {client,values,snapshot}=fixture();
    assert.deepEqual(await client.sync(),snapshot);
    assert.equal(client.snapshot.generatedAt,iso(base+250));
    assert.equal(values.size,1);
  });
  await check('device expiring during transit is not restored',async()=>{
    const {client,values}=fixture({expiry:base+500});
    await assert.rejects(client.sync(),/pair_again/);
    assert.equal(client.credential,null);assert.equal(client.snapshot,null);assert.equal(values.size,0);
  });
  await check('snapshot still in the future at receipt is rejected',async()=>{
    const {client}=fixture({generated:base+2000});
    await assert.rejects(client.sync(),/invalid_snapshot/);assert.equal(client.credential,null);
  });
  await check('late prior-session response cannot restore logout',async()=>{
    const {client}=fixture({duringRequest:client=>client.clear()});
    await assert.rejects(client.sync(),/session_changed/);assert.equal(client.snapshot,null);
  });
  await check('wrong-device response remains rejected',async()=>{
    const {client}=fixture({responseDevice:'other-device'});
    await assert.rejects(client.sync(),/invalid_snapshot/);assert.equal(client.credential,null);
  });
  await check('private snapshot is not persisted',async()=>{
    const {client,values}=fixture({privacy:'private'});await client.sync();assert.equal(values.size,0);
  });
  await check('server rejection still clears credentials',async()=>{
    for(const status of [401,403]) {const {client}=fixture({status});await assert.rejects(client.sync(),/pair_again/);assert.equal(client.credential,null);}
  });
  await check('explicit legacy test time stays deterministic',async()=>{
    const {client}=fixture({generated:base});await client.sync(base);assert.ok(client.snapshot);
  });
  console.log('TV receive-time regressions: '+passed+' passed; simulated transport, no live account used.');
} finally {
  Date.now = originalNow;
  await rm(directory, {recursive:true,force:true});
}
