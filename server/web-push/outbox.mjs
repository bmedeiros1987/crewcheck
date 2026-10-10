import crypto from 'node:crypto';
import { parseJsonColumn } from '../v139/common.mjs';
import { openSubscription } from './installationRegistry.mjs';
import { validPushEnvelope, pushEventKey } from '../../shared/crewcheckPushContract.mjs';
import { sendCrewCheckPush } from './provider.mjs';
export const outboxKey = envelope => `crewcheck-push-outbox:${crypto.createHash('sha256').update(pushEventKey(envelope.ownerId,envelope.eventKey,envelope.installationId,envelope.consentRevision)).digest('hex')}`;
const installationMatches = (record, envelope, email) => record?.active === true && record.email === email && record.ownerId === envelope.ownerId && record.installationId === envelope.installationId && record.revision === envelope.consentRevision;
async function lockState(connection, key) { const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]); return parseJsonColumn(rows[0]?.payload,null); }
async function save(connection,key,value) { await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify(value),key]); }
export async function enqueueCrewCheckPush(db, { email, installationKey, envelope, scheduledAt, sourceContext }, { verifyContext, clock=()=>Date.now() }) {
  if (!validPushEnvelope(envelope) || !email || !installationKey?.startsWith('crewcheck-push-installation:') || !Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt)>=Date.parse(envelope.expiresAt)) throw Error('Contexto de aviso inválido.');
  const connection=await db.getConnection(),key=outboxKey(envelope);
  try {
    await connection.beginTransaction();
    const [owners]=await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
    const installation=await lockState(connection,installationKey);
    if (owners[0]?.public_id!==envelope.ownerId || !installationMatches(installation,envelope,email) || !await verifyContext(connection,{email,envelope,sourceContext},clock())) { await connection.rollback(); return {status:'blocked',received:null}; }
    await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[key,JSON.stringify({email,ownerId:envelope.ownerId,installationKey,envelope,scheduledAt,sourceContext,status:'queued',received:null})]);
    const state=await lockState(connection,key);
    if(state.status==='queued'&&state.sourceContext?.preferencesRevision!==sourceContext?.preferencesRevision){await save(connection,key,{...state,scheduledAt,sourceContext});}
    await connection.commit(); return {status:state.status,received:null};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
export async function dispatchPersistentPush(db, selected, { configuration, verifyContext, clock=()=>Date.now(), send=sendCrewCheckPush }) {
  if (configuration?.enabled!==true || configuration?.configured!==true) return {status:'disabled',received:null};
  const key=selected.state_key,initial=parseJsonColumn(selected.payload,null);
  if (!key?.startsWith('crewcheck-push-outbox:') || !initial?.email || !validPushEnvelope(initial.envelope) || key!==outboxKey(initial.envelope)) return {status:'blocked',received:null};
  const transaction=async run=>{const c=await db.getConnection();try{await c.beginTransaction();const [owners]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[initial.email]);const installation=await lockState(c,initial.installationKey),job=await lockState(c,key);const result=await run(c,owners[0],installation,job);await c.commit();return result;}catch(error){await c.rollback();throw error;}finally{c.release();}};
  // Commit dispatching BEFORE provider I/O: a crash/uncertain outcome never returns
  // the job to queued. Phase two holds ownership/revocation locks during send.
  const claim=await transaction(async(c,owner,installation,job)=>{
    if (!job || job.status!=='queued') return {status:job?.status||'missing',received:null};
    if (job.email!==initial.email || job.ownerId!==initial.envelope.ownerId || outboxKey(job.envelope)!==key || job.installationKey!==initial.installationKey) return {status:'blocked',received:null};
    if (Date.parse(job.scheduledAt)>clock()) return {status:'not_due',received:null};
    if (owner?.public_id!==job.ownerId || !installationMatches(installation,job.envelope,job.email) || Date.parse(job.envelope.expiresAt)<=clock() || !await verifyContext(c,job,clock())) { await save(c,key,{...job,status:'cancelled'});return {status:'cancelled',received:null}; }
    const claimId=crypto.randomUUID();await save(c,key,{...job,status:'dispatching',claimId});return {claimId};
  });
  if (!claim.claimId) return claim;
  return transaction(async(c,owner,installation,job)=>{
    if (job?.status!=='dispatching' || job.claimId!==claim.claimId) return {status:'uncertain',received:null};
    if (owner?.public_id!==job.ownerId || !installationMatches(installation,job.envelope,job.email) || !await verifyContext(c,job,clock()) || Date.parse(job.envelope.expiresAt)<=clock()) {await save(c,key,{...job,status:'cancelled'});return {status:'cancelled',received:null};}
    let result;try{const subscription=openSubscription(installation.sealed,configuration.encryptionKey,[job.ownerId,job.envelope.installationId,job.envelope.consentRevision]);result=await send(subscription,job.envelope,configuration,{now:clock(),clock});}catch{result={status:'uncertain',received:null};}
    const status=['accepted_unconfirmed','expired_subscription','expired','disabled'].includes(result.status)?result.status:'uncertain';
    await save(c,key,{...job,status,received:null});
    if(status==='expired_subscription')await save(c,job.installationKey,{...installation,active:false,sealed:null,revision:installation.revision+1});
    return {status,received:null};
  });
}
export async function reconcilePushReceipts(db, identity, reports) {
  if(!Array.isArray(reports)||reports.length>50)throw Object.assign(new Error('Confirmação inválida.'),{status:400});
  const connection=await db.getConnection();let reconciled=0;
  try{await connection.beginTransaction();const[owners]=await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[identity.email]);if(owners[0]?.public_id!==identity.ownerId)throw Object.assign(new Error('Sessão inválida.'),{status:401});
    for(const report of reports){if(!validPushEnvelope(report.envelope)||report.envelope.ownerId!==identity.ownerId||!['display_api_resolved','uncertain','clicked'].includes(report.status))continue;const key=outboxKey(report.envelope),job=await lockState(connection,key);if(!job||job.email!==identity.email||job.ownerId!==identity.ownerId||['schema','ownerId','installationId','consentRevision','eventKey','expiresAt','route'].some(field=>job.envelope[field]!==report.envelope[field])||!['accepted_unconfirmed','dispatching','uncertain'].includes(job.status))continue;
      // Authenticated device report is evidence of an API/click attempt, never proof
      // of delivery/read. No client report can change BIDS completion or scheduling.
      const receipt={status:report.status,received:null};if(job.deviceReport?.status==='clicked'&&report.status!=='clicked')continue;if(job.deviceReport?.status!==receipt.status||job.deviceReport?.received!==null){await save(connection,key,{...job,deviceReport:receipt,received:null});reconciled++;}}
    await connection.commit();return{reconciled,received:null};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
