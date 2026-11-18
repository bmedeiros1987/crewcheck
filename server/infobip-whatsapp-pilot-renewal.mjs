import {createHash,createHmac} from 'node:crypto';
import {parseJsonColumn} from './v139/common.mjs';
import {createOperationalPilotScope,operationalPilotOriginalSnapshot} from './infobip-whatsapp-operational-pilot.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prefix='crewcheck-infobip-inbound-v1:';
const fail=()=>{throw Error('INFOBIP_PILOT_RENEWAL_CONFIGURATION');};

// One explicitly reauthorized pickup window; never changes the original digest,
// quantity, category keys or original validity. No DDL, repair or standalone I/O.
export function createInfobipPilotRenewalAdmission(configuration,admission,{linkHashKey,now=Date.now}={}) {
 const policy=structuredClone(admission),input=structuredClone(configuration);
 const scope=createOperationalPilotScope(input,policy,{now}),renewal=scope.renewal;
 if(!renewal||typeof linkHashKey!=='string'||linkHashKey.length<32)fail();
 const originalDigest=hash(operationalPilotOriginalSnapshot(input,policy));
 const key='crewcheck-infobip-admission-v1:'+hash([input.sender,policy.id]);
 return Object.freeze({
  allows:scope.allows,
  async reserve(c,job){
   if(!scope.allows(job))return false;
   let owner;try{owner=JSON.parse(job.bindingStamp)[0];}catch{return false;}
   if(!scope.allowsOwner(owner))return false;
   const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
   const state=parseJsonColumn(rows[0]?.payload,null);
   if(state?.v!==1||state.kind!=='infobip_send_admission'||state.digest!==originalDigest||state.validUntil!==policy.validUntil||
     state.limit!==3||state.used!==renewal.expectedUsed||state.execution!==undefined)return false;
   const ownerHash=createHmac('sha256',linkHashKey).update(owner).digest('hex');
   const senderHash=createHmac('sha256',linkHashKey).update(input.sender).digest('hex');
   const recipientHash=createHmac('sha256',linkHashKey).update(policy.recipients[0]).digest('hex');
   // Minimal projection only. The profile lock and quantity lock are already
   // held by dispatch. Delivered projection is monotonic; any unknown work
   // blocks renewal, rather than refunding an attempt or guessing its outcome.
   const [history]=await c.query(`SELECT JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status')) AS status,
     JSON_EXTRACT(payload,'$.report.attemptAt') AS attempt_at,
     JSON_EXTRACT(payload,'$.report.deliveryStatusId') AS delivery_id,
     JSON_UNQUOTE(JSON_EXTRACT(payload,'$.report.senderHash')) AS sender_hash,
     JSON_UNQUOTE(JSON_EXTRACT(payload,'$.report.recipientHash')) AS recipient_hash,
     JSON_EXTRACT(payload,'$.engineActive') AS active
     FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-inbound-v1:%'
     AND CAST(state_key AS BINARY)>? AND CAST(state_key AS BINARY)<?
     AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerHash'))=?`,[prefix,prefix+'~',ownerHash]);
   if(history.some(row=>[true,1,'1','true'].includes(row.active)||['preparing','dispatching','uncertain'].includes(row.status)))return false;
   const prior=history.filter(row=>row.sender_hash===senderHash&&row.recipient_hash===recipientHash&&
    row.attempt_at!==null&&Number(row.attempt_at)>=policy.validFrom&&Number(row.attempt_at)<policy.validUntil);
   if(prior.length!==2||prior.some(row=>row.status!=='delivered'||Number(row.delivery_id)!==5)||!scope.allows(job))return false;
   const execution={version:1,revision:renewal.revision,previousRevision:renewal.expectedRevision,
    authorizationReference:renewal.authorizationReference,authorizedAt:renewal.authorizedAt,
    scopeDigest:renewal.expectedScopeDigest,validFrom:renewal.validFrom,validUntil:renewal.validUntil,
    appliedAt:now(),startingUsed:state.used};
   const [updated]=await c.query(`UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3)
     WHERE state_key=? AND JSON_EXTRACT(payload,'$.used')=? AND JSON_EXTRACT(payload,'$.limit')=3
     AND JSON_EXTRACT(payload,'$.execution') IS NULL`,[JSON.stringify({...state,used:state.used+1,execution}),key,renewal.expectedUsed]);
   if(updated.affectedRows!==1)throw Error('INFOBIP_PILOT_RENEWAL_CAS_FAILED');
   return true;
  },
 });
}
