import assert from 'node:assert/strict';
import {publicJson} from '../../server/release-journal/public-json.mjs';
const url='https://api.github.com/repos/bmedeiros1987/crewcheck/actions/runs/123/approvals';
const response=(body,options={})=>{const r=new Response(body,options);Object.defineProperty(r,'url',{value:url,configurable:true});return r;};
let calls=0;globalThis.fetch=async(target,options)=>{calls++;assert.equal(target,url);assert.equal(options.redirect,'error');assert(options.signal);assert(!Object.keys(options.headers).some(k=>k.toLowerCase()==='authorization'));return response('[]');};
assert.deepEqual(await publicJson(url,10,{rejectPagination:true}),[]);assert.equal(calls,1);
for(const r of [response('[]',{status:403}),response('[]',{headers:{link:'next'}}),response('[]',{headers:{'content-length':'1000'}}),response('x'.repeat(11)),response(new Uint8Array([0xff]))]){
 globalThis.fetch=async()=>r;await assert.rejects(publicJson(url,10,{rejectPagination:true}));
}
const moved=response('[]');Object.defineProperty(moved,'url',{value:'https://attacker.test'});globalThis.fetch=async()=>moved;await assert.rejects(publicJson(url,10));
globalThis.fetch=async()=>{throw Error('Redirect/network refused');};await assert.rejects(publicJson(url,10));
console.log('PASS independent GET requires complete fixed HTTPS200, no credentials/redirect/pagination, byte bounds before parsing and fatal UTF8; provider failures remain unverified');
// Exercise the default production GET path with synthetic HTTP bodies, no loader override.
const {reviewFixture}=await import('./release_review_fixture.mjs');
const {createGitHubReviewProvider}=await import('../../server/release-journal/github-review.mjs');
const {createOidcVerifier,JWKS_URL}=await import('../../server/release-journal/oidc.mjs');
const {fixtureToken,fixtureJwk}=await import('./test_release_oidc.mjs');
const f=reviewFixture();const accessed=[];
globalThis.fetch=async(target,options)=>{accessed.push(target);assert.equal(options.redirect,'error');assert(!Object.keys(options.headers).some(k=>k.toLowerCase()==='authorization'));const body=target===JWKS_URL?{keys:[fixtureJwk]}:await f.request(target);const r=new Response(JSON.stringify(body));Object.defineProperty(r,'url',{value:target});return r;};
const claims=await createOidcVerifier({now:()=>10000})(fixtureToken(f.claims));
const p=createGitHubReviewProvider({policy:f.policy,now:()=>10000});assert.equal((await p.verify(claims,{binding:f.binding,operation:'probe'})).state,'approved');assert.equal(accessed.length,5);
console.log('PASS production JWT/JWKS and GitHub GET wiring uses only fixed public sources with fictional HTTP responses; no credential forwarded');
