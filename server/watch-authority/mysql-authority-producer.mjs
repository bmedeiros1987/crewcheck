import {randomBytes} from 'node:crypto';
export const REGISTRY_SQL=Object.freeze({
 ensure:'INSERT INTO crewcheck_watch_sessions (owner_id, session_id, epoch, revoked, expires_at, version) VALUES (?, ?, NULL, ?, ?, 1) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id)',
 lock:'SELECT owner_id, session_id, epoch, revoked, expires_at, version FROM crewcheck_watch_sessions WHERE owner_id = ? AND session_id = ? FOR UPDATE',
 activate:'UPDATE crewcheck_watch_sessions SET epoch = ?, expires_at = ?, version = version + 1 WHERE owner_id = ? AND session_id = ? AND revoked = 0',
 invalidate:'UPDATE crewcheck_watch_sessions SET epoch = NULL, revoked = 1, version = version + 1 WHERE owner_id = ? AND session_id = ?',
});
const text=x=>typeof x==='string'&&x.length>0&&x.length<=256;
function principal(p){return p&&typeof p==='object'&&text(p.owner)&&text(p.session)&&Number.isSafeInteger(p.expiresAt)&&p.expiresAt>0;}
const key=p=>[p.owner,p.session];
// All methods REQUIRE the caller's open transaction. No connection/default/env.
// Registry row is the shared mutex: duplicate-key no-op takes an exclusive lock even
// under READ COMMITTED; logout and admission acquire exactly this same key.
export function createMysqlWatchAuthorityProducer({verifyCurrentGetMe,verifySessionInvalidation,clock,nonce=()=>randomBytes(32).toString('hex')}) {
 if(typeof verifyCurrentGetMe!=='function'||typeof verifySessionInvalidation!=='function'||typeof clock!=='function')throw new TypeError('Canonical host verification callbacks and server clock required');
 async function lock(c,p,create=false,revoked=false){
  if(create)await c.execute(REGISTRY_SQL.ensure,[...key(p),revoked?1:0,p.expiresAt]);
  const [rows]=await c.execute(REGISTRY_SQL.lock,key(p));
  if(rows.length!==1)return null;
  const r=rows[0];
  if(r.owner_id!==p.owner||r.session_id!==p.session||![0,1].includes(r.revoked)||!Number.isSafeInteger(r.expires_at)||!Number.isSafeInteger(r.version)||r.version<1)throw new Error('Corrupt Watch authority registry');
  if(r.epoch!==null&&!(typeof r.epoch==='string'&&/^[0-9a-f]{64}$/.test(r.epoch)))throw new Error('Invalid Watch epoch');
  return r;
 }
 function authority(r){return !r||r.revoked===1||!r.epoch||r.expires_at<=clock()?null:{authenticated:true,owner:r.owner_id,session:r.session_id,epoch:r.epoch,revoked:false,expiresAt:r.expires_at};}
 async function verifiedInvalidation(c,context,p){
  // Hook MUST derive canonical identity itself; client-supplied key is not auth.
  const v=await verifySessionInvalidation(c,context);
  if(!principal(v)||v.owner!==p.owner||v.session!==p.session)return null;
  return v;
 }
 return Object.freeze({
  async lockCurrentGetMe(c,hostContext){
   const p=await verifyCurrentGetMe(c,hostContext);
   if(!principal(p)||p.expiresAt<=clock())return null;
   let r=await lock(c,p,true,false);
   if(r.revoked===1)return null; // A tombstoned session is never resurrected.
   const epoch=r.epoch||nonce();
   if(typeof epoch!=='string'||!/^[0-9a-f]{64}$/.test(epoch))throw new Error('Invalid CSPRNG epoch');
   const [result]=await c.execute(REGISTRY_SQL.activate,[epoch,p.expiresAt,...key(p)]);
   if(result.affectedRows!==1)throw new Error('Authority activation lost lock');
   r=await lock(c,p);return authority(r);
  },
  async lockCurrentSession(c,p){if(!text(p?.owner)||!text(p?.session))return null;return authority(await lock(c,p));},
  async lockRevocation(c,context,p){
   const v=await verifiedInvalidation(c,context,p);if(!v)return null;
   await lock(c,v,true,true);
   return {authorized:true,owner:v.owner,session:v.session};
  },
  async invalidateSession(c,hostContext){
   const p=await verifySessionInvalidation(c,hostContext);
   if(!principal(p))return {ok:false,reason:'host_invalidation_required'};
   await lock(c,p,true,true);
   const [result]=await c.execute(REGISTRY_SQL.invalidate,key(p));
   if(result.affectedRows!==1)throw new Error('Authority tombstone not committed');
   return {ok:true};
  },
 });
}
