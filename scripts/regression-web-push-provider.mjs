import assert from 'node:assert/strict';
import { pushConfiguration } from '../server/web-push/config.mjs';
import { publicPushAddress,guardedLookup,sendCrewCheckPush } from '../server/web-push/provider.mjs';
import { runCrewCheckPushQueue } from '../server/web-push/bidsProducer.mjs';
const values=new Proxy({WEB_PUSH_ENABLED:'false'},{get:(target,key)=>{if(key.startsWith('VAPID')||key==='WEB_PUSH_ENCRYPTION_KEY')throw Error('Disabled must not read keys');return target[key];}});
assert.equal(pushConfiguration(values).enabled,false);
assert.deepEqual(await runCrewCheckPushQueue({query:()=>{throw Error('Disabled must not query or produce');}},{configuration:()=>pushConfiguration(values)}),{enabled:false,selected:0});
for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(publicPushAddress(ip),false,ip);
assert.equal(publicPushAddress('8.8.8.8'),true);assert.equal(publicPushAddress('2606:4700:4700::1111'),true);
await new Promise(resolve=>guardedLookup('fcm.googleapis.com',{},error=>{assert(error);resolve();},(_host,_options,callback)=>callback(null,[{address:'127.0.0.1',family:4}])));
const subscription={endpoint:'https://fcm.googleapis.com/synthetic-provider',keys:{p256dh:Buffer.from('046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5','hex').toString('base64url'),auth:Buffer.alloc(16,3).toString('base64url')}};
const now=Date.parse('2026-11-11T09:00:00Z'),envelope={expiresAt:new Date(now+60000).toISOString()},config={enabled:true,configured:true,subject:'mailto:fictional@fixture.invalid',publicKey:'fixture-only',privateKey:'fixture-only'};let calls=0;
const load=async()=>({sendNotification:async(_subscription,_payload,options)=>{calls++;assert.equal(options.TTL,60);assert.equal(options.timeout,5000);assert.equal(options.agent.options.lookup,guardedLookup);return{statusCode:201};}});
assert.equal((await sendCrewCheckPush(subscription,envelope,{enabled:false},{load:()=>{throw Error('No library load');},now})).status,'disabled');
assert.equal((await sendCrewCheckPush(subscription,envelope,config,{load,now})).status,'accepted_unconfirmed');assert.equal(calls,1);
assert.equal((await sendCrewCheckPush(subscription,envelope,config,{load,now:now+60000})).status,'expired');assert.equal(calls,1);
await assert.rejects(sendCrewCheckPush({...subscription,endpoint:'https://127.0.0.1/a'},envelope,config,{load,now}));assert.equal(calls,1);
for(const statusCode of [410,500]){const result=await sendCrewCheckPush(subscription,envelope,config,{load:async()=>({sendNotification:async()=>{throw {statusCode};}}),now});assert.equal(result.status,statusCode===410?'expired_subscription':'uncertain');assert.equal(result.received,null);}
console.log('PASS real provider adapter with mocked library: disabled reads no keys/DB/import, HTTPS allowlist and DNS public-address guard, deadline/TTL/timeout, acceptance vs expiry/uncertain, no external requests.');
