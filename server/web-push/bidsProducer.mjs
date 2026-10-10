import { CURRENT_BIDS_ALERT_CAMPAIGN, bidsAlertStateKey } from '../v139/bidsAlertPreferences.mjs';
import { bidsCampaignPending, planBidsAlert } from '../v139/bidsAlertPolicy.mjs';
import { selectedNotificationChannels } from '../../shared/notificationChannelPreferences.mjs';
import { parseJsonColumn } from '../v139/common.mjs';
import { enqueueCrewCheckPush, dispatchPersistentPush } from './outbox.mjs';
import { pushConfiguration } from './config.mjs';
import crypto from 'node:crypto';
export const eligibilityKey=(ownerId,campaign)=>`bids-alert-eligibility:${crypto.createHash('sha256').update(JSON.stringify([ownerId,campaign.id,campaign.revision])).digest('hex')}`;
async function currentContext(db,job,now,getCampaign){
 const campaign=getCampaign();if(bidsCampaignPending(campaign).length)return false;
 const[rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[bidsAlertStateKey(job.email,job.envelope.ownerId)]);const state=parseJsonColumn(rows[0]?.payload,null);
 const[proofs]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[eligibilityKey(job.envelope.ownerId,campaign)]);const proof=parseJsonColumn(proofs[0]?.payload,null);
 // Trusted server provenance only: there is no public endpoint that writes this proof.
 if(proof?.verified!==true||proof.eligible!==true||proof.email!==job.email||proof.ownerId!==job.envelope.ownerId||proof.campaignId!==campaign.id||proof.campaignRevision!==campaign.revision||proof.airline!==campaign.audience.airline||!campaign.audience.roles.includes(proof.role)||!/^[a-f0-9]{64}$/.test(proof.sourceSha256||''))return false;
 if(state?.ownerId!==job.envelope.ownerId||state.email!==job.email)return false;
 const scheduled=job.scheduledAt===undefined?null:Date.parse(job.scheduledAt);if(job.scheduledAt!==undefined&&!Number.isFinite(scheduled))return false;
 const plan=planBidsAlert({campaign,preferences:state.preferences,ownerId:job.envelope.ownerId,eligibility:proof,receipt:state.receipt,now:scheduled??now});
 if(plan.status!=='suggested')return false;
 const local=new Intl.DateTimeFormat('en-GB',{timeZone:state.preferences.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3)),time=minutes(local),start=minutes(state.preferences.quietStart),end=minutes(state.preferences.quietEnd);
 if(start<end?time>=start&&time<end:time>=start||time<end)return false;
 return plan.contextKey===job.envelope.eventKey&&state.preferences?.enabled===true&&selectedNotificationChannels(state.preferences.channels).includes('mobilePwa')&&plan.status==='suggested'&&now<Date.parse(campaign.closesAt)&&Number.isSafeInteger(job.sourceContext?.preferencesRevision)&&state.revision===job.sourceContext.preferencesRevision&&(scheduled===null||Date.parse(plan.candidateAt)===scheduled);
}
const producerCursorKey='crewcheck-push-producer-cursor:v1';
export async function selectPushInstallations(db){
 const[cursors]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[producerCursorKey]);
 const saved=parseJsonColumn(cursors[0]?.payload,null),cursor=typeof saved?.after==='string'&&saved.after.startsWith('crewcheck-push-installation:')?saved.after:'';
 const select=(comparison,bound,limit)=>db.query(`SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-installation:%' AND JSON_EXTRACT(payload,'$.active')=true AND state_key ${comparison} ? ORDER BY state_key ASC LIMIT ?`,[bound,limit]);
 const[first]=await select('>',cursor,50);let rows=first;
 if(cursor&&rows.length<50){const[wrapped]=await select('<=',cursor,50-rows.length);rows=[...rows,...wrapped];}
 if(rows.length)await db.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)',[producerCursorKey,JSON.stringify({after:rows.at(-1).state_key})]);
 return rows;
}
export async function selectDuePushJobs(db,now){
 const[rows]=await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-outbox:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status'))='queued' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.scheduledAt'))<=? ORDER BY JSON_UNQUOTE(JSON_EXTRACT(payload,'$.scheduledAt')) ASC,state_key ASC LIMIT 20",[new Date(now).toISOString()]);return rows;
}
export async function runCrewCheckPushQueue(db,{configuration=pushConfiguration,getCampaign=()=>CURRENT_BIDS_ALERT_CAMPAIGN,clock=()=>Date.now(),send}={}){
 const config=configuration();if(config.enabled!==true||config.configured!==true)return{enabled:false,selected:0};
 const campaign=getCampaign(),verifyContext=(connection,job,now)=>currentContext(connection,job,now,getCampaign);
 if(!bidsCampaignPending(campaign).length){
  const rows=await selectPushInstallations(db);
  for(const row of rows){const installation=parseJsonColumn(row.payload,null);if(!installation?.email||!installation.ownerId)continue;
   const[prefs]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[bidsAlertStateKey(installation.email,installation.ownerId)]),state=parseJsonColumn(prefs[0]?.payload,null);if(!state)continue;
   const[proofs]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[eligibilityKey(installation.ownerId,campaign)]),proof=parseJsonColumn(proofs[0]?.payload,null);
   const plan=planBidsAlert({campaign,preferences:state.preferences,ownerId:installation.ownerId,eligibility:proof,receipt:state.receipt,now:clock()});if(!plan.candidateAt)continue;
   const envelope={schema:'crewcheck-notice-v1',ownerId:installation.ownerId,installationId:installation.installationId,consentRevision:installation.revision,eventKey:plan.contextKey,expiresAt:campaign.closesAt,route:'/app'};
   await enqueueCrewCheckPush(db,{email:installation.email,installationKey:row.state_key,envelope,scheduledAt:plan.candidateAt,sourceContext:{preferencesRevision:state.revision}},{verifyContext,clock});
  }
 }
 const jobs=await selectDuePushJobs(db,clock());
 const results=[];for(const row of jobs)results.push(await dispatchPersistentPush(db,row,{configuration:config,verifyContext,clock,...(send?{send}:{})}));return{enabled:true,selected:jobs.length,results};
}
