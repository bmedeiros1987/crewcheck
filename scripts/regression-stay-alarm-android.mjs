import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createAndroidStayAlarmAdapter, STAY_ANDROID_PROTOCOL } from '../shared/stay-alarm-android.mjs';
import { createStayAlarmController, stayAlarmIdentity } from '../shared/stay-alarm-adapter.mjs';
const key=stayAlarmIdentity('synthetic','stay'),ACK='native-api-and-journal-completed';
const input={accountId:'synthetic',eventId:'stay',confirmed:true,apzConfirmed:true,permission:'granted',now:0,
 alarmAt:'2030-10-11T07:00:00Z',hotelReportAt:'2030-10-11T08:30:00Z',mode:'relative'};
function fixture(){
 let account='synthetic',session='session-a',sequence=0,nativeEpoch='native-a';
 const jobs=new Map(),calls=[];
 const native={capabilities:()=>JSON.stringify({protocol:STAY_ANDROID_PROTOCOL,featureEnabled:true,ownerEpoch:nativeEpoch,atomicReplace:true,acknowledgedCancel:true}),async transact(raw){
  const request=JSON.parse(raw);calls.push(request);assert.equal('session' in request,false,'local auth session never crosses transport');
  const prior=jobs.get(request.key),revision=prior?.revision||0;
  const envelope={protocol:STAY_ANDROID_PROTOCOL,ownerEpoch:request.ownerEpoch,key:request.key,operationId:request.operationId,deliveryConfirmed:false};
  if(request.ownerEpoch!==nativeEpoch)return JSON.stringify({...envelope,state:'unknown'});
  if(request.action==='inspect')return JSON.stringify({...envelope,revision,state:prior?.state||'not-programmed'});
  if(request.expectedRevision!==revision)return JSON.stringify({...envelope,revision,state:'not-programmed',reason:'stale-revision'});
  const state=request.action==='cancel'?'cancelled':'scheduled',next={...request,revision:revision+1,state};jobs.set(request.key,next);
  return JSON.stringify({...envelope,...next,acknowledgement:ACK});
 }};
 const options={native,enabled:true,activeAccount:()=>account,activeSession:()=>session,operationId:()=>`operation-${++sequence}`};
 return {native,jobs,calls,options,setAccount:value=>account=value,setSession:value=>session=value,setNativeEpoch:value=>nativeEpoch=value};
}
test('factory OFF/missing capability/session cannot issue native commands',()=>{
 const f=fixture();let probes=0;f.native.capabilities=()=>{probes++;return '{}'};
 assert.equal(createAndroidStayAlarmAdapter({...f.options,enabled:false}),null);assert.equal(probes,0);
 assert.equal(createAndroidStayAlarmAdapter({...f.options,activeSession:undefined}),null);assert.equal(probes,0);
 assert.equal(createAndroidStayAlarmAdapter(f.options),null);assert.equal(f.calls.length,0);
});
test('controller transports explicit confirmations and acknowledged edits/modes/cancel using one identity',async()=>{
 const f=fixture(),controller=createStayAlarmController(createAndroidStayAlarmAdapter(f.options));
 assert.equal((await controller.replace(input)).state,'scheduled');
 assert.equal((await controller.replace({...input,alarmAt:'2030-10-11T07:30:00Z',mode:'absolute'})).state,'scheduled');
 assert.equal(f.jobs.size,1);assert.equal(f.jobs.get(key).mode,'absolute');assert.equal(f.jobs.get(key).alarmAt,'2030-10-11T07:30:00Z');
 assert.equal(f.calls.filter(x=>x.action==='replace').every(x=>x.confirmed&&x.apzConfirmed),true);
 assert.equal((await controller.cancel(input)).state,'cancelled');assert.equal(f.jobs.get(key).state,'cancelled');
});
test('relative edit follows new computed instant; absolute edit keeps its instant with a new hotel APZ',async()=>{
 const f=fixture(),adapter=createAndroidStayAlarmAdapter(f.options);
 await adapter.replace({...input,key});await adapter.replace({...input,key,alarmAt:'2030-10-11T08:00:00Z',hotelReportAt:'2030-10-11T09:30:00Z'});
 assert.equal(f.jobs.get(key).alarmAt,'2030-10-11T08:00:00Z');
 await adapter.replace({...input,key,mode:'absolute',hotelReportAt:'2030-10-11T09:30:00Z'});
 await adapter.replace({...input,key,mode:'absolute',hotelReportAt:'2030-10-11T10:30:00Z'});
 assert.equal(f.jobs.get(key).alarmAt,input.alarmAt);assert.equal(f.jobs.size,1);
});
test('invalid/native boolean/mismatched receipts are never device success',async()=>{
 for(const patch of [()=>true,()=>'{',r=>({...r,key:'foreign'}),r=>({...r,operationId:'old'}),r=>({...r,protocol:'v0'}),r=>({...r,ownerEpoch:'old-native'}),r=>({...r,deliveryConfirmed:true}),r=>({...r,acknowledgement:undefined}),r=>({...r,revision:0}),r=>({...r,alarmAt:'2030-10-11T01:00:00Z'})]){
  const f=fixture(),original=f.native.transact;f.native.transact=async raw=>{const result=await original(raw);return JSON.parse(raw).action==='inspect'?result:JSON.stringify(patch(JSON.parse(result)));};
  assert.equal((await createAndroidStayAlarmAdapter(f.options).replace({...input,key})).state,'unknown');
 }
});
test('cancellation needs matching native completion receipt, not a boolean or local preference',async()=>{
 for(const patch of [r=>({...r,state:'scheduled'}),r=>({...r,acknowledgement:undefined}),r=>({...r,key:'foreign'}),r=>({...r,revision:0})]){
  const f=fixture(),original=f.native.transact;f.native.transact=async raw=>{const result=await original(raw);return JSON.parse(raw).action==='cancel'?JSON.stringify(patch(JSON.parse(result))):result;};
  assert.equal((await createAndroidStayAlarmAdapter(f.options).cancel({key})).state,'unknown');
 }
});
test('account changes and same-account logout/relogin discard an in-flight native receipt',async()=>{
 for(const mutate of [f=>f.setAccount('another'),f=>f.setSession('session-b')]){
  const f=fixture(),original=f.native.transact;f.native.transact=async raw=>{const result=await original(raw);if(JSON.parse(raw).action==='replace')mutate(f);return result;};
  assert.equal((await createAndroidStayAlarmAdapter(f.options).replace({...input,key})).state,'unknown');
 }
 const f=fixture();assert.equal((await createAndroidStayAlarmAdapter(f.options).cancel({key:stayAlarmIdentity('foreign','stay')})).state,'unknown');assert.equal(f.calls.length,0);
});
test('local confirmations, instants and modes fail before bridge calls',async()=>{
 const f=fixture(),adapter=createAndroidStayAlarmAdapter(f.options);
 for(const patch of [{confirmed:false},{apzConfirmed:false},{alarmAt:'invalid'},{hotelReportAt:'invalid'},{mode:'auto'},{alarmAt:input.hotelReportAt}]){
  assert.equal((await adapter.replace({...input,key,...patch})).state,'not-programmed');
 }assert.equal(f.calls.length,0);
});
test('replace then cancel stays serialized through async bridge completion',async()=>{
 const f=fixture(),adapter=createAndroidStayAlarmAdapter(f.options);
 await Promise.all([adapter.replace({...input,key}),adapter.cancel({key})]);
 assert.deepEqual(f.calls.map(x=>x.action),['inspect','replace','inspect','cancel']);assert.equal(f.jobs.get(key).state,'cancelled');
});
test('prepared host is hard OFF and manifest requests no additional permission',()=>{
 const root='android-wrapper/app/src/main/',manifest=fs.readFileSync(root+'AndroidManifest.xml','utf8');
 const permissions=[...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(x=>x[1]).sort();
 assert.deepEqual(permissions,['INTERNET','ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','POST_NOTIFICATIONS','READ_EXTERNAL_STORAGE','WAKE_LOCK','SCHEDULE_EXACT_ALARM','REQUEST_IGNORE_BATTERY_OPTIMIZATIONS','RECEIVE_BOOT_COMPLETED'].map(x=>'android.permission.'+x).sort());
 assert.doesNotMatch(fs.readFileSync(root+'java/com/crewcheck/app/MainActivity.java','utf8'),/new StayAlarmBridge|AndroidCrewCheckStayAlarm/);
 assert.match(fs.readFileSync('client/src/components/v1391/PresentationStayManagerView.tsx','utf8'),/useRef\(createStayAlarmController\(nativeHost.current\)\)/);
 assert.match(fs.readFileSync(root+'java/com/crewcheck/app/StayAlarmHostAndroid.java','utf8'),/PREPARED_HOST_ENABLED=false/);
 const driver=fs.readFileSync(root+'java/com/crewcheck/app/StayAlarmAndroid.java','utf8');
 assert.doesNotMatch(driver,/requestPermissions|ACTION_REQUEST_|createNotificationChannel|startActivity/);
});

test('queued same-account request cannot adopt a fresh native epoch after reauth',async()=>{
 for(const stage of ['inspect','replace']){
  const f=fixture(),original=f.native.transact;
  f.native.transact=raw=>{if(JSON.parse(raw).action===stage)f.setNativeEpoch('native-b');return original(raw)};
  const adapter=createAndroidStayAlarmAdapter(f.options);
  assert.equal((await adapter.replace({...input,key})).state,'unknown');
  assert.equal(f.jobs.size,0);assert.equal(f.calls.every(call=>call.ownerEpoch==='native-a'),true);
 }
});
