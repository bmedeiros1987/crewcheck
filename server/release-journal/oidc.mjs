// Fixed GitHub issuer and public key source. No Store/DB access or token logging.
import assert from 'node:assert/strict';
import {publicJson} from './public-json.mjs';
import {createPublicKey,verify} from 'node:crypto';
export const ISSUER='https://token.actions.githubusercontent.com';
export const JWKS_URL=ISSUER+'/.well-known/jwks';
export const AUDIENCE='crewcheck:release-journal:com.crewcheck.app';
export const REPOSITORY='bmedeiros1987/crewcheck';
export const REPOSITORY_ID='1254349963';
export const OWNER_ID='214496369';
export const WORKFLOW_REF=REPOSITORY+'/.github/workflows/mobile-only-internal.yml@refs/heads/main';
export const ENVIRONMENT_NAME='safety/manual-play-publication-gates - crewcheck PR #861';
export const ENVIRONMENT_NODE_ID='EN_kwDOSsPci88AAAAFXnPQNA';
export const ENVIRONMENT_ID='23059484724';
export const SUBJECT='repo:'+REPOSITORY+':environment:'+ENVIRONMENT_NAME;
function decode(part){assert(typeof part==='string'&&/^[A-Za-z0-9_-]+$/.test(part));const b=Buffer.from(part,'base64url');assert.equal(b.toString('base64url'),part);const value=JSON.parse(b.toString('utf8'));assert(value&&Object.getPrototypeOf(value)===Object.prototype);return value;}
export function checkTimes(c,now){
 for(const k of ['exp','nbf','iat'])assert(Number.isSafeInteger(c[k]));
 assert(c.exp>now&&c.exp-c.iat>0&&c.exp-c.iat<=300);
 assert(c.iat<=now+30&&c.iat>=now-300&&c.nbf<=now+30&&c.nbf>=c.iat-30&&c.nbf<c.exp);
}
export function validateClaims(c,now){
 checkTimes(c,now);assert.equal(c.iss,ISSUER);assert.equal(c.aud,AUDIENCE);assert.equal(c.sub,SUBJECT);
 assert.equal(c.repository,REPOSITORY);assert.equal(c.repository_id,REPOSITORY_ID);assert.equal(c.repository_owner,'bmedeiros1987');assert.equal(c.repository_owner_id,OWNER_ID);
 assert.equal(c.ref,'refs/heads/main');assert.equal(c.ref_type,'branch');assert.equal(c.event_name,'workflow_dispatch');assert.equal(c.runner_environment,'github-hosted');
 assert.equal(c.workflow_ref,WORKFLOW_REF);assert.equal(c.environment,ENVIRONMENT_NAME);
 assert.equal(c.environment_node_id,ENVIRONMENT_NODE_ID);
 assert(typeof c.check_run_id==='string'&&/^[1-9][0-9]*$/.test(c.check_run_id));assert.equal(c.repository_visibility,'public');
 // Reusable-workflow identity needs a separately reviewed policy; none is implied.
 assert(!Object.hasOwn(c,'job_workflow_ref'));assert(!Object.hasOwn(c,'job_workflow_sha'));
 for(const k of ['sha','workflow_sha'])assert(typeof c[k]==='string'&&/^[0-9a-f]{40}$/.test(c[k]));
 for(const k of ['run_id','run_attempt','actor_id'])assert(typeof c[k]==='string'&&/^[1-9][0-9]*$/.test(c[k]));
 assert(typeof c.jti==='string'&&c.jti.length>0&&c.jti.length<=128);
 return structuredClone(c);
}
export function createOidcVerifier({loadJwks,now=()=>Math.floor(Date.now()/1000)}={}){
 let cache=null,until=0;
 const loader=loadJwks??(url=>publicJson(url,65536));
 return async token=>{
  try{
   assert(typeof token==='string'&&token.length<=16384);const parts=token.split('.');assert.equal(parts.length,3);
   const h=decode(parts[0]);assert.deepEqual(Object.keys(h).sort(),['alg','kid','typ']);assert.equal(h.alg,'RS256');assert.equal(h.typ,'JWT');assert(typeof h.kid==='string'&&h.kid.length>0&&h.kid.length<=128);
   const time=now();if(!cache||time>=until){const result=await loader(JWKS_URL);assert(result&&Object.keys(result).length===1&&Array.isArray(result.keys)&&result.keys.length>0&&result.keys.length<=16);cache=structuredClone(result);until=time+60;}
   const keys=cache.keys.filter(k=>k.kid===h.kid);assert.equal(keys.length,1);const key=keys[0];assert.equal(key.kty,'RSA');assert.equal(key.alg,'RS256');assert.equal(key.use,'sig');assert(!key.d);if(key.key_ops)assert.deepEqual(key.key_ops,['verify']);
   const publicKey=createPublicKey({key,format:'jwk'});assert(publicKey.asymmetricKeyDetails.modulusLength>=2048&&publicKey.asymmetricKeyDetails.modulusLength<=4096);
   assert(/^[A-Za-z0-9_-]+$/.test(parts[2]));const signature=Buffer.from(parts[2],'base64url');assert.equal(signature.toString('base64url'),parts[2]);
   assert(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,signature));return validateClaims(decode(parts[1]),time);
  }catch{throw Error('OIDC identity unverified');}
 };
}
