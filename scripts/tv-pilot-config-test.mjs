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

// Group configuration cannot enable production, another preview, or a copied
// service. This remains true when older general flags request enablement.
const scoped = {...compact, serviceId:'srv-preview01'};
const scopedEnv = {...env, CREWCHECK_TV_ENABLED:'true', RENDER_SERVICE_ID:scoped.serviceId,
  RENDER_EXTERNAL_URL:scoped.origin, CREWCHECK_TV_PILOT_SCOPED_CONFIG:JSON.stringify(scoped)};
let scopeChecks=0;
const check=(actual, expected)=>{assert.equal(actual,expected);scopeChecks++;};
check(readPilotPolicy(scopedEnv).enabled,true);
check(readPilotPolicy(scopedEnv).allows('pilot@example.test'),true);
check(readPilotPolicy(scopedEnv).allows('other@example.test'),false);
check(readPilotPolicy(scopedEnv).bootstrap,true);
for (const delta of [
  {IS_PULL_REQUEST:'false'}, {IS_PULL_REQUEST:undefined}, {RENDER_SERVICE_ID:'srv-main01'},
  {RENDER_SERVICE_ID:'srv-preview02'}, {RENDER_SERVICE_ID:undefined},
  {RENDER_EXTERNAL_URL:'https://production.example.test'}, {RENDER_EXTERNAL_URL:undefined},
  {RENDER_EXTERNAL_URL:scoped.origin+'/'}, {CREWCHECK_TV_ENABLED:'false'},
]) {
  const value=readPilotPolicy({...scopedEnv,...delta});
  check(value.enabled,false);check(value.bootstrap,false);check(value.allows('pilot@example.test'),false);
}
for (const key of Object.keys(scoped)) {
  const partial={...scoped};delete partial[key];
  check(readPilotPolicy({...scopedEnv,CREWCHECK_TV_PILOT_SCOPED_CONFIG:JSON.stringify(partial)}).enabled,false);
}
for (const invalid of ['', '{}', 'null', '[]', '{broken', 'x'.repeat(4097),
    JSON.stringify({...scoped, enabled:'true'}),JSON.stringify({...scoped, bootstrap:'true'}),
    JSON.stringify({...scoped, extra:true}),JSON.stringify({...scoped, serviceId:['srv-preview01']}),
    JSON.stringify({...scoped, accountSha256:'*'}),JSON.stringify({...scoped, origin:'http://pilot.example.test'})]) {
  check(readPilotPolicy({...scopedEnv,CREWCHECK_TV_PILOT_SCOPED_CONFIG:invalid}).enabled,false);
}
check(readPilotPolicy({...scopedEnv,CREWCHECK_TV_PILOT_SCOPED_CONFIG:JSON.stringify({...scoped,enabled:false})}).enabled,false);
check(readPilotPolicy({...scopedEnv,CREWCHECK_TV_PILOT_SCOPED_CONFIG:JSON.stringify({...scoped,bootstrap:false})}).bootstrap,false);
check(scopedEnv.CREWCHECK_TV_PILOT_CONFIG,JSON.stringify(compact));
console.log('Scoped group config: '+scopeChecks+' service/preview/origin/account/kill-switch assertions PASS.');
