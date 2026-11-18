import {createHash} from 'node:crypto';
import {parseJsonColumn} from './v139/common.mjs';

const phone=value=>typeof value==='string'&&/^[1-9]\d{7,14}$/.test(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw Error('INFOBIP_ADMISSION_CONFIGURATION');};

// Fixed approval window and quantity, not a monetary guarantee. No rolling
// reset, retry refund or env fallback. One durable row per explicit policy ID.
export function createInfobipSendAdmission(policy,{sender,now=Date.now}) {
  if(!phone(sender)||typeof now!=='function'||!policy||
    typeof policy.id!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(policy.id)||
    !Number.isSafeInteger(policy.maxAttempts)||policy.maxAttempts<1||policy.maxAttempts>10000||
    !Number.isSafeInteger(policy.validFrom)||!Number.isSafeInteger(policy.validUntil)||policy.validUntil<=policy.validFrom||policy.validUntil-policy.validFrom>24*60*60_000||
    !Array.isArray(policy.recipients)||!policy.recipients.length||policy.recipients.length>100||
    !policy.recipients.every(phone)||new Set(policy.recipients).size!==policy.recipients.length)fail();
  const snapshot=Object.freeze({id:policy.id,maxAttempts:policy.maxAttempts,validFrom:policy.validFrom,
    validUntil:policy.validUntil,recipients:Object.freeze([...policy.recipients].sort()),sender});
  const digest=hash(snapshot),stateKey='crewcheck-infobip-admission-v1:'+hash([sender,snapshot.id]);
  const allows=job=>job?.sender===sender&&snapshot.recipients.includes(job.recipient)&&
    now()>=snapshot.validFrom&&now()<snapshot.validUntil;
  return Object.freeze({
    allows,
    // Caller supplies the existing dispatch-marker transaction. Lost ACK and
    // no-I/O outcomes consume a reservation conservatively; never refund/retry.
    async reserve(c,job) {
      if(!allows(job))return false;
      await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',
        [stateKey,JSON.stringify({v:1,kind:'infobip_send_admission',digest,used:0,limit:snapshot.maxAttempts,validUntil:snapshot.validUntil})]);
      const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[stateKey]);
      const state=parseJsonColumn(rows[0]?.payload,null);
      if(state?.v!==1||state.kind!=='infobip_send_admission'||state.digest!==digest||
        state.limit!==snapshot.maxAttempts||!Number.isSafeInteger(state.used)||state.used<0||state.used>=snapshot.maxAttempts||!allows(job))return false;
      const [updated]=await c.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',
        [JSON.stringify({...state,used:state.used+1}),stateKey]);
      if(updated.affectedRows!==1)throw Error('INFOBIP_ADMISSION_UNAVAILABLE');
      return true;
    },
  });
}
