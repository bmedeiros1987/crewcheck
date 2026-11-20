import {TelegramBindingError,prepareTelegramBoundJobProof,verifyTelegramBoundJobProof} from './telegram-binding-state.mjs';
import {telegramBindingSql} from './telegram-binding-sql.mjs';
const fail=code=>{throw new TelegramBindingError(code);};
function identity(input){
 if(typeof input?.email!=='string'||input.email!==input.email.trim().toLowerCase()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)||typeof input.ownerId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.ownerId))fail('INVALID_QUEUE_IDENTITY');
}
async function utcSession(db){
 const[rows]=await db.query('SELECT @@session.time_zone AS session_zone,@@system_time_zone AS system_zone');
 const session=String(rows[0]?.session_zone||''),system=String(rows[0]?.system_zone||'');
 if(!['+00:00','UTC','Etc/UTC'].includes(session)&&!(session==='SYSTEM'&&['UTC','Etc/UTC','GMT'].includes(system)))fail('QUEUE_UTC_SESSION_REQUIRED');
}
async function row(db,email,key,lock=false){
 await utcSession(db);const[rows]=await db.query('SELECT id,email,job_key,channel,chat_id,telegram_username,message,status,attempts,ROUND(UNIX_TIMESTAMP(locked_at)*1000) AS locked_epoch,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduled_epoch FROM crewcheck_notification_jobs WHERE BINARY email=BINARY ? AND BINARY job_key=BINARY ?'+(lock?' FOR UPDATE':''),[email,key]);
 if(rows.length>1)fail('QUEUE_ROW_AMBIGUOUS');return rows[0]||null;
}
const selectedJob=r=>({key:r.job_key,at:Number(r.scheduled_epoch),channel:r.channel,chatId:String(r.chat_id||''),username:String(r.telegram_username||''),message:r.message});
const equalJob=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const statuses=new Set(['held','pending','processing','dispatching','sent','partial','uncertain','cancelled','expired','failed']);
// No DDL, provider, route or automatic migration. Input must come from a new
// authenticated request, not from a scan of legacy queue rows.
export async function createNewTelegramQueueJob(pool,input,{now=Date.now()}={}){
 const captured=structuredClone(input);identity(captured);if(/^(cycle:|free-day:|operational-briefing:)/i.test(String(captured.job?.key||'')))fail('RESERVED_QUEUE_SOURCE_REQUIRED');if(!Number.isSafeInteger(now)||!Number.isSafeInteger(captured.job?.at)||captured.job.at<=now||!Number.isFinite(new Date(captured.job.at).getTime()))fail('QUEUE_FUTURE_TIME_REQUIRED');
 const preparation=await prepareTelegramBoundJobProof(pool,captured,async(db,job)=>{
  if(await row(db,captured.email,job.key,true))fail('LEGACY_QUEUE_ROW_REQUIRES_REVIEW');
  await db.query("INSERT INTO crewcheck_notification_jobs(email,job_key,scheduled_at,channel,chat_id,telegram_username,message,status) VALUES(?,?,FROM_UNIXTIME(?/1000),?,?,?,?,'pending')",[captured.email,job.key,job.at,job.channel,job.chatId,job.username,job.message]);
  const inserted=await row(db,captured.email,job.key,true);if(!inserted||inserted.status!=='pending'||!equalJob(selectedJob(inserted),job))fail('QUEUE_WRITE_NOT_CONFIRMED');return {queueRowId:inserted.id};
 }).catch(error=>{if(error?.code==='LINK_COMMIT_UNCERTAIN')error.reconcileSameKeyOnly=true;throw error;});
 try{
  const observed=await readVerifiedTelegramQueueJob(pool,{email:captured.email,ownerId:captured.ownerId,key:captured.job.key});return {...observed,created:preparation.status==='proof_prepared'};
 }catch(error){
  const failure=error instanceof TelegramBindingError?error:new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');failure.reconcileSameKeyOnly=true;throw failure;
 }
}
export async function readVerifiedTelegramQueueJob(pool,input){
 const captured=structuredClone(input);identity(captured);if(typeof captured.key!=='string'||!captured.key||captured.key!==captured.key.trim()||captured.key.length>220)fail('INVALID_QUEUE_KEY');const db=telegramBindingSql(pool);let observed,reader;
 try{reader=await db.getConnection();observed=await row(reader,captured.email,captured.key);}catch(error){throw error instanceof TelegramBindingError?error:new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');}finally{reader?.release();}
 if(!observed)fail('QUEUE_ROW_MISSING');
 if(captured.claim&&(!/^[1-9]\d{0,19}$/.test(String(captured.claim.id))||!Number.isSafeInteger(captured.claim.lockedEpoch)||captured.claim.lockedEpoch<=0||!Number.isSafeInteger(captured.claim.attempts)||captured.claim.attempts<1))fail('QUEUE_CLAIM_REQUIRED');
 if(observed.email!==captured.email||!statuses.has(observed.status))fail('QUEUE_ROW_INVALID');const job=selectedJob(observed);
 const verified=await verifyTelegramBoundJobProof(pool,{email:captured.email,ownerId:captured.ownerId,job},async(connection,_job,proof)=>{
  if(!proof.queueRowId)fail('QUEUE_ROW_PROOF_REQUIRED');
  const current=await row(connection,captured.email,captured.key,true);if(!current||String(current.id)!==String(observed.id)||String(current.id)!==proof.queueRowId||!statuses.has(current.status)||!equalJob(selectedJob(current),job))fail('QUEUE_ROW_CHANGED');if(captured.claim&&(current.status!=='dispatching'||String(current.id)!==String(captured.claim.id)||Number(current.locked_epoch)!==captured.claim.lockedEpoch||Number(current.attempts)!==captured.claim.attempts))fail('QUEUE_CLAIM_CHANGED');observed=current;
 });
 // A verified observation is not a dispatch claim, active subscription or receipt.
 return {rowId:String(observed.id),status:observed.status,binding:verified.binding,job:verified.job,queueRowNotAttested:false,dispatchClaimNotAttested:!captured.claim};
}

export async function readClaimedTelegramQueueJob(pool,selected){
 const captured=structuredClone(selected),db=telegramBindingSql(pool);const[profiles]=await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[captured.email]);if(profiles.length!==1)fail('LINK_ACCOUNT_CHANGED');
 const expected={key:captured.job_key,at:Number(captured.scheduled_epoch),channel:captured.channel,chatId:String(captured.chat_id||''),username:String(captured.telegram_username||''),message:captured.message};
 const observed=await readVerifiedTelegramQueueJob(pool,{email:captured.email,ownerId:profiles[0].public_id,key:captured.job_key,claim:{id:captured.id,lockedEpoch:Number(captured.locked_epoch),attempts:Number(captured.attempts)}});
 if(!equalJob(observed.job,expected))fail('QUEUE_ROW_CHANGED');return observed;
}
