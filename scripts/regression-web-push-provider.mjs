import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { bidsCampaignPending, planBidsAlert, bidsAlertContextKey, DEFAULT_BIDS_ALERT_PREFERENCES } from '../server/v139/bidsAlertPolicy.mjs';
import { selectedNotificationChannels } from '../shared/notificationChannelPreferences.mjs';
import { pushConfiguration } from '../server/web-push/config.mjs';
import { publicPushAddress,guardedLookup,sendCrewCheckPush } from '../server/web-push/provider.mjs';
import { runCrewCheckPushQueue, selectPushInstallations, selectDuePushJobs } from '../server/web-push/bidsProducer.mjs';
const values=new Proxy({WEB_PUSH_ENABLED:'false'},{get:(target,key)=>{if(key.startsWith('VAPID')||key==='WEB_PUSH_ENCRYPTION_KEY')throw Error('Disabled must not read keys');return target[key];}});
assert.equal(pushConfiguration(values).enabled,false);
assert.deepEqual(await runCrewCheckPushQueue({query:()=>{throw Error('Disabled must not query or produce');}},{configuration:()=>pushConfiguration(values)}),{enabled:false,selected:0});
for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2001:0000:1234::1','2002:7f00:1::1'])assert.equal(publicPushAddress(ip),false,ip);
assert.equal(publicPushAddress('8.8.8.8'),true);assert.equal(publicPushAddress('2606:4700:4700::1111'),true);
await new Promise(resolve=>guardedLookup('fcm.googleapis.com',{},error=>{assert(error);resolve();},(_host,_options,callback)=>callback(null,[{address:'127.0.0.1',family:4}])));
const subscription={endpoint:'https://fcm.googleapis.com/synthetic-provider',keys:{p256dh:Buffer.from('046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5','hex').toString('base64url'),auth:Buffer.alloc(16,3).toString('base64url')}};
const now=Date.parse('2026-11-11T09:00:00Z'),envelope={expiresAt:new Date(now+60000).toISOString()},config={enabled:true,configured:true,subject:'mailto:fictional@fixture.invalid',publicKey:'fixture-only',privateKey:'fixture-only'};let calls=0;
const load=async()=>({sendNotification:async(_subscription,_payload,options)=>{calls++;assert.equal(options.TTL,60);assert.equal(options.timeout,5000);assert.equal(options.agent.options.lookup,guardedLookup);return{statusCode:201};}});
assert.equal((await sendCrewCheckPush(subscription,envelope,{enabled:false},{load:()=>{throw Error('No library load');},now})).status,'disabled');
assert.equal((await sendCrewCheckPush(subscription,envelope,config,{load,now})).status,'accepted_unconfirmed');assert.equal(calls,1);
assert.equal((await sendCrewCheckPush(subscription,envelope,config,{load,now:now+60000})).status,'expired');assert.equal(calls,1);
await assert.rejects(sendCrewCheckPush({...subscription,endpoint:'https://127.0.0.1/a'},envelope,config,{load,now}));assert.equal(calls,1);
let advanced=now;assert.equal((await sendCrewCheckPush(subscription,envelope,config,{load:async()=>{advanced=now+60000;return await load();},now,clock:()=>advanced})).status,'expired');assert.equal(calls,1,'expiry during library wait cannot send');
for(const statusCode of [410,500]){const result=await sendCrewCheckPush(subscription,envelope,config,{load:async()=>({sendNotification:async()=>{throw {statusCode};}}),now});assert.equal(result.status,statusCode===410?'expired_subscription':'uncertain');assert.equal(result.received,null);}
console.log('PASS real provider adapter with mocked library: disabled reads no keys/DB/import, HTTPS allowlist and DNS public-address guard, deadline/TTL/timeout, acceptance vs expiry/uncertain, no external requests.');

// Execute the literal producer revalidation with synthetic DB rows.
const producerSource=fs.readFileSync('server/web-push/bidsProducer.mjs','utf8');const contextCode=producerSource.slice(producerSource.indexOf('async function currentContext'),producerSource.indexOf('const producerCursorKey'));
const scope={bidsCampaignPending,planBidsAlert,selectedNotificationChannels,bidsAlertStateKey:()=> 'prefs',eligibilityKey:()=> 'proof',parseJsonColumn:value=>value};vm.createContext(scope);vm.runInContext(contextCode+';globalThis.validateContext=currentContext;',scope);
const campaign={id:'fixture',revision:'v1',source:{verified:true,label:'synthetic',sha256:'a'.repeat(64)},timezone:'UTC',targetMonth:'2026-12',opensAt:'2026-11-11T00:00:00Z',closesAt:'2026-11-12T20:00:00Z',audience:{verified:true,airline:'FICTIONAL',roles:['fixture-cabin']}};
const ownerId='fixture_owner',email='fixture@fixture.invalid',preferences={...DEFAULT_BIDS_ALERT_PREFERENCES,enabled:true,mode:'manual',timezone:'UTC'};
const state={ownerId,email,revision:7,preferences},proof={verified:true,eligible:true,ownerId,email,campaignId:campaign.id,campaignRevision:campaign.revision,airline:'FICTIONAL',role:'fixture-cabin',sourceSha256:'b'.repeat(64)};
const db={query:async(_sql,[key])=>[[{payload:key==='prefs'?state:proof}]]};const job={email,envelope:{ownerId,eventKey:bidsAlertContextKey(ownerId,campaign)},scheduledAt:'2026-11-11T09:00:00Z',sourceContext:{preferencesRevision:7}};
const check=(instant,change={})=>scope.validateContext(db,{...job,...change},Date.parse(instant),()=>campaign);
assert.equal(await check('2026-11-11T09:00:00Z'),true);
assert.equal(await check('2026-11-11T09:00:20Z'),true,'short delayed scheduler tick retains due manual job');
assert.equal(await check('2026-11-11T22:00:00Z'),false,'delayed job cannot send during quiet hours');
assert.equal(await check(campaign.closesAt),false,'expired window cannot send');
assert.equal(await check('2026-11-11T09:00:20Z',{scheduledAt:'2026-11-11T09:01:00Z'}),false,'wrong original manual minute rejected');
assert.equal(await check('2026-11-11T09:00:20Z',{sourceContext:{preferencesRevision:6}}),false,'stale preference revision rejected');
console.log('PASS literal producer revalidation: due manual tick +20s retained; quiet, expiry, invalid scheduled slot and stale revision blocked.');

proof.eligible=false;assert.equal(await check('2026-11-11T09:00:20Z'),false,'eligibility revoked after enqueue blocks dispatch');proof.eligible=true;

const installs=Array.from({length:51},(_,index)=>({state_key:'crewcheck-push-installation:'+String(index).padStart(3,'0'),payload:{active:true}}));let cursor=null;
const pagingDb={query:async(sql,args)=>{if(sql.startsWith('INSERT')){cursor=JSON.parse(args[1]);return[{}];}if(sql.startsWith('SELECT payload'))return[[{payload:cursor}]];assert.match(sql,/ORDER BY state_key ASC LIMIT \?/);assert(args[1]<=50);return[installs.filter(row=>sql.includes('state_key > ?')?row.state_key>args[0]:row.state_key<=args[0]).slice(0,args[1])];}};
const batch1=await selectPushInstallations(pagingDb),batch2=await selectPushInstallations(pagingDb);assert.equal(batch1.length,50);assert.equal(batch2.length,50);assert.equal(new Set([...batch1,...batch2].map(row=>row.state_key)).size,51,'cursor reaches installation beyond first 50');
const queued=Array.from({length:25},(_,index)=>({state_key:'job_'+index,payload:{scheduledAt:new Date(now+60000+index).toISOString()}})).concat(Array.from({length:21},(_,index)=>({state_key:'due_'+String(index).padStart(2,'0'),payload:{scheduledAt:new Date(now-index*1000).toISOString()}})));
const dueDb={query:async(sql,[cutoff])=>{assert.match(sql,/scheduledAt.*<=\?/);assert.match(sql,/ORDER BY.*scheduledAt.*ASC,state_key ASC LIMIT 20/);return[queued.filter(row=>row.payload.scheduledAt<=cutoff).sort((a,b)=>a.payload.scheduledAt.localeCompare(b.payload.scheduledAt)||a.state_key.localeCompare(b.state_key)).slice(0,20)];}};
const due1=await selectDuePushJobs(dueDb,now);assert.equal(due1.length,20);assert(due1.every(row=>row.state_key.startsWith('due_')));for(const row of due1)queued.splice(queued.indexOf(row),1);assert.equal((await selectDuePushJobs(dueDb,now)).length,1,'future jobs cannot starve remaining due job');
console.log('PASS bounded fair selection: 51 installations rotate through batches of 50; future jobs excluded and 21 due jobs drain in deadline order within limit 20.');
