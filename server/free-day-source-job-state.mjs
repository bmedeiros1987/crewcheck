import crypto from 'node:crypto';
export const SOURCE_JOB_PREFIX='free-day:source:';
export const SOURCE_JOB_STATE_PREFIX='notification-free-day-source-job:';
export const SOURCE_JOB_SCOPE='free-day-source-simulation-v1';
export const sourceJobHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceJobStateKey=(user,key)=>SOURCE_JOB_STATE_PREFIX+sourceJobHash([user.email,user.id,key]);
export async function cancelSourceJobs(c,user) {
  const [result]=await c.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND LEFT(job_key,16)='free-day:source:' AND status IN ('held','pending','processing')",[user.email]);
  // Receipt/link/audit metadata is removed; the queue retains only a cancelled
  // hashed key and generic text, without destination or document information.
  await c.query("DELETE FROM crewcheck_telegram_state WHERE state_key LIKE 'notification-free-day-source-job:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerId'))=?",[user.email,user.id]);
  return result.affectedRows;
}
