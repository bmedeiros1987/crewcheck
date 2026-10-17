import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createPartnerGateHttpHandler } from '../server/v1413/partnerGateHttp.mjs';
const radar = JSON.parse(readFileSync(new URL('./fixtures/partner-gate/synthetic.json', import.meta.url)));
const contract = JSON.parse(readFileSync(new URL('../docs/partner-gate-http.openapi.json',import.meta.url)));
const partnerId = 'synthetic-partner';
const identity = { active: true, partnerId, scopes: ['gates:read'] };
const grant = { partnerId, provider:'fixture-gate', occurrenceKey:radar.occurrenceKey, fields:['departureGate'],
  sourceClass:'licensed_provider', accessApproved:true, redistributionApproved:true,
  reviewId:'SYNTHETIC-REVIEW',validUntil:'2030-01-01T13:00:00Z' };
const calls = { auth:0, rate:0, occurrence:0, radar:0, rights:0 };
const base = { enabled:true, now:()=>new Date('2030-01-01T12:00:00Z'),
  authorize:async token=>{ calls.auth++; assert.equal(token,'ck_test_SYNTHETIC_TOKEN_NOT_A_CREDENTIAL');return identity; },
  consumeRateLimit:async()=>{calls.rate++;return {allowed:true,limit:60,remaining:59,reset:1893499260};},
  resolveOccurrence:async input=>{calls.occurrence++;assert.equal(input.partnerId,partnerId);return radar;},
  readRadar:async input=>{calls.radar++;assert.equal(input.partnerId,partnerId);return {...radar,quality:87};},
  resolveRights:async input=>{calls.rights++;assert.equal(input.partnerId,partnerId);return [grant];} };
let handler;
const server=http.createServer(async(req,res)=>{
  try { if (!await handler(req,res)) {res.writeHead(404);res.end();} }
  catch {res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=`http://127.0.0.1:${server.address().port}`;
const path='/api/v1/flights/LA9999/gate';
async function query(deps=base,suffix='',options={}) {
  handler=createPartnerGateHttpHandler(deps);
  const response=await fetch(address+path+suffix,{headers:{authorization:'Bearer ck_test_SYNTHETIC_TOKEN_NOT_A_CREDENTIAL'},...options});
  const body=await response.json();return {status:response.status,body,headers:response.headers};
}
try {
  let response=await query();
  assert.equal(response.status,200);assert.equal(response.body.gate,radar.gate);
  const schema=contract.components.schemas.GateResponse;
  for(const key of schema.required) assert.ok(Object.hasOwn(response.body,key),key);
  for(const [key,rule] of Object.entries(schema.properties)) {
    const value=response.body[key];
    const type=value===null?'null':typeof value;
    assert.ok((Array.isArray(rule.type)?rule.type:[rule.type]).includes(type),key);
    if(rule.enum)assert.ok(rule.enum.includes(value),key);
    if(rule.const)assert.equal(value,rule.const,key);
    if(rule.minimum!==undefined)assert.ok(value>=rule.minimum&&value<=rule.maximum,key);
  }
  assert.equal(response.body.terminal,null);assert.equal(response.body.flightStatus,null);
  assert.equal(response.body.confidence,.87);assert.equal(response.body.confidenceBand,'high');
  assert.equal(response.body.occurrenceMatch,'live-flight-route');assert.equal(response.body.occurrenceVerified,true);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-ratelimit-remaining'),'59');
  response=await query(base,'?origin=GRU&destination=BSB&partnerId=spoof&occurrenceKey=spoof&partnerShareable=true');
  assert.equal(response.body.gate,radar.gate);
  const before={...calls};
  for(const missing of ['authorize','consumeRateLimit','resolveOccurrence','readRadar','resolveRights']) {
    assert.equal((await query({...base,[missing]:undefined})).status,503);
  }
  assert.equal((await query({})).status,503);assert.equal((await query({...base,enabled:'true'})).status,503);
  assert.deepEqual(calls,before);
  assert.equal((await query(base,'',{headers:{}})).status,401);
  assert.equal((await query(base,'',{headers:{authorization:'Bearer malformed'}})).status,401);
  assert.equal(calls.radar,before.radar);
  for(const invalid of [null,{...identity,active:false},{...identity,partnerId:''}]) assert.equal((await query({...base,authorize:async()=>invalid})).status,401);
  assert.equal((await query({...base,authorize:async()=>({...identity,scopes:[]})})).status,403);
  const reads=calls.radar;
  assert.equal((await query({...base,consumeRateLimit:async()=>({allowed:false})})).status,429);
  assert.equal(calls.radar,reads);
  for(const suffix of ['?origin=bad!', '?destination=bad!', '?origin=GRU&origin=VCP']) assert.equal((await query(base,suffix)).status,400);
  assert.equal((await query(base,'',{method:'POST'})).status,405);
  response=await query({...base,resolveOccurrence:async()=>({...radar,origin:'VCP'})},'?origin=GRU');
  assert.equal(response.status,503);assert.equal(calls.radar,reads);
  assert.equal((await query({...base,resolveOccurrence:async()=>null})).status,503);
  response=await query({...base,resolveRights:async()=>[]});
  assert.equal(response.status,200);assert.equal(response.body.gate,null);assert.equal(response.body.confidence,0);
  assert.ok(!JSON.stringify(response.body).includes(radar.gate));
  for(const failing of ['authorize','consumeRateLimit','resolveOccurrence','readRadar','resolveRights']) {
    response=await query({...base,[failing]:async()=>{throw Error('SYNTHETIC-SECRET');}});
    assert.equal(response.status,failing==='readRadar'||failing==='resolveRights'?502:503);
    assert.ok(!JSON.stringify(response.body).includes('SYNTHETIC-SECRET'));
  }
  handler=createPartnerGateHttpHandler(base);
  assert.equal((await fetch(address+'/unrelated')).status,404);
  assert.equal((await fetch(address+'/api/v1/flights/%ZZ/gate',{headers:{authorization:'Bearer ck_test_SYNTHETIC_TOKEN_NOT_A_CREDENTIAL'}})).status,400);
  console.log('PASS loopback HTTP: existing GET contract, auth/scope/rate, occurrence resolver, independent rights, redaction, inert default; synthetic only');
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
