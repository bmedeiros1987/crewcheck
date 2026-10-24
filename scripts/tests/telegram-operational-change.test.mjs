import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runTelegramOperationalChangeCycle,changeTelegramOperationalConsent,handleTelegramOperationalConsent} from '../../server/concierge/telegram-operational-change.mjs';
import {inspectOperationalChange} from '../../server/concierge/operational-change-source.mjs';
import {dispatchClaimedJob,safeScheduleJob} from '../../server/notification-job-safety.mjs';
import {prepareScheduledWakeup} from '../../server/wakeup-spoken-program.mjs';
const NOW=Date.parse('2099-10-06T06:00:00Z'), EMAIL='synthetic@example.invalid', OWNER='CC-SYNTHETIC-A', CHAT='123456789';
const copy=x=>structuredClone(x);
globalThis.fetch=()=>{throw Error('No network permitted');};
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
  if(sql.startsWith('SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE'))return [[...records].filter(([key,value])=>key.startsWith('operational-change-consent:')&&value.enabled).map(([state_key,payload])=>({state_key,payload:copy(payload)}))];
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
 const identityScope={ flight:'LA1234',origin:'GRU',destination:'BSB',departureDate:'2099-10-06',scheduledDepartureUtc:'2099-10-06T07:00:00Z' };
 const observation=(gate,offset)=>({ok:true,provider:'custom',...identityScope,gate,sourceReceivedAt:NOW+offset+100,
 departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...identityScope,gate,updatedAt:new Date(NOW+offset).toISOString()}});
 const history={scope:{ownerId:OWNER,rosterRevision:'rev1',identity:identityScope},source:{ownerId:OWNER,rosterRevision:'rev1',previousObservation:observation('24',1000),observation:observation('25',2000)}};
 const readSource=async(_c,_context,options)=>{assert.equal(options.lockSource,true);return copy(history);};
 const options = {enabled:true,clock:()=>clock};
 return {db,identity,records,jobs,sent,source,options,history,readSource,get clock(){return clock;},set clock(v){clock=v;},set owner(v){owner=v;},set commitHook(v){commitHook=v;},set finalWriteFails(v){finalWriteFails=v;},
 async grant(overrides={}){return changeTelegramOperationalConsent(db,identity,{enabled:true,confirmed:true,field:'gate',expectedRevision:0,...overrides},options);},
 async plan(){return runTelegramOperationalChangeCycle(db,{...options,readSource});},
 claim(){const job=jobs.find(j=>j.status==='pending');assert.ok(job);job.status='processing';job.locked_at='synthetic-lease';return {id:job.id,job_key:job.job_key};},
 async dispatch(selected, deliver=async job=>{sent.push(copy(job));return {ok:true};}){return dispatchClaimedJob(db,selected,{deliver,findLink:()=>{throw Error('Generic dispatch must not run');},operationalChangeEnabled:true,readOperationalChangeSource:readSource,clock:()=>clock});}};
}
async function ready(){const f=fixture();await f.grant();f.clock=NOW+3000;return f;}
test('OFF before DB/auth/body/source; host explicitly disabled',async()=>{
 const db=new Proxy({},{get(){throw Error('OFF DB');}});
 assert.equal((await runTelegramOperationalChangeCycle(db)).status,'disabled');
 assert.equal((await changeTelegramOperationalConsent(db,null,null)).status,'disabled');
 let body;await handleTelegramOperationalConsent({method:'POST'},{},{pathname:'/api/notifications/operational-change'},{identify(){throw Error('auth');},read(){throw Error('body');},reply(_r,s,b){assert.equal(s,503);body=b;}});assert.equal(body.code,'OPERATIONAL_CHANGE_DISABLED');
});
test('existing dispatcher gate proof -> consent -> same durable queue -> fake transport',async()=>{
 const f=await ready();assert.equal((await f.plan()).planned,1);assert.equal(f.jobs.length,1);
 const selected=f.claim();assert.equal((await f.dispatch(selected)).status,'sent');assert.equal(f.sent.length,1);
 assert.match(f.sent[0].message,/24 → 25/);assert.notEqual(f.sent[0].message,'Operational change; server validation required.');
 await f.dispatch(selected);await f.plan();assert.equal(f.sent.length,1);assert.equal(f.jobs.length,1);
});
for(const mutate of [f=>f.history.source.rosterRevision='rev2',f=>f.history.source.observation.departureGateUpdate.updatedAt=new Date(NOW-1800001).toISOString(),f=>f.history.source.observation.gate='26',f=>{f.owner='NEW-OWNER';},f=>{f.records.get('link-email:'+EMAIL).code='new-binding';}])test('source/current revision/value/freshness/owner/link revalidated on dispatch',async()=>{
 const f=await ready();await f.plan();const selected=f.claim();mutate(f);assert.equal((await f.dispatch(selected)).status,'cancelled');assert.equal(f.sent.length,0);
});
test('topic-specific consent CAS, revoke after unlink and no resurrection',async()=>{
 const f=await ready();await assert.rejects(()=>f.grant());await f.plan();const selected=f.claim();f.records.delete('link-email:'+EMAIL);
 await changeTelegramOperationalConsent(f.db,f.identity,{field:'gate',enabled:false,expectedRevision:1},f.options);assert.equal((await f.dispatch(selected)).status,'skipped');assert.equal(f.sent.length,0);
});
test('status requires its own consent and explicit field observation, gate does not authorize it',async()=>{
 const f=await ready();await f.plan();await f.grant({field:'status'});assert.equal((await f.plan()).blocked,1);assert.equal(f.jobs.length,1);
});
test('no reader, baseline, same-value, late enrollment and replay never enqueue',async()=>{
 const f=await ready();assert.equal((await runTelegramOperationalChangeCycle(f.db,f.options)).planned,0);
 f.history.source.previousObservation=null;assert.equal((await f.plan()).planned,0);
 f.history.source.previousObservation=copy(f.history.source.observation);assert.equal((await f.plan()).planned,0);
 const late=fixture();late.clock=NOW+4000;await late.grant();assert.equal((await late.plan()).planned,0);
});
test('transport uncertainty, commit uncertainty and persistence failure cannot resend',async()=>{
 for(const kind of ['transport','commit','final']){const f=await ready();await f.plan();const s=f.claim();
 if(kind==='commit')f.commitHook=()=>{throw Error('ACK lost');};if(kind==='final')f.finalWriteFails=true;
 const send=async()=>{f.sent.push('attempt');if(kind==='transport')throw Error('unknown');return {ok:true};};
 if(kind==='final')await assert.rejects(()=>f.dispatch(s,send));else assert.equal((await f.dispatch(s,send)).status,'uncertain');
 f.commitHook=null;f.finalWriteFails=false;await f.dispatch(s,send);await f.plan();assert.equal(f.sent.length,kind==='commit'?0:1);assert.equal(f.jobs.length,1);
 }
});
test('post-commit expiry prevents transport',async()=>{const f=await ready();await f.plan();const s=f.claim();f.commitHook=()=>{f.clock+=120001;};assert.equal((await f.dispatch(s)).status,'expired');assert.equal(f.sent.length,0);});
test('public enqueue reserved namespace and forged OFF jobs cannot use generic send',async()=>{
 const f=await ready();let status;
 await safeScheduleJob({req:{},res:{},identity:()=>({email:EMAIL,id:OWNER}),readJson:async()=>({scheduledAt:'2099-10-07T00:00:00Z',jobKey:'OpErAtIoNaL-ChAnGe:gate:forged'}),dbPool:async()=>f.db,ensureNotificationTable:async()=>{},linkedTelegramRecord:async()=>({chatId:CHAT}),sendJson:(_r,s)=>{status=s;}});assert.equal(status,409);
 await f.plan();const s=f.claim();assert.equal((await dispatchClaimedJob(f.db,s,{deliver(){throw Error('generic send');}})).status,'cancelled');
});
test('GET consent/revoke remain available without link/source; origins rejected before auth',async()=>{
 const f=await ready();f.records.delete('link-email:'+EMAIL);let out;
 const opts={...f.options,identify:async()=>f.identity,reply(_r,s,b){out={s,b};}};
 await handleTelegramOperationalConsent({method:'GET'},{},{pathname:'/api/notifications/operational-change'},opts);assert.equal(out.s,200);assert.equal(out.b.consent.gate.revision,1);assert.equal(out.b.consent.gate.enabled,false);assert.equal(out.b.schedulingConfirmed,false);
 for(const origin of ['http://crewcheck.online','https://crewcheck.online.evil.invalid','https://crewcheck.online:444'])await handleTelegramOperationalConsent({method:'POST',headers:{origin}},{},{pathname:'/api/notifications/operational-change'},{...opts,identify(){throw Error('origin before auth');}});
 assert.equal(out.s,403);
});
test('status proof is independent, temporal and exact occurrence; legacy status rejected',()=>{
 const f=fixture(),{source,scope}=f.history;const now=NOW+3000;
 for(const [index,name] of ['previousObservation','observation'].entries()) {const o=source[name];o.status=index?'boarding':'scheduled';o.departureStatusUpdate={schema:'crewcheck.departure-status-update.v1',...scope.identity,status:o.status,updatedAt:o.departureGateUpdate.updatedAt};}
 assert.equal(inspectOperationalChange(source,scope,'status',now).status,'change');
 const base=copy(source);
 for(const mutate of [s=>delete s.observation.departureStatusUpdate,s=>s.observation.departureStatusUpdate.status='cancelled',s=>s.observation.departureStatusUpdate.flight='LA999',s=>s.observation.departureStatusUpdate.updatedAt=new Date(NOW-1800001).toISOString(),s=>s.observation.sourceReceivedAt=now+1,s=>s.observation.operationalConflicts=['status']]){const s=copy(base);mutate(s);assert.equal(inspectOperationalChange(s,scope,'status',now).status,'blocked');}
});
test('existing timer and erasure include topic; no new polling/transport',async()=>{
 const s=readFileSync(new URL('../../server/telegram-fast-ack.mjs',import.meta.url),'utf8');assert.match(s,/summary.operationalChange = await runTelegramOperationalChangeCycle\(db\)/);
 const {notificationStateDeletionStatements}=await import('../../server/v139/notificationStateDeletion.mjs');assert.match(notificationStateDeletionStatements(EMAIL).map(([s])=>s).join(' '),/operational-change-event/);
 const mod=readFileSync(new URL('../../server/concierge/telegram-operational-change.mjs',import.meta.url),'utf8');assert.doesNotMatch(mod,/fetch\(|setInterval\(|setTimeout\(/);
});
test('status source contract + separate consent -> existing queue -> fake transport',async()=>{
 const f=fixture();await f.grant({field:'status'});f.clock=NOW+3000;
 for(const [i,key]of ['previousObservation','observation'].entries()){const o=f.history.source[key];o.status=i?'boarding':'scheduled';o.departureStatusUpdate={schema:'crewcheck.departure-status-update.v1',...f.history.scope.identity,status:o.status,updatedAt:o.departureGateUpdate.updatedAt};}
 assert.equal((await f.plan()).planned,1);assert.match(f.jobs[0].job_key,/operational-change:status:/);
 assert.equal((await f.dispatch(f.claim())).status,'sent');assert.match(f.sent[0].message,/scheduled → boarding/);
});
test('grant requires explicit confirmation; each topic revision is isolated',async()=>{const f=fixture();await assert.rejects(()=>f.grant({confirmed:false}));await f.grant();await f.grant({field:'status'});const consents=[...f.records.values()].filter(v=>v.channel==='telegram');assert.deepEqual(consents.map(v=>v.revision),[1,1]);});
test('reimported baseline does not create a second job for the same new value/instant',async()=>{const f=await ready();await f.plan();const prev=f.history.source.previousObservation;prev.gate='23';prev.departureGateUpdate.gate='23';await f.plan();assert.equal(f.jobs.length,1);});
test('composed shipping delivery preserves operational text and never invokes wakeup source or call transports',async()=>{
 const runtime=readFileSync(new URL('../../server/telegram-fast-ack.mjs',import.meta.url),'utf8');
 const wrapper=runtime.match(/async function deliverJob\(job\) \{[\s\S]*?\n\}/)?.[0];assert.ok(wrapper);
 const sent=[];
 const forbidden=()=>assert.fail('Operational Telegram event must not access wakeup account/source or call provider');
 const deliver=new Function('prepareScheduledWakeup','dbPool','sendTelegram','callTelegram','sendInfobipPhone',`return (${wrapper});`)(prepareScheduledWakeup,forbidden,async(chat,message)=>{sent.push({chat,message});return {ok:true};},forbidden,forbidden);
 const f=await ready();await f.plan();assert.equal((await f.dispatch(f.claim(),deliver)).status,'sent');
 assert.deepEqual(sent,[{chat:CHAT,message:'Portão atualizado: 24 → 25. Confira os canais oficiais antes de agir.'}]);
});
