import test from 'node:test';
import assert from 'node:assert/strict';
import { createStayHostRuntime } from '../shared/stay-alarm-host-runtime.mjs';
function fixture(){let account='account-a',token='candidate-a';const listeners=new Set(),messages=[],timers=new Map();let timer=0;
 const port={addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn),postMessage:raw=>messages.push(JSON.parse(raw))};
 const runtime=createStayHostRuntime({port,readAccount:()=>account,readToken:()=>token,setTimer:fn=>{timers.set(++timer,fn);return timer;},clearTimer:id=>timers.delete(id)});
 const reply=(request,state,payload)=>listeners.forEach(fn=>fn({data:JSON.stringify({id:request.id,state,payload})}));
 const caps=(owner=account,epoch='epoch-1')=>JSON.stringify({protocol:'crewcheck-stay-alarm-v1',featureEnabled:true,atomicReplace:true,acknowledgedCancel:true,deliveryConfirmed:false,ownerId:owner,ownerEpoch:epoch,permissionGranted:true});
 return {runtime,messages,reply,caps,timers,switchAccount(){account='account-b';token='candidate-b';},logout(){account=null;token=null;}};
}
test('OFF: absent scoped port constructs no adapter',()=>assert.equal(createStayHostRuntime({}),null));
test('verified native identity establishes adapter; candidate token only goes to authenticate',async()=>{const f=fixture(),p=f.runtime.authenticate();assert.equal(f.runtime.ready(),false);assert.equal(f.messages[0].token,'candidate-a');f.reply(f.messages[0],'verified',f.caps());assert.equal(await p,true);assert.equal(f.runtime.permission(),true);});
test('server rejection leaves controller unavailable',async()=>{const f=fixture(),p=f.runtime.authenticate();f.reply(f.messages[0],'rejected',null);assert.equal(await p,false);assert.equal((await f.runtime.replace({key:'k'})).state,'not-programmed');});
test('verified owner mismatch cannot trust local account',async()=>{const f=fixture(),p=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps('foreign'));assert.equal(await p,false);assert.equal(f.runtime.ready(),false);});
test('logout invalidates delayed authentication before native reply',async()=>{const f=fixture(),p=f.runtime.authenticate();f.logout();const revoke=f.runtime.revoke();f.reply(f.messages[0],'verified',f.caps('account-a'));f.reply(f.messages[1],'revoked',null);await revoke;assert.equal(await p,false);assert.equal(f.runtime.ready(),false);});
test('account switch accepts only latest verified owner/epoch',async()=>{const f=fixture(),old=f.runtime.authenticate();f.switchAccount();const current=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps('account-a'));f.reply(f.messages[1],'verified',f.caps('account-b','epoch-2'));assert.equal(await old,false);assert.equal(await current,true);assert.match(f.runtime.session(),/epoch-2/);});
test('same-account reauthentication invalidates pending epoch',async()=>{const f=fixture(),old=f.runtime.authenticate(),current=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());f.reply(f.messages[1],'verified',f.caps('account-a','new-epoch'));assert.equal(await old,false);assert.equal(await current,true);});
test('lease expiry suspends the online session without revoking confirmed local alarms',async()=>{const f=fixture(),p=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await p;const expire=[...f.timers.values()][0];expire();assert.equal(f.runtime.ready(),false);assert.equal(f.messages.at(-1).action,'suspend');f.reply(f.messages.at(-1),'suspended',null);});
test('logout after suspension retains the exact confirmed owner epoch in revoke',async()=>{
 const f=fixture(),auth=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await auth;
 const suspended=f.runtime.suspend();f.reply(f.messages.at(-1),'suspended',null);await suspended;f.logout();
 const revoked=f.runtime.revoke(),message=f.messages.at(-1);
 assert.equal(message.ownerId,'account-a');assert.equal(message.ownerEpoch,'epoch-1');assert.equal(message.token,undefined);
 f.reply(message,'revoked',null);assert.equal((await revoked).state,'native-revoked');
});
test('native rejection cannot become a confirmed revocation receipt',async()=>{
 const f=fixture(),auth=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await auth;
 const revoke=f.runtime.revoke();f.reply(f.messages.at(-1),'rejected',null);
 assert.equal((await revoke).state,'revocation-unknown');assert.equal(f.runtime.ready(),false);
});
test('wiring performs inspect/replace and edit invalidation cancels stable native identity',async()=>{
 const f=fixture(),auth=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await auth;
 const key='stay-hotel-apz:account-a:event-1',input={key,alarmAt:'2030-10-11T00:01:00Z',hotelReportAt:'2030-10-11T00:03:00Z',confirmed:true,apzConfirmed:true,mode:'relative'};
 const pending=f.runtime.replace(input);
 await new Promise(resolve=>setImmediate(resolve));
 const inspect=f.messages.at(-1),body=JSON.parse(inspect.payload);
 assert.equal(body.action,'inspect');assert.equal(body.ownerEpoch,'epoch-1');assert.equal(body.token,undefined);
 f.reply(inspect,'ok',JSON.stringify({...body,state:'not-programmed',revision:0,deliveryConfirmed:false}));
 await new Promise(resolve=>setImmediate(resolve));
 const replace=f.messages.at(-1),request=JSON.parse(replace.payload);assert.equal(request.action,'replace');
 f.reply(replace,'ok',JSON.stringify({...request,state:'scheduled',revision:1,deliveryConfirmed:false,acknowledgement:'native-api-and-journal-completed'}));
 assert.equal((await pending).state,'scheduled');
 const invalidation=f.runtime.invalidate();await new Promise(resolve=>setImmediate(resolve));
 const cancelInspect=f.messages.at(-1),sample=JSON.parse(cancelInspect.payload);
 f.reply(cancelInspect,'ok',JSON.stringify({...sample,state:'scheduled',revision:1,deliveryConfirmed:false}));
 await new Promise(resolve=>setImmediate(resolve));
 const cancel=f.messages.at(-1),cancelBody=JSON.parse(cancel.payload);assert.equal(cancelBody.action,'cancel');assert.equal(cancelBody.key,key);
 f.reply(cancel,'ok',JSON.stringify({...cancelBody,state:'cancelled',revision:2,deliveryConfirmed:false,acknowledgement:'native-api-and-journal-completed'}));await invalidation;
});
test('edit during pending replace rejects its receipt then cancels the same native key',async()=>{
 const f=fixture(),auth=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await auth;
 const key='stay-hotel-apz:account-a:event-race',p=f.runtime.replace({key,alarmAt:'2030-10-11T00:01:00Z',hotelReportAt:'2030-10-11T00:03:00Z',confirmed:true,apzConfirmed:true,mode:'relative'});
 await new Promise(resolve=>setImmediate(resolve));let envelope=f.messages.at(-1),body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'not-programmed',revision:0,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));
 envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);assert.equal(body.action,'replace');
 const invalidation=f.runtime.invalidate();
 f.reply(envelope,'ok',JSON.stringify({...body,state:'scheduled',revision:1,deliveryConfirmed:false,acknowledgement:'native-api-and-journal-completed'}));assert.equal((await p).state,'unknown');
 await new Promise(resolve=>setImmediate(resolve));envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);assert.equal(body.action,'inspect');
 f.reply(envelope,'ok',JSON.stringify({...body,state:'scheduled',revision:1,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));
 envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);assert.equal(body.action,'cancel');assert.equal(body.key,key);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'cancelled',revision:2,deliveryConfirmed:false,acknowledgement:'native-api-and-journal-completed'}));await invalidation;
});
test('unknown cancellation preserves identity, revokes native authority and retries revocation',async()=>{
 const f=fixture(),auth=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await auth;
 const key='stay-hotel-apz:account-a:cancel-failure',p=f.runtime.replace({key,alarmAt:'2030-10-11T00:01:00Z',hotelReportAt:'2030-10-11T00:03:00Z',confirmed:true,apzConfirmed:true,mode:'relative'});
 const nativeJobs=new Set();
 await new Promise(resolve=>setImmediate(resolve));let envelope=f.messages.at(-1),body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'not-programmed',revision:0,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));
 envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);nativeJobs.add(key);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'scheduled',revision:1,deliveryConfirmed:false,acknowledgement:'native-api-and-journal-completed'}));assert.equal((await p).state,'scheduled');
 const invalidation=f.runtime.invalidate();await new Promise(resolve=>setImmediate(resolve));envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'scheduled',revision:1,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));
 envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);assert.equal(body.action,'cancel');
 // Cancel fails BEFORE removing native job. No false cancellation receipt.
 f.reply(envelope,'ok',JSON.stringify({...body,state:'unknown',revision:1,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.runtime.ready(),false);assert.equal(f.messages.at(-1).action,'revoke');
 f.reply(f.messages.at(-1),'revoked',null);assert.equal((await invalidation).state,'native-revoked');
 assert.equal(nativeJobs.size,1);assert.deepEqual(f.runtime.uncertainKeys(),[key]);
 const count=f.messages.length,again=f.runtime.invalidate();assert.equal(f.messages.length,count+1);assert.equal(f.messages.at(-1).action,'revoke');
 f.reply(f.messages.at(-1),'revoked',null);await again;assert.equal(f.runtime.ready(),false);assert.deepEqual(f.runtime.uncertainKeys(),[key]);
});
test('transport failure while revoking remains explicit unknown and retains key',async()=>{
 const f=fixture(),auth=f.runtime.authenticate();f.reply(f.messages[0],'verified',f.caps());await auth;
 // Direct cancellation of known identity receives rejection, then revoke also fails.
 const key='stay-hotel-apz:account-a:unknown-revoke',p=f.runtime.cancel({key});await new Promise(resolve=>setImmediate(resolve));
 f.reply(f.messages.at(-1),'rejected',null);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.messages.at(-1).action,'revoke');f.reply(f.messages.at(-1),'rejected',null);
 assert.equal((await p).state,'unknown');assert.equal(f.runtime.ready(),false);assert.deepEqual(f.runtime.uncertainKeys(),[key]);
 const retry=f.runtime.invalidate();f.reply(f.messages.at(-1),'rejected',null);assert.equal((await retry).state,'revocation-unknown');
 assert.deepEqual(f.runtime.uncertainKeys(),[key]);
});
test('uncertain A job remains scoped and cannot revoke authenticated B on invalidate',async()=>{
 const f=fixture();let auth=f.runtime.authenticate();f.reply(f.messages.at(-1),'verified',f.caps());await auth;
 const key='stay-hotel-apz:account-a:old-job',input={key,alarmAt:'2030-10-11T00:01:00Z',hotelReportAt:'2030-10-11T00:03:00Z',confirmed:true,apzConfirmed:true,mode:'relative'};
 const schedule=f.runtime.replace(input);await new Promise(resolve=>setImmediate(resolve));let envelope=f.messages.at(-1),body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'not-programmed',revision:0,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'scheduled',revision:1,deliveryConfirmed:false,acknowledgement:'native-api-and-journal-completed'}));assert.equal((await schedule).state,'scheduled');
 const invalidateA=f.runtime.invalidate();await new Promise(resolve=>setImmediate(resolve));envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'scheduled',revision:1,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));envelope=f.messages.at(-1);body=JSON.parse(envelope.payload);
 f.reply(envelope,'ok',JSON.stringify({...body,state:'unknown',revision:1,deliveryConfirmed:false}));await new Promise(resolve=>setImmediate(resolve));f.reply(f.messages.at(-1),'revoked',null);await invalidateA;
 f.switchAccount();auth=f.runtime.authenticate();f.reply(f.messages.at(-1),'verified',f.caps('account-b','epoch-b'));assert.equal(await auth,true);
 const count=f.messages.length;assert.equal((await f.runtime.invalidate()).state,'no-known-jobs');assert.equal(f.messages.length,count);assert.equal(f.runtime.ready(),true);
 assert.deepEqual(f.runtime.uncertainJobs(),[{key,account:'account-a',epoch:'epoch-1'}]);
 assert.equal((await f.runtime.cancel({key})).reason,'owner-epoch-mismatch');assert.equal(f.messages.length,count);assert.equal(f.runtime.ready(),true);
});
test('old epoch cancellation failure arriving after B authenticates cannot revoke B',async()=>{
 const f=fixture();let auth=f.runtime.authenticate();f.reply(f.messages.at(-1),'verified',f.caps());await auth;
 const key='stay-hotel-apz:account-a:pending-cancel',cancel=f.runtime.cancel({key});await new Promise(resolve=>setImmediate(resolve));const old=f.messages.at(-1);
 f.switchAccount();auth=f.runtime.authenticate();f.reply(f.messages.at(-1),'verified',f.caps('account-b','epoch-b'));assert.equal(await auth,true);
 const count=f.messages.length;f.reply(old,'rejected',null);assert.equal((await cancel).state,'unknown');assert.equal(f.messages.length,count);assert.equal(f.runtime.ready(),true);
 await f.runtime.invalidate();assert.equal(f.messages.length,count);assert.deepEqual(f.runtime.uncertainJobs(),[{key,account:'account-a',epoch:'epoch-1'}]);
});
test('same-account new native epoch never adopts old epoch pending keys',async()=>{
 const f=fixture();let auth=f.runtime.authenticate();f.reply(f.messages.at(-1),'verified',f.caps());await auth;
 const key='stay-hotel-apz:account-a:old-epoch',old=f.runtime.cancel({key});await new Promise(resolve=>setImmediate(resolve));
 auth=f.runtime.authenticate();f.reply(f.messages.at(-1),'verified',f.caps('account-a','epoch-new'));assert.equal(await auth,true);await old;
 const count=f.messages.length;await f.runtime.invalidate();assert.equal(f.messages.length,count);assert.equal(f.runtime.ready(),true);
 assert.deepEqual(f.runtime.uncertainJobs(),[{key,account:'account-a',epoch:'epoch-1'}]);
});
