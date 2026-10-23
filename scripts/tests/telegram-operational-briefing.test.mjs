import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runTelegramBriefingCycle, changeTelegramBriefingConsent, handleTelegramBriefingConsent } from '../../server/concierge/telegram-briefing.mjs';
import { dispatchClaimedJob, safeScheduleJob } from '../../server/notification-job-safety.mjs';
const NOW = Date.parse('2099-10-06T06:00:00Z');
const EMAIL = 'synthetic@example.invalid', OWNER = 'CC-SYNTHETIC-A', CHAT = '123456789';
const copy = x => structuredClone(x);
function fixture() {
 let clock = NOW, nextId = 1;
 const records = new Map(), jobs = [], sent = [];
 const link = { email: EMAIL, chatId: CHAT, code: 'synthetic-only', linkedAt: '2099-10-01T00:00:00Z' };
 records.set('link-email:'+EMAIL, copy(link)); records.set('link-chat:'+CHAT, copy(link));
 const roster = { year:2099, month:10, base:'GRU',rank:'CCM',rawText:'',days:[{date:'06/10/2099',dayNumber:6,month:10,year:2099,dayOfWeek:'',type:'VOO',pairingCode:'TEST123',dutyReport:'05:30',dutyDebrief:'10:00',isNextDay:false,continuityInferred:false,base:'GRU',rawText:'',legs:[{id:'synthetic-leg',flightNumber:'LA1234',origin:'GRU',destination:'BSB',departureTime:'06:30',arrivalTime:'08:30',workType:'OP'}]}] };
 const source = {account_email:EMAIL,account_public_id:OWNER,id:'synthetic-roster',owner_email:EMAIL,roster_key:'2099-10',roster,fingerprint:'a'.repeat(64),active:1,revision_seconds:(NOW-60000)/1000};
 let owner = OWNER, commitHook = null, finalWriteFails = false;
 async function query(sql,args=[]) {
  if(sql.startsWith('SELECT p.public_id,a.must_change_password'))return [[{public_id:owner,must_change_password:0}]];
  if(sql.startsWith('SELECT public_id'))return [[{public_id:owner}]];
  if(sql.startsWith('SELECT id FROM crewcheck_platform_rosters'))return [[{id:source.id}]];
  if(sql.startsWith('SELECT p.email AS account_email'))return [[copy(source)]];
  if(sql.startsWith('SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE'))return [[...records].filter(([key,value])=>key.startsWith('briefing-consent:')&&value.enabled).map(([state_key,payload])=>({state_key,payload:copy(payload)}))];
  if(sql.startsWith('SELECT payload FROM crewcheck_telegram_state WHERE state_key='))return [records.has(args[0])?[{payload:copy(records.get(args[0]))}]:[]];
  if(sql.startsWith('UPDATE crewcheck_telegram_state SET updated_at='))return [{affectedRows:1}];
  if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){records.set(args[0],JSON.parse(args[1]));return [{affectedRows:1}];}
  if(sql.startsWith('SELECT id,status FROM crewcheck_notification_jobs'))return [jobs.filter(j=>j.email===args[0]&&j.job_key===args[1]).map(copy)];
  if(sql.startsWith('INSERT INTO crewcheck_notification_jobs')){if(!jobs.some(j=>j.email===args[0]&&j.job_key===args[1]))jobs.push({id:nextId++,email:args[0],job_key:args[1],scheduled_epoch:args[2],channel:'telegram',chat_id:args[3],message:args[4],status:'pending',locked_at:null});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT *,'))return [jobs.filter(j=>j.id===args[0]&&j.status==='processing'&&(args.length===1||j.locked_at===args[1])).map(copy)];
  if(sql.startsWith("SELECT id FROM crewcheck_notification_jobs"))return [jobs.filter(j=>j.email===args[0]&&j.status==='dispatching').map(copy)];
  if(sql.startsWith('UPDATE crewcheck_notification_jobs SET scheduled_at=')){const j=jobs.find(j=>j.id===args[3]&&j.status==='pending');if(j)Object.assign(j,{scheduled_epoch:args[0],chat_id:args[1],message:args[2]});return [{affectedRows:j?1:0}];}
  if(sql.startsWith("UPDATE crewcheck_notification_jobs SET status='cancelled'")){
   let affected=0;for(const j of jobs){const matches=sql.includes('LEFT(job_key')?j.email===args[0]&&['pending','processing'].includes(j.status):j.id===args[0]&&j.status==='processing'&&j.locked_at===args[1];if(matches){j.status='cancelled';affected++;}}return [{affectedRows:affected}];
  }
  if(sql.startsWith("UPDATE crewcheck_notification_jobs SET status='dispatching'")){const j=jobs.find(j=>j.id===args[0]&&j.status==='processing'&&j.locked_at===args[1]);if(j)j.status='dispatching';return [{affectedRows:j?1:0}];}
  if(sql.startsWith("UPDATE crewcheck_notification_jobs SET status='expired'")){const j=jobs.find(j=>j.id===args[0]&&j.status==='dispatching');if(j)j.status='expired';return [{affectedRows:j?1:0}];}
  if(sql.startsWith('UPDATE crewcheck_notification_jobs SET status=?')){if(finalWriteFails)throw Error('Synthetic final-write outage');const j=jobs.find(j=>j.id===args[3]&&j.status==='dispatching'&&j.locked_at===args[4]);if(j)j.status=args[0];return [{affectedRows:j?1:0}];}
  throw Error('Unexpected SQL: '+sql);
 }
 const db = {query,async getConnection(){return {query,async beginTransaction(){},async commit(){if(commitHook)await commitHook();},async rollback(){},release(){}};}};
 const identity = {db,email:EMAIL,profile:{public_id:OWNER},payload:{iss:'crewcheck',aud:'crewcheck-web',email:EMAIL,sub:OWNER,exp:(NOW+86400000)/1000}};
 const options = {enabled:true,clock:()=>clock};
 return {db,identity,records,jobs,sent,source,options,get clock(){return clock;},set clock(v){clock=v;},set owner(v){owner=v;},set commitHook(v){commitHook=v;},set finalWriteFails(v){finalWriteFails=v;},
 async grant(overrides={}){return changeTelegramBriefingConsent(db,identity,{enabled:true,confirmed:true,expectedRevision:0,preferences:{timing:'default',timeZone:'America/Sao_Paulo'},...overrides},options);},
 async plan(){return runTelegramBriefingCycle(db,options);},
 claim(){const job=jobs.find(j=>j.status==='pending');assert.ok(job);job.status='processing';job.locked_at='synthetic-lease';return {id:job.id,job_key:job.job_key};},
 async dispatch(selected, deliver=async job=>{sent.push(copy(job));return {ok:true};}){return dispatchClaimedJob(db,selected,{deliver,findLink:()=>{throw Error('Generic dispatch must not run');},operationalBriefingEnabled:true,clock:()=>clock});}};
}
test('all no-argument runtime paths are OFF before DB/auth/body/transport',async()=>{
 const db=new Proxy({},{get(){throw Error('OFF accessed DB');}});
 assert.equal((await runTelegramBriefingCycle(db)).status,'disabled');
 assert.equal((await changeTelegramBriefingConsent(db,null,null)).status,'disabled');
 let reply;await handleTelegramBriefingConsent({method:'POST'},{},{pathname:'/api/notifications/operational-briefing'},{identify:()=>{throw Error('OFF auth');},read:()=>{throw Error('OFF body');},reply:(_r,_s,b)=>{reply=b;}});
 assert.equal(reply.code,'BRIEFING_DISABLED');
});
test('actual canonical source -> consent -> existing queue -> actual dispatcher -> fake Telegram, without app',async()=>{
 const f=fixture();await f.grant();assert.equal((await f.plan()).planned,1);
 assert.equal(f.jobs[0].scheduled_epoch,Date.parse('2099-10-06T07:00:00Z'));
 const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;
 assert.equal((await f.dispatch(selected)).status,'sent');assert.equal(f.sent.length,1);
 assert.equal(f.sent[0].chat_id,CHAT);assert.equal(f.sent[0].message,'Seu briefing operacional está disponível. No app, abra Menu → Concierge Telegram → Briefing antes da apresentação.');
 assert.equal((await f.dispatch(selected)).status,'skipped');assert.equal(f.sent.length,1);
});
test('durable same-duty dedupe survives producer recreation and reimport with same content',async()=>{
 const f=fixture();await f.grant();await f.plan();await f.plan();assert.equal(f.jobs.length,1);
 const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;await f.dispatch(selected);await f.plan();assert.equal(f.jobs.length,1);assert.equal(f.sent.length,1);
});
for(const mutate of [f=>{f.source.revision_seconds++;},f=>{f.source.roster.days[0].legs[0].destination='GIG';},f=>{f.owner='OTHER-OWNER';},f=>{f.records.get('link-email:'+EMAIL).code='relinked';}])test('dispatch revalidates source/revision/owner/binding',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;mutate(f);assert.equal((await f.dispatch(selected)).status,'cancelled');assert.equal(f.sent.length,0);
});
test('revocation cancels a claimed job and prevents future planning',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();
 await changeTelegramBriefingConsent(f.db,f.identity,{enabled:false,expectedRevision:1},f.options);
 assert.equal((await f.dispatch(selected)).status,'skipped');assert.equal((await f.plan()).planned,0);assert.equal(f.sent.length,0);
});
test('consent CAS and explicit confirmation reject stale/implicit enable',async()=>{
 const f=fixture();await assert.rejects(()=>f.grant({confirmed:false}));await f.grant();await assert.rejects(()=>f.grant());
});
test('expired plan is not backfilled after late enrollment',async()=>{
 const f=fixture();f.clock=Date.parse('2099-10-06T07:01:00Z');await f.grant();assert.equal((await f.plan()).planned,0);assert.equal(f.jobs.length,0);
});
test('explicit lead is preserved; no invented twelve-hour preference',async()=>{
 const f=fixture();f.clock=NOW;await f.grant({preferences:{timing:'lead',leadMinutes:120,timeZone:'America/Sao_Paulo'}});await f.plan();assert.equal(f.jobs[0].scheduled_epoch,Date.parse('2099-10-06T06:30:00Z'));
});
test('uncertain transport and final persistence failure never replay',async()=>{
 for(const finalWrite of [false,true]){const f=fixture();await f.grant();await f.plan();const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;f.finalWriteFails=finalWrite;
 const deliver=async()=>{f.sent.push('attempt');return {ok:finalWrite};};
 if(finalWrite)await assert.rejects(()=>f.dispatch(selected,deliver));else assert.equal((await f.dispatch(selected,deliver)).status,'uncertain');
 f.finalWriteFails=false;await f.dispatch(selected,deliver);assert.equal(f.sent.length,1);}
});
test('deadline expiring during commit blocks transport after durable claim',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;f.commitHook=()=>{f.clock+=61000;};
 assert.equal((await f.dispatch(selected)).status,'expired');assert.equal(f.sent.length,0);
});
test('public scheduling cannot forge the reserved operational namespace',async()=>{
 const f=fixture();let response;
 await safeScheduleJob({req:{},res:{},identity:()=>({email:EMAIL,id:OWNER}),readJson:async()=>({scheduledAt:'2099-10-07T00:00:00Z',jobKey:'OpErAtIoNaL-BrIeFiNg:forged'}),dbPool:async()=>f.db,ensureNotificationTable:async()=>{},linkedTelegramRecord:async()=>({chatId:CHAT}),sendJson:(_r,status,body)=>{response={status,body};}});
 assert.equal(response.status,409);assert.equal(f.jobs.length,0);
});
test('existing scheduler calls the OFF producer and actual consent host; no second timer',()=>{
 const s=readFileSync(new URL('../../server/telegram-fast-ack.mjs',import.meta.url),'utf8');
 assert.match(s,/summary\.operationalBriefing = await runTelegramBriefingCycle\(db\)/);
 assert.match(s,/await handleTelegramBriefingConsent/);
 assert.doesNotMatch(readFileSync(new URL('../../server/concierge/telegram-briefing.mjs',import.meta.url),'utf8'),/setInterval\(|setTimeout\(|fetch\(/);
});

test('actual OFF host can be exercised with synthetic authenticated source and explicit consent only',async()=>{
 const f=fixture();let output;
 const options={enabled:true,clock:()=>f.clock,identify:async()=>f.identity,read:async()=>({enabled:true,confirmed:true,expectedRevision:0,preferences:{timing:'default',timeZone:'America/Sao_Paulo'}}),reply:(_r,status,body)=>{output={status,body};}};
 await handleTelegramBriefingConsent({method:'GET',headers:{}},{},{pathname:'/api/notifications/operational-briefing'},options);
 assert.equal(output.status,200);assert.equal(output.body.submissionAllowed,false);assert.equal(output.body.briefing.duty.legs.length,1);assert.equal(output.body.internal,undefined);assert.equal(output.body.roster,undefined);
 await handleTelegramBriefingConsent({method:'POST',headers:{origin:'https://evil.example','sec-fetch-site':'cross-site'}},{},{pathname:'/api/notifications/operational-briefing'},options);assert.equal(output.status,403);assert.equal(f.records.size,2);
 await handleTelegramBriefingConsent({method:'POST',headers:{origin:'https://crewcheck.online','sec-fetch-site':'same-origin'}},{},{pathname:'/api/notifications/operational-briefing'},options);assert.equal(output.status,200);assert.equal(output.body.revision,1);await f.plan();assert.equal(f.jobs.length,1);
});
test('altered consent revision after claim is refused without generic fallback',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;
 for(const [key,value] of f.records)if(key.startsWith('briefing-consent:'))value.revision++;
 assert.equal((await f.dispatch(selected)).status,'cancelled');assert.equal(f.sent.length,0);
});
test('unreadable durable event is blocked, never treated as an empty dedupe record',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;
 for(const key of f.records.keys())if(key.startsWith('briefing-event:'))f.records.set(key,'not-json');
 assert.equal((await f.dispatch(selected)).status,'cancelled');assert.equal(f.sent.length,0);
});
test('cancelled same-duty plans are not silently resurrected by new consent',async()=>{
 const f=fixture();await f.grant();await f.plan();
 await changeTelegramBriefingConsent(f.db,f.identity,{enabled:false,expectedRevision:1},f.options);
 await f.grant({expectedRevision:2});await f.plan();assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].status,'cancelled');
});
test('account deletion includes both new states through existing erasure statements',async()=>{
 const {notificationStateDeletionStatements}=await import('../../server/v139/notificationStateDeletion.mjs');
 const sql=notificationStateDeletionStatements(EMAIL).map(([sql])=>sql).join('\n');assert.match(sql,/briefing-consent:%/);assert.match(sql,/briefing-event:%/);
});
test('dispatch derives timing again instead of trusting matching forged job/event times',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();
 for(const [key,value] of f.records)if(key.startsWith('briefing-event:')){value.scheduledAt-=60000;f.jobs[0].scheduled_epoch=value.scheduledAt;}
 f.clock=f.jobs[0].scheduled_epoch;assert.equal((await f.dispatch(selected)).status,'cancelled');assert.equal(f.sent.length,0);
});
test('preference drift without revision cannot authorize the old job',async()=>{
 const f=fixture();await f.grant();await f.plan();const selected=f.claim();f.clock=f.jobs[0].scheduled_epoch;
 for(const [key,value] of f.records)if(key.startsWith('briefing-consent:'))value.preferences.timing='custom';
 assert.equal((await f.dispatch(selected)).status,'cancelled');assert.equal(f.sent.length,0);
});
test('reader returns saved consent revision/preferences after reload without leaking binding authority',async()=>{
 const f=fixture();await f.grant({preferences:{timing:'lead',leadMinutes:120,timeZone:'America/Sao_Paulo'}});let output;
 await handleTelegramBriefingConsent({method:'GET',headers:{}},{},{pathname:'/api/notifications/operational-briefing'},{...f.options,identify:async()=>f.identity,reply:(_r,status,body)=>{output={status,body};}});
 assert.equal(output.status,200);assert.equal(output.body.consent.revision,1);assert.equal(output.body.consent.enabled,true);assert.equal(output.body.consent.preferences.leadMinutes,120);assert.equal(output.body.scheduledAt,'2099-10-06T06:30:00.000Z');assert.equal(output.body.consent.email,undefined);assert.equal(output.body.consent.bindingRevision,undefined);assert.equal(output.body.internal,undefined);
});
test('reader and revoke remain available without Telegram link or active roster',async()=>{
 const f=fixture();await f.grant();f.records.delete('link-email:'+EMAIL);f.source.id=null;let output;
 const options={...f.options,identify:async()=>f.identity,reply:(_r,status,body)=>{output={status,body};}};
 await handleTelegramBriefingConsent({method:'GET',headers:{}},{},{pathname:'/api/notifications/operational-briefing'},options);
 assert.equal(output.status,200);assert.equal(output.body.previewAvailable,false);assert.equal(output.body.telegramLinked,false);assert.equal(output.body.consent.revision,1);assert.equal(output.body.consent.enabled,false);assert.equal(output.body.consent.recorded,true);
 await handleTelegramBriefingConsent({method:'POST',headers:{origin:'https://crewcheck.online'}},{},{pathname:'/api/notifications/operational-briefing'},{...options,read:async()=>({enabled:false,expectedRevision:output.body.consent.revision})});
 assert.equal(output.status,200);assert.equal(output.body.status,'consent_revoked');assert.equal(output.body.revision,2);
});
test('reader rejects changed account owner even when client identity still matches old owner',async()=>{
 const f=fixture();f.owner='CC-DIFFERENT';let status;
 await handleTelegramBriefingConsent({method:'GET'},{},{pathname:'/api/notifications/operational-briefing'},{...f.options,identify:async()=>f.identity,reply:(_r,value)=>{status=value;}});assert.equal(status,409);
});
