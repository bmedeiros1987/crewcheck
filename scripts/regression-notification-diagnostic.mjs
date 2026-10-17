import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleNotificationDiagnostic } from '../server/notification-diagnostic.mjs';
const email='synthetic@example.invalid', ownerId='fixture_owner';
async function run({ authenticated=true, method='GET', unavailable=false, changed=false, preferences=[], jobs=[], heartbeat=[], gate=false, payloadOverride={} }={}) {
  const queries=[]; let result;
  const db={query:async(sql,params)=>{
    queries.push({sql,params}); assert.match(sql,/^SELECT /); assert.doesNotMatch(sql,/\b(?:CREATE|INSERT|UPDATE|DELETE|ALTER)\b/i);
    if(sql.includes('FROM crewcheck_platform_profiles')) return [[...(changed?[]:[{public_id:ownerId}])]];
    if(unavailable) throw new Error('private token should never appear');
    if(sql.includes('telegram_state')) {assert.equal(params.length,1);return [preferences];}
    if(sql.includes('notification_jobs')) {assert.deepEqual(params,[email,ownerId]);assert.match(sql,/j.created_at>=p.created_at/);return [jobs];}
    if(sql.includes('scheduler_heartbeat')) return [heartbeat];
    throw new Error('Unexpected SQL');
  }};
  await handleNotificationDiagnostic({method,url:'/?ownerId=other'}, {setHeader:(key,value)=>assert.equal(value,'no-store')}, {
    identify:async()=>authenticated?{db,email,payload:{sub:ownerId,iss:'crewcheck',aud:'crewcheck-web',exp:Math.floor(Date.now()/1000)+3600,...payloadOverride},profile:{public_id:ownerId}}:null,
    reply:(_res,status,body)=>result={status,body}, gateEnabled:()=>gate,
    schedulerHealthState:row=>row.last_status==='error'?'last_failure':'completed',
  }); return {result,queries};
}
assert.equal((await run({authenticated:false})).queries.length,0);
assert.equal((await run({method:'POST'})).result.status,405);
for(const payloadOverride of [{iss:'other'},{aud:'other'},{exp:0},{exp:undefined},{mustChangePassword:true},{sub:'other'}]) {const check=await run({payloadOverride});assert.equal(check.result.status,401);assert.equal(check.queries.length,0);}
let value=(await run()).result.body;
assert.equal(value.wake.status,'absent');assert.equal(value.wake.scope,'current_account_wake_history');assert.equal(value.preferences.status,'absent'); assert.equal(value.alarms.status,'absent');assert.equal(value.scheduler.status,'absent');assert.equal(value.webPush.gate,'disabled');assert.equal(value.deliveryConfirmed,false);
value=(await run({preferences:[{payload:JSON.stringify({email,ownerId,revision:3,preferences:{enabled:true}})}],jobs:[{status:'pending',total:2,overdue:1},{status:'expired',total:1},{status:'uncertain',total:1},{status:'sent',total:1}],heartbeat:[{last_status:'error'}],gate:true})).result.body;
assert.equal(value.preferences.status,'saved');assert.equal(value.preferences.createsSchedule,false);assert.equal(value.alarms.pendingPastDispatchWindow,1);assert.equal(value.alarms.counts.expired,1);assert.equal(value.alarms.counts.uncertain,1);assert.equal(value.alarms.received,null);assert.equal(value.scheduler.status,'last_failure');assert.equal(value.webPush.gate,'enabled');assert.equal(value.webPush.configuration,'not_observed');
value=(await run({jobs:[{status:'partial',total:2},{status:'held',total:1},{status:'future_status',total:3},{status:'another_status',total:4}]})).result.body;
assert.equal(value.alarms.counts.partial,2);assert.equal(value.alarms.counts.held,1);assert.equal(value.alarms.counts.other,7);assert.equal(value.alarms.total,10);assert.equal(Object.values(value.alarms.counts).reduce((sum,n)=>sum+n,0),10);assert.equal(value.alarms.scope,'current_account_notification_job_history');
value=(await run({unavailable:true})).result.body;for(const key of ['preferences','alarms','wake','scheduler'])assert.equal(value[key].status,'unavailable');assert(!JSON.stringify(value).includes('private token'));
assert.equal((await run({changed:true})).result.status,401);
assert.equal((await run({preferences:[{payload:JSON.stringify({email,ownerId:'other',revision:2})}]})).result.body.preferences.status,'unavailable');
// Execute the existing identity helper itself: its initial profile SELECT rejects.
const commonSource=fs.readFileSync('server/v139/common.mjs','utf8');
const helperStart=commonSource.indexOf('export async function requireExistingIdentity(');
const helperEnd=commonSource.indexOf('\n}\n',helperStart)+3;
assert(helperStart>=0&&helperEnd>helperStart);
let identityQueries=0, identityResponse;
const profileFailureDb={query:async(sql)=>{identityQueries++;assert.match(sql,/^SELECT \* FROM crewcheck_platform_profiles/);throw new Error('SQL private fixture token');}};
const actualIdentify=new Function('verifyJwt','requestToken','dbPool','safeEmail','sendJson','isAdminEmail',commonSource.slice(helperStart,helperEnd).replace('export ','')+'; return requireExistingIdentity;')(
  ()=>({sub:ownerId,email,iss:'crewcheck',aud:'crewcheck-web',exp:Math.floor(Date.now()/1000)+3600}),()=> 'synthetic',async()=>profileFailureDb,value=>value,()=>assert.fail('helper must not mask failed profile read'),()=>false);
await handleNotificationDiagnostic({method:'GET'},{setHeader:()=>{}},{identify:actualIdentify,reply:(_res,status,body)=>identityResponse={status,body}});
assert.equal(identityQueries,1);assert.equal(identityResponse.status,503);assert.equal(identityResponse.body.code,'IDENTITY_UNAVAILABLE');assert(!JSON.stringify(identityResponse).includes('SQL private'));
assert.match(fs.readFileSync('server/telegram-fast-ack.mjs','utf8'),/return await handleNotificationDiagnostic/);
const source=fs.readFileSync('server/notification-diagnostic.mjs','utf8');assert.doesNotMatch(source,/ensure\w*\(|fetch\(|sendTelegram\(|VAPID_|TOKEN|phone|chat_id|message/);
console.log('PASS observational diagnostic: authenticated owner binding/recreation, SELECT only, absent vs unavailable, saved vs scheduled, gate vs delivery, heartbeat, expiry, uncertain and unconfirmed acceptance; zero sends/secrets/DDL.');
