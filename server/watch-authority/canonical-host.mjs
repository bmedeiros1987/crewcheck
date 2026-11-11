import {createMysqlWatchAuthorityProducer} from './mysql-authority-producer.mjs';
import {createMysqlWatchGrantAdapter} from './mysql-adapter.mjs';
// Host capabilities are private objects, never request JSON or a cached JS assertion.
export function createCanonicalWatchHost({pool,verifyJwt,requestToken,clock=Date.now}) {
 const contexts=new WeakMap();
 function principal(req) {
  const token=requestToken(req),p=verifyJwt(token),now=clock();
  if(!p||p.iss!=='crewcheck'||p.aud!=='crewcheck-web'||typeof p.sub!=='string'||!p.sub||typeof p.email!=='string'||!p.email||typeof p.jti!=='string'||!/^watch1_[0-9a-f]{64}$/.test(p.jti)||!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(p.iat)||p.exp<=p.iat||p.iat*1000>now||p.exp*1000<=now||p.mustChangePassword)return null;
  return {owner:p.sub,session:p.jti,expiresAt:p.exp*1000,email:p.email.trim().toLowerCase(),token};
 }
 async function verify(c,context,accountRequired) {
  const held=contexts.get(context);if(!held)return null;
  const live=principal(held.req);if(!live||live.token!==held.token||live.owner!==held.owner||live.session!==held.session)return null;
  if(accountRequired){
   const [rows]=await c.execute('SELECT p.public_id, a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? LIMIT 1',[live.email]);
   if(rows.length!==1||rows[0].public_id!==live.owner||rows[0].must_change_password)return null;
  }
  return live;
 }
 const producer=createMysqlWatchAuthorityProducer({clock,verifyCurrentGetMe:(c,ctx)=>verify(c,ctx,true),verifySessionInvalidation:(c,ctx)=>verify(c,ctx,false)});
 const adapter=createMysqlWatchGrantAdapter({pool,authorityProducer:producer,clock});
 function context(req,user){
  const p=principal(req);if(!p||user&&(user.id!==p.owner||String(user.email).toLowerCase()!==p.email||user.mustChangePassword||user.verified!==true))return null;
  const cap=Object.freeze({});contexts.set(cap,{...p,req});return cap;
 }
 return Object.freeze({
  async issueAfterCanonicalGetMe(req,user,binding){if(!user||user.verified!==true)return {ok:false,reason:'canonical_getme_required'};const cap=context(req,user);if(!cap)return {ok:false,reason:'current_canonical_session_required'};try{return await adapter.issueFromGetMe(cap,binding);}finally{contexts.delete(cap);}},
  async invalidateCanonicalLogout(req){const cap=context(req);if(!cap)return {ok:false,reason:'current_canonical_session_required'};try{return await adapter.invalidateSession(cap);}finally{contexts.delete(cap);}},
  consumeNativeProof:request=>adapter.consume(request),
 });
}
// Invoke the SAME real getMe handler. Account enrichment/DDL completes before the
// separate Watch transaction; no fabricated getMe body authorizes a proof.
export async function captureCanonicalGetMe(me,req,db){
 let status=0,payload=null;
 const sink={writeHead(code){status=code;},end(raw){try{payload=JSON.parse(raw);}catch{payload=null;}}};
 await me(req,sink,db);
 return status===200&&payload?.ok===true&&payload?.authenticated===true?payload.user:null;
}
