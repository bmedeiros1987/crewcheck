import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
test('durable local authority survives restart but not logout/APZ',()=>{
 const out=mkdtempSync(path.join(os.tmpdir(),'stay-durable-'));
 try{
  const sources=[
   'android-wrapper/app/src/main/java/com/crewcheck/app/NotificationTiming.java',
   'android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmEngine.java',
   'android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmDurableAuthority.java',
   'android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmCompositeOwner.java',
   'scripts/fixtures/StayAlarmDurableAuthorityFixture.java'
  ];
  execFileSync('javac',['-d',out,...sources],{stdio:'inherit'});
  const value=execFileSync('java',['-cp',out,'StayAlarmDurableAuthorityFixture'],{encoding:'utf8'});
  assert.match(value,/PASS 33 durable StayAlarm authority checks/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('production remains OFF; only isolated mcctest package can install physical-test host',()=>{
 const host=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmHostAndroid.java','utf8');
 assert.match(host,/PREPARED_HOST_ENABLED=false/);
 assert.match(host,/"com\.crewcheck\.app\.mcctest"\.equals\(context\.getPackageName\(\)\)/);
 assert.match(host,/ApplicationInfo\.FLAG_DEBUGGABLE/);
 assert.match(host,/PREPARED_HOST_ENABLED\|\|testHostEnabled\(context\)/);
 assert.doesNotMatch(host,/PREPARED_HOST_ENABLED=true/);
});
test('page/process suspension preserves durable jobs while explicit revocation tombstones them',()=>{
 const runtime=readFileSync('shared/stay-alarm-host-runtime.mjs','utf8');
 const client=readFileSync('client/src/lib/stayAlarmHost.ts','utf8');
 const host=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmHostAndroid.java','utf8');
 assert.match(runtime,/async function suspend\(\)/);
 assert.match(runtime,/leaseTimer=setTimer\(\(\)=>\{void suspend\(\);\},remaining\)/);
 assert.match(runtime,/close\(\)\{void suspend\(\)/);
 assert.match(client,/pagehide'.*runtime\.suspend/s);
 assert.match(client,/auth-expired'.*runtime\.revoke/s);
 assert.match(host,/"suspend"\.equals\(action\).*session\.revoke/s);
 assert.match(host,/"revoke"\.equals\(action\).*durable\.revoke/s);
});
test('confirmed schedule grants durable owner; receiver recovery still uses existing engine',()=>{
 const android=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmAndroid.java','utf8');
 const receiver=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmReceiver.java','utf8');
 assert.match(android,/"scheduled"\.equals\(r\.state\)&&!durable\.grant\(r\)/);
 assert.match(android,/new StayAlarmCompositeOwner\(StayAlarmHostAndroid\.owner\(\),StayAlarmDurableAuthorityAndroid\.open/);
 assert.match(receiver,/ACTION_BOOT_COMPLETED/);
 assert.match(receiver,/ACTION_TIMEZONE_CHANGED/);
 assert.match(receiver,/engine\.recover/);
});
