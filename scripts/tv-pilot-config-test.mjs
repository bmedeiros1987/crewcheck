import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readPilotPolicy } from '../server/tv/pilot-policy.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const compact = {enabled:true, accountSha256:hash('pilot@example.test'), origin:'https://pilot.example.test', bootstrap:true};
const env = {CREWCHECK_TV_PILOT_CONFIG:JSON.stringify(compact), IS_PULL_REQUEST:'true'};
assert.equal(readPilotPolicy(env).allows('pilot@example.test'), true);
assert.equal(readPilotPolicy(env).allows('other@example.test'), false);
assert.equal(readPilotPolicy(env).bootstrap,true);
assert.equal(readPilotPolicy({...env,IS_PULL_REQUEST:'false'}).bootstrap,false);
assert.equal(readPilotPolicy({...env,CREWCHECK_TV_ENABLED:'false'}).enabled,false);
for (const invalid of ['', '{}', 'null', '[]', 'true', '{broken', JSON.stringify({...compact,enabled:'true'}), JSON.stringify({...compact,accountSha256:'*'}), JSON.stringify({...compact,extra:true})]) {
  assert.equal(readPilotPolicy({...env,CREWCHECK_TV_ENABLED:'true',CREWCHECK_TV_PILOT_CONFIG:invalid}).enabled,false);
}
assert.equal(readPilotPolicy({...env,CREWCHECK_TV_PILOT_CONFIG:JSON.stringify({...compact,enabled:false})}).allows('pilot@example.test'),false);
console.log('Compact pilot config: single-account, malformed config rejection, kill switch and preview-only bootstrap PASS.');
