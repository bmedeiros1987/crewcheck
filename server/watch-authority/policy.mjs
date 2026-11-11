// Executable policy prototype ONLY. No route imports, I/O, credentials or store.
// Host must run transitions with its authenticated getMe authority and an atomic
// shared transaction. JS-supplied owner/epoch is NEVER an authenticated authority.
export const PURPOSE = 'crewcheck-watch-host-v1';
const text = value => typeof value === 'string' && value.length >= 1 && value.length <= 256;
const time = value => Number.isSafeInteger(value) && value >= 0;
const exact = (a,b) => ['owner','session','epoch','challenge','receiverChallenge','document','instance','purpose'].every(k=>a[k]===b[k]);
function binding(value) {
  return value && ['owner','session','epoch','challenge','receiverChallenge','document','instance'].every(k=>text(value[k])) && typeof value.receiverChallenge==='string' && /^[0-9a-f]{64}$/.test(value.receiverChallenge) && value.purpose===PURPOSE;
}
function current(authority, record, now) {
  return binding(record) && authority?.authenticated===true && authority.owner===record.owner && authority.session===record.session
    && authority.epoch===record.epoch && authority.revoked===false && time(authority.expiresAt) && authority.expiresAt>now;
}
function validRecord(record) {
  return binding(record) && text(record.proofId) && time(record.issuedAt) && time(record.proofDeadline) && time(record.leaseDeadline)
    && record.issuedAt < record.proofDeadline && record.proofDeadline < record.leaseDeadline
    && record.proofDeadline-record.issuedAt <= 30_000 && record.leaseDeadline-record.issuedAt <= 300_000
    && (record.state==='issued' ? record.redemption===null : ['consumed','revoked'].includes(record.state) && (record.redemption===null||text(record.redemption)))
    && (record.state!=='consumed'||text(record.redemption));
}
const denied = reason => Object.freeze({ok:false,reason});
export function issueGrant(authority, bindingValue, {now,proofDeadline,leaseDeadline,proofId}={}) {
  if(!time(now)||!current(authority,bindingValue,now)) return denied('authority_required');
  if(!text(proofId)||!time(proofDeadline)||!time(leaseDeadline)||proofDeadline<=now||leaseDeadline<=proofDeadline
    ||leaseDeadline>authority.expiresAt||proofDeadline-now>30_000||leaseDeadline-now>300_000) return denied('deadline_or_id_invalid');
  const {owner,session,epoch,challenge,receiverChallenge,document,instance,purpose}=bindingValue;
  return Object.freeze({ok:true,record:Object.freeze({owner,session,epoch,challenge,receiverChallenge,document,instance,purpose,proofId,
    issuedAt:now,proofDeadline,leaseDeadline,state:'issued',redemption:null})});
}
// Compare-and-replace must be atomic in the host store. Return values alone do not
// prevent races, authorize a native bridge or implement server revocation.
export function redeemGrant(authority,record,request,now) {
  if(!time(now)||!validRecord(record)||!current(authority,record,now)||record.leaseDeadline>authority.expiresAt||record.issuedAt>now)return denied('authority_required');
  if(!binding(request)||!exact(record,request)||request.proofId!==record.proofId||!text(request.redemption))return denied('binding_mismatch');
  if(record.leaseDeadline<=now||record.state==='revoked')return denied('grant_invalidated');
  if(record.state==='consumed') {
    if(record.redemption!==request.redemption)return denied('already_consumed');
    return Object.freeze({ok:true,idempotent:true,record}); // Lost ACK: original deadline only.
  }
  if(record.state!=='issued'||record.proofDeadline<=now)return denied('proof_expired');
  return Object.freeze({ok:true,idempotent:false,record:Object.freeze({...record,state:'consumed',redemption:request.redemption})});
}
export function leaseUsable(authority,record,nativeBinding,now) {
  return time(now)&&validRecord(record)&&record.issuedAt<=now&&current(authority,record,now)&&record.leaseDeadline<=authority.expiresAt&&record.state==='consumed'&&record.leaseDeadline>now&&binding(nativeBinding)&&exact(record,nativeBinding);
}
export function revokeGrant(record) {return Object.freeze({...record,state:'revoked'});}
