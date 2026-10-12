// RSA fixtures stay in memory; no real token/key/network is used or logged.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createOidcVerifier,ISSUER,JWKS_URL,AUDIENCE,REPOSITORY,REPOSITORY_ID,OWNER_ID,WORKFLOW_REF,SUBJECT,ENVIRONMENT_NAME,ENVIRONMENT_NODE_ID} from '../../server/release-journal/oidc.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',kid:'fixture',use:'sig'};
const now=10000,claims={iss:ISSUER,aud:AUDIENCE,sub:SUBJECT,repository:REPOSITORY,repository_id:REPOSITORY_ID,repository_owner:'bmedeiros1987',repository_owner_id:OWNER_ID,ref:'refs/heads/main',ref_type:'branch',event_name:'workflow_dispatch',runner_environment:'github-hosted',workflow_ref:WORKFLOW_REF,environment:ENVIRONMENT_NAME,environment_node_id:ENVIRONMENT_NODE_ID,check_run_id:'456',repository_visibility:'public',workflow_sha:'b'.repeat(40),sha:'b'.repeat(40),run_id:'123',run_attempt:'1',actor_id:OWNER_ID,jti:'fixture-1',iat:now,nbf:now,exp:now+300};
export function fixtureToken(c=claims,h={alg:'RS256',kid:'fixture',typ:'JWT'}){const parts=[h,c].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));return parts.join('.')+'.'+sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url');}
let loads=0;const verify=createOidcVerifier({now:()=>now,loadJwks:async url=>{assert.equal(url,JWKS_URL);loads++;return {keys:[jwk]};}});
assert.deepEqual(await verify(fixtureToken()),claims);assert.equal(loads,1);
for(const override of [{iss:'https://foreign.test'},{aud:'other'},{aud:[AUDIENCE]},{repository_id:'2'},{repository_owner_id:'2'},{repository:'foreign/repo'},{ref:'refs/heads/topic'},{event_name:'pull_request'},{event_name:'push'},{runner_environment:'self-hosted'},{workflow_ref:'wrong'},{environment:'844'},{environment:'861'},{sub:'repo:bmedeiros1987/crewcheck:environment:861'},{environment_node_id:'fixture-env861'},{repository_visibility:'private'},{exp:now},{iat:now-301},{nbf:now+31},{exp:now+301},{run_attempt:'0'},{sha:'bad'},{job_workflow_ref:'unapproved'}])await assert.rejects(verify(fixtureToken({...claims,...override})));
for(const k of ['exp','nbf','iat','repository_id','repository_owner_id','workflow_sha','run_id','run_attempt','actor_id','environment','environment_node_id']){const c={...claims};delete c[k];await assert.rejects(verify(fixtureToken(c)));}
for(const h of [{alg:'none',kid:'fixture',typ:'JWT'},{alg:'HS256',kid:'fixture',typ:'JWT'},{alg:'RS256',kid:'unknown',typ:'JWT'},{alg:'RS256',kid:'fixture',typ:'JWT',jku:'https://foreign.test'}])await assert.rejects(verify(fixtureToken(claims,h)));
const token=fixtureToken();await assert.rejects(verify(token.slice(0,-5)+'AAAAA'));assert.equal(loads,1);
console.log('PASS fixed GitHub issuer/RS256/JWKS/audience and signed repo/owner/path/main/manual identity; short dates, missing/divergent claims, attacker key URL and altered signatures fail');

export const fixtureClaims=claims;
export const fixtureJwk=jwk;
