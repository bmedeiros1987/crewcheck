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
test('production remains OFF; dedicated acceptance package requires debug and synthetic marker',()=>{
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
test('dedicated physical artifact uses native synthetic launcher and separate storage, no real login or permission UI',()=>{
 const root='android-wrapper/app/src/main/java/com/crewcheck/app/';
 const fixture=readFileSync(root+'StayAlarmPhysicalFixture.java','utf8'),activity=readFileSync(root+'StayAlarmPhysicalFixtureActivity.java','utf8');
 const host=readFileSync(root+'StayAlarmHostAndroid.java','utf8'),workflow=readFileSync('.github/workflows/stay-alarm-durable-offline.yml','utf8');
 const executable=(fixture+activity).replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(executable,/HttpsURLConnection|HttpClient|openConnection|WebView|requestPermissions|ACTION_REQUEST_|authClient|crewcheck\.online/);
 for(const value of ['synthetic-offline-account-a','synthetic-offline-account-b','synthetic-offline-event','crewcheck_synthetic_stay_journal_v1','crewcheck_synthetic_stay_authority_v1'])assert.ok(fixture.includes(value),value);
 assert.match(fixture,/if\(!StayAlarmHostAndroid\.testHostEnabled\(context\)\)return false/);
 assert.match(host,/if\(StayAlarmPhysicalFixture\.enabled\(context\)\)return null/);
 assert.match(activity,/if\(!StayAlarmPhysicalFixture\.enabled\(this\)\)\{finish\(\);return;\}/);
 assert.match(workflow,/MainActivity" tools:node="remove"/);
 assert.match(workflow,/sourceSets\.getByName\('debug'\)\.manifest\.srcFile/);
 assert.match(workflow,/assert launcher and launcher\[1\]=='com\.crewcheck\.app\.StayAlarmPhysicalFixtureActivity'/);
 assert.match(workflow,/archive\.read\('assets\/crewcheck-stay-synthetic\.txt'\)==b'crewcheck-stay-synthetic-v1'/);
});

test('acceptance identity is per run/attempt; verified artifact cannot replace production or older mcctest',()=>{
 const workflow=readFileSync('.github/workflows/stay-alarm-durable-offline.yml','utf8');
 const host=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmHostAndroid.java','utf8');
 assert.ok(workflow.includes('com.crewcheck.app.stayaccept${GITHUB_RUN_ID}r${GITHUB_RUN_ATTEMPT}'));
 assert.ok(workflow.includes("buildTypes.getByName('debug').applicationIdSuffix = pkg.substring('com.crewcheck.app'.length())"));
 assert.ok(workflow.includes('apksigner" verify --verbose --print-certs'));
 assert.ok(workflow.includes("application-label:'CrewCheck Teste Offline Isolado'"));
 assert.ok(workflow.includes('artifacts/stay-alarm-test/CrewCheck-Teste-Offline-Isolado.apk'));
 assert.ok(workflow.includes("package[1] not in ('com.crewcheck.app','com.crewcheck.app.mcctest')"));
 assert.ok(workflow.includes("value.startswith(expected+'.')"));
 assert.ok(host.includes('acceptancePackage(context.getPackageName())&&StayAlarmPhysicalFixture.hasMarker(context)'));
 assert.doesNotMatch(workflow,/keytool|CREWCHECK_STORE_PASSWORD|signingConfigs\.release|installDebug|adb install/);
});
test('read-only diagnostic identifies individual missing capabilities without granting or scheduling',()=>{
 const out=mkdtempSync(path.join(os.tmpdir(),'stay-capabilities-'));
 try{
  execFileSync('javac',['-d',out,'android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmPermissionState.java','scripts/fixtures/StayAlarmPermissionStateFixture.java'],{stdio:'inherit'});
  const value=execFileSync('java',['-cp',out,'com.crewcheck.app.StayAlarmPermissionStateFixture'],{encoding:'utf8'});
  assert.match(value,/PASS 729 capability combinations/);
 }finally{rmSync(out,{recursive:true,force:true});}
 const driver=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmAndroid.java','utf8');
 const fixture=readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmPhysicalFixture.java','utf8');
 assert.match(driver,/boolean permitted\(\)\s*\{\s*return permissionState\(\)\.ready\(\)/);
 const diagnostic=driver.slice(driver.indexOf('public StayAlarmPermissionState permissionState()'),driver.indexOf('@Override public void replace'));
 assert.doesNotMatch(diagnostic,/requestPermissions|startActivity|createNotificationChannel|setExact|\.notify\(|PowerManager|ACTION_REQUEST/);
 assert.ok(fixture.includes('button(box,"Atualizar diagnóstico",this::render)'));
 assert.ok(fixture.includes('permissions.describe(android.os.Build.VERSION.SDK_INT>=33,android.os.Build.VERSION.SDK_INT>=31)'));
});
