import {createHash} from 'node:crypto';
import {readLockedPlatformEntitlement,resolvePlatformEntitlement} from './platform-entitlement.mjs';
import {mysqlAdapter} from './mysql-platform-adapter.mjs';
import {isOwnedInfobipRepeatableRead} from './infobip-whatsapp-sql-budget.mjs';

// Private, phase-local authority. Nothing here creates identity, credit, a
// connection, transaction, timestamp observation or alternate plan definition.
const proofs=new WeakMap();
const hash=value=>createHash('sha256').update(value).digest('hex');
const time=value=>Number.isSafeInteger(value)&&value>=0;
export async function readPaidCanonicalEntitlement(c,identity,{now=Date.now,trustLegacyPremiumProfile=false}={}){
  if(!isOwnedInfobipRepeatableRead(c)||typeof now!=='function'||typeof trustLegacyPremiumProfile!=='boolean')throw Error('PAID_TRANSACTION_REQUIRED');
  const email=identity?.link?.email,publicId=identity?.publicId,bindingStamp=identity?.bindingStamp;
  const accountKey=identity?.target?.ownerAccountKey;
  if(typeof email!=='string'||typeof publicId!=='string'||hash(publicId)!==accountKey||typeof bindingStamp!=='string')return null;
  const started=now();if(!time(started))return null;
  const rows=await readLockedPlatformEntitlement(mysqlAdapter(c),{email,expectedPublicId:publicId,trustLegacyPremiumProfile});
  // Keep copied snapshots private (including mutable Date values). SQL locks
  // remain owned by c; natural expiry is checked with fresh time, not billing's
  // earlier async-read result. No proof survives a later transaction or phase.
  const profile=structuredClone(rows.profile),subscription=structuredClone(rows.subscription);
  let last=started;
  const proof=Object.freeze({});
  proofs.set(proof,{c,accountKey,bindingStamp,valid(){
    const at=now();
    if(!isOwnedInfobipRepeatableRead(c)||!time(at)||at<last)return false;
    last=at;
    return resolvePlatformEntitlement(profile,subscription,{trustLegacyPremiumProfile,now:at}).premiumAccess===true;
  }});
  return paidEntitlementValid(c,proof,{accountKey,bindingStamp})?proof:null;
}
export function paidEntitlementValid(c,proof,{accountKey,bindingStamp}={}){
  const authority=proofs.get(proof);
  return Boolean(authority)&&authority.c===c&&authority.accountKey===accountKey&&authority.bindingStamp===bindingStamp&&authority.valid()===true;
}
