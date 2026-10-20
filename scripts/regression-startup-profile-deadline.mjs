import assert from 'node:assert/strict';
import { authFixture, flushAuth, syntheticUser } from './auth-contract-fixture.mjs';

// Exercise the actual Protected/auth/demo functions, with deferred synthetic I/O.
for (const phase of ['headers', 'body']) {
  const f = authFixture(); f.seed(); f.mount();
  f.requests[0].respond(200, { ok: true, user: syntheticUser }); await flushAuth();
  // The first verified owner can restart startup; finish the current request.
  for (let attempts = 0; f.requests.at(-1).url === '/api/auth/me'; attempts++) {
    assert(attempts < 3, 'verified startup must leave the auth retry phase');
    const currentRequest = f.requests.at(-1);
    currentRequest.respond(200, { ok: true, user: syntheticUser }); await flushAuth();
    assert.notEqual(f.requests.at(-1), currentRequest,
      'verified getMe must progress instead of responding again to a settled request');
  }
  const profile = f.requests.at(-1);
  assert.equal(profile.url, '/api/partner/demo-profile');
  let releaseBody;
  if (phase === 'body') {
    profile.respond(200, new Promise(resolve => { releaseBody = resolve; }));
    await flushAuth();
  }
  assert(!f.states.includes(true), 'startup must await the optional profile within its budget');
  await f.advance(5_000);
  assert(f.states.includes(true), `stalled profile ${phase} must release startup within 5s`);
  assert(f.data.get('crewcheck_auth_token'), 'optional timeout must preserve authentication');
  // A response arriving after the deadline cannot activate demo mode later.
  const payload = { partner: true, demoRosterEnabled: true, partnerName: 'SYNTHETIC' };
  if (releaseBody) releaseBody(payload); else profile.respond(200, payload);
  await flushAuth();
  assert.equal(f.data.get('crewcheck_demo_mode_seen'), undefined);
  assert.equal(f.sessionData.get('crewcheck_demo_active'), undefined);
  f.unmount();
}
console.log('PASS startup profile deadline: deferred headers/body and fenced late responses');
