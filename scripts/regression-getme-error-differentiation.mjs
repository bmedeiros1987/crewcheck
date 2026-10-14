import assert from 'node:assert/strict';
import { authFixture, flushAuth, realServerMe, syntheticUser } from './auth-contract-fixture.mjs';
let checks=0;
const cases=[
 [401,'AUTH_REQUIRED','session_expired'],[401,undefined,'session_expired'],[401,'','session_expired'],[403,'','account_state'],[429,'','rate_limited'],
 [500,'','backend_unavailable'],[502,'','backend_unavailable'],[503,'','backend_unavailable'],
 [200,'DATABASE_REQUIRED','backend_unavailable'],[200,'DATABASE_MIGRATION_REQUIRED','backend_unavailable'],
 [200,'BACKEND_UNAVAILABLE','backend_unavailable'],[404,'','other'],['network','','backend_unavailable'],['timeout','','backend_unavailable'],
];
// Exercise actual getMe + Protected together, not a string shape of their catch.
for(const [status,code,reason] of cases){
 const f=authFixture();f.seed();let expiries=0;f.window.addEventListener('crewcheck:auth-expired',()=>expiries++);f.mount();
 assert.equal(f.requests[0].url,'/api/auth/me');assert.equal(f.requests[0].options.headers.authorization,'Bearer expired-synthetic-token');
 assert(f.requests[0].options.signal instanceof AbortSignal,'real getMe passes abort signal');
 if(status==='network')f.requests[0].reject(new Error('SYNTHETIC_NETWORK'));
 else if(status==='timeout'){await f.advance(9999);assert(!f.requests[0].options.signal.aborted);await f.advance(10000);assert(f.requests[0].options.signal.aborted);}
 else f.requests[0].respond(status,code===undefined?{}:{ok:false,code});
 await flushAuth();
 if(reason==='session_expired'){assert.deepEqual(f.routes,['/login']);assert.equal(expiries,1);assert.equal(f.data.get('crewcheck_auth_token'),undefined);assert(!f.states.includes(true));}
 else {assert.deepEqual(f.routes,[]);assert.equal(expiries,0);assert.equal(f.data.get('crewcheck_auth_token'),'expired-synthetic-token');assert(f.states.includes(true),'recoverable error releases local access');}
 assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,syntheticUser.id);assert.equal(f.data.get('crewcheck_latest_roster_bundle'),'SYNTHETIC_ROSTER');assert.equal(f.sessionData.get('crewcheck_roster'),'SYNTHETIC_ROSTER');
 assert(!f.data.has('crewcheck_demo_mode_seen'));assert(!f.sessionData.has('crewcheck_demo_active'));assert.equal(f.requests.length,1,'no failure may activate partner demo');assert.equal(f.timers.size,0);f.unmount();checks++;
 // Also verify the public error object emitted by the actual transport.
 const direct=authFixture();direct.seed();const pending=direct.auth.getMe().then(()=>null,error=>error);
 if(status==='network')direct.requests[0].reject(new Error('SYNTHETIC_NETWORK'));
 else if(status==='timeout')await direct.advance(10000);
 else direct.requests[0].respond(status,code===undefined?{}:{ok:false,code});
 const error=await pending;assert(error instanceof direct.auth.AuthClientError);assert.equal(error.reason,reason);assert.notEqual(error.message,'SYNTHETIC_NETWORK');assert.equal(direct.timers.size,0);checks++;
}
// Preserve the explicit AUTH_REQUIRED versus wrong-password distinction on public calls.
for(const [code,reason]of [['AUTH_REQUIRED','session_expired'],['INVALID_CREDENTIALS','invalid_credentials'],[undefined,'invalid_credentials'],['','invalid_credentials']]){
 const f=authFixture();f.seed();let expiries=0;f.window.addEventListener('crewcheck:auth-expired',()=>expiries++);const pending=f.auth.authFetch('/api/auth/login');
 assert.equal(f.requests[0].options.headers.authorization,undefined);f.requests[0].respond(401,code===undefined?{}:{ok:false,code});
 await assert.rejects(pending,error=>error.reason===reason);assert.equal(f.data.get('crewcheck_auth_token'),'expired-synthetic-token','public request did not authenticate this credential and cannot expire it');assert.equal(expiries,0);assert.equal(f.data.get('crewcheck_latest_roster_bundle'),'SYNTHETIC_ROSTER');assert.equal(f.sessionData.get('crewcheck_roster'),'SYNTHETIC_ROSTER');checks++;
}
// Execute the real server handler: database failure must finish with503, not hang/leak.
for(const mode of ['database','invalid-token','unavailable-verifier']){
 let result,queries=0;const errors=[];
 const handler=realServerMe({requestToken:()=> 'SYNTHETIC_TOKEN',verifyJwt:()=>{if(mode==='invalid-token')throw{status:401,message:'Invalid token'};if(mode==='unavailable-verifier')throw{status:503,message:'Unavailable'};return{email:syntheticUser.email};},safeEmail:value=>String(value||'').toLowerCase(),sendJson:(_res,status,body)=>{result={status,body};return result;},console:{error:(...args)=>errors.push(args)}});
 await handler({}, {}, {query:async()=>{queries++;throw Object.assign(new Error('SYNTHETIC_PRIVATE_DB_DETAIL'),{code:'SYNTHETIC_DB_FAILURE'});}});
 assert.equal(result.status,mode==='invalid-token'?401:503);assert.equal(result.body.authenticated,false);
 if(mode==='database'){assert.equal(queries,1);assert.equal(result.body.code,'BACKEND_UNAVAILABLE');assert(!JSON.stringify(result.body).includes('SYNTHETIC_PRIVATE_DB_DETAIL'));assert.equal(errors.length,1);}else assert.equal(queries,0);checks++;
}
console.log('PASS getMe differentiation: '+checks+' real transport/Protected/timeout/server failure cases');
