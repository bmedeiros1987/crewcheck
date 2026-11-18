import assert from 'node:assert/strict';
import {authFixture} from './auth-contract-fixture.mjs';

function observe(f) {
  let expired=0;
  f.window.addEventListener('crewcheck:auth-expired',()=>expired++);
  return ()=>expired;
}
function demo(f) {
  f.data.set('crewcheck_demo_mode_seen','1');
  f.sessionData.set('crewcheck_demo_active','1');
}
// A protected API still rejects a guest request; it cannot expire a nonexistent session.
for (const token of [null,'']) {
  const f=authFixture();demo(f);if(token!==null)f.data.set('crewcheck_auth_token',token);
  const expired=observe(f),pending=f.auth.authFetch('/api/control/telemetry',{method:'POST',body:'{"type":"app_open"}'});
  assert.equal(f.requests[0].options.headers.authorization,undefined);
  f.requests[0].respond(401,{ok:false,code:'AUTH_REQUIRED'});
  await assert.rejects(pending,error=>error.status===401&&error.reason==='session_expired');
  assert.equal(expired(),0,'guest401 must not emit session expiry or redirect the demo');
  assert.equal(f.data.get('crewcheck_demo_mode_seen'),'1');assert.equal(f.sessionData.get('crewcheck_demo_active'),'1');
  assert.equal(f.auth.captureConfirmedGetMe(),null,'demo cannot mint authenticated read admission');
}
// A genuine current credential must still expire on a confirmed401.
{
  const f=authFixture();f.seed();const expired=observe(f),pending=f.auth.authFetch('/api/control/telemetry');
  assert.equal(f.requests[0].options.headers.authorization,'Bearer expired-synthetic-token');
  f.requests[0].respond(401,{ok:false,code:'AUTH_REQUIRED'});await assert.rejects(pending,error=>error.status===401);
  assert.equal(expired(),1);assert(!f.data.has('crewcheck_auth_token'));assert.equal(f.data.get('crewcheck_latest_roster_bundle'),'SYNTHETIC_ROSTER');
}
// Late guest/A responses cannot expire a newer accountB, even if a token string is reused.
for (const initial of ['guest','accountA','sameTokenNewOwner']) {
  const f=authFixture();demo(f);if(initial!=='guest')f.seed('synthetic-A',{id:'A',name:'SYNTHETIC A',email:'a@example.invalid'});
  const expired=observe(f),pending=f.auth.authFetch('/api/control/telemetry');
  f.seed(initial==='sameTokenNewOwner'?'synthetic-A':'synthetic-B',{id:'B',name:'SYNTHETIC B',email:'b@example.invalid'});
  f.requests[0].respond(401,{ok:false,code:'AUTH_REQUIRED'});await assert.rejects(pending,error=>error.status===401);
  assert.equal(expired(),0);assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,'B');assert(f.data.has('crewcheck_auth_token'));
}
for (const status of [403,429,503,'network']) {
  const f=authFixture();f.seed();const expired=observe(f),pending=f.auth.authFetch('/api/control/telemetry');
  if(status==='network')f.requests[0].reject(Error('SYNTHETIC_OFFLINE'));else f.requests[0].respond(status,{ok:false});
  await assert.rejects(pending);assert.equal(expired(),0);assert.equal(f.data.get('crewcheck_auth_token'),'expired-synthetic-token');
}
console.log('PASS real auth transport: anonymous401 rejects without expiry; actual-session401, account-switch races and recoverable errors preserved; synthetic I/O only');
