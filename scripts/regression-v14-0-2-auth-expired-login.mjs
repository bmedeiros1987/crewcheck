import assert from 'node:assert/strict';
import { authFixture, syntheticUser } from './auth-contract-fixture.mjs';
let checks=0;
const intact=f=>{assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,syntheticUser.id);assert.equal(f.data.get('crewcheck_latest_roster_bundle'),'SYNTHETIC_ROSTER');assert.equal(f.sessionData.get('crewcheck_roster'),'SYNTHETIC_ROSTER');};
// All public auth APIs must omit a stale bearer, even without login's pre-clear.
for(const path of ['/api/auth/config','/api/auth/login','/api/auth/register','/api/auth/verify-email','/api/auth/resend-verification','/api/auth/request-reset','/api/auth/reset-password']) {
 const f=authFixture();f.seed();const pending=f.auth.authFetch(path+'?synthetic=1');
 assert.equal(f.requests[0].options.headers.authorization,undefined,path+' must be public');
 assert.equal(f.data.get('crewcheck_auth_token'),'expired-synthetic-token');
 f.requests[0].respond(200,{ok:true});await pending;intact(f);checks++;
}
{
 const f=authFixture();f.seed();let expiries=0;f.window.addEventListener('crewcheck:auth-expired',()=>expiries++);
 const pending=f.auth.login(syntheticUser.email,'SYNTHETIC_PASSWORD');
 assert.equal(f.data.get('crewcheck_auth_token'),undefined,'login clears old credential before fetch');intact(f);
 const request=f.requests[0];assert.equal(request.url,'/api/auth/login');assert.equal(request.options.method,'POST');assert.equal(request.options.headers.authorization,undefined);assert.equal(JSON.parse(request.options.body).email,syntheticUser.email);
 request.respond(200,{ok:true,token:'new-synthetic-token',user:syntheticUser});await pending;
 assert.equal(f.data.get('crewcheck_auth_token'),'new-synthetic-token');assert.equal(expiries,1);intact(f);checks++;
}
{
 const f=authFixture();f.seed();let expiries=0;f.window.addEventListener('crewcheck:auth-expired',()=>expiries++);
 const pending=f.auth.login(syntheticUser.email,'SYNTHETIC_WRONG_PASSWORD');
 f.requests[0].respond(401,{ok:false,code:'INVALID_CREDENTIALS'});
 await assert.rejects(pending,error=>error instanceof f.auth.AuthClientError&&error.reason==='invalid_credentials'&&/senha inválidos/.test(error.message));
 assert.equal(expiries,1,'invalid password must not become a second session expiry');intact(f);checks++;
}
{
 const f=authFixture();f.seed();let expiries=0;f.window.addEventListener('crewcheck:auth-expired',()=>expiries++);
 const pending=f.auth.authFetch('/api/platform/notifications/preferences');
 assert.equal(f.requests[0].options.headers.authorization,'Bearer expired-synthetic-token','protected request must authenticate');
 f.requests[0].respond(401,{ok:false,code:'AUTH_REQUIRED'});
 await assert.rejects(pending,error=>error instanceof f.auth.AuthClientError&&error.reason==='session_expired');
 assert.equal(f.data.get('crewcheck_auth_token'),undefined);assert.equal(expiries,1);intact(f);checks++;
}
console.log('PASS auth expired-login: '+checks+' real public/protected request and persistence cases');
