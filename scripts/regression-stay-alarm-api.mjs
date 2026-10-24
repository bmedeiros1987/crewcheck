import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const api=process.env.STAY_ANDROID_API_JAR;
if(!api)throw Error('STAY_ANDROID_API_JAR must point to pinned Robolectric Android15/API35 jar for compile/JSON fixtures; no device');
const webkit=process.env.STAY_WEBKIT_JAR;
if(!webkit)throw Error('STAY_WEBKIT_JAR required for actual origin/frame listener compilation');
const classpath=api+path.delimiter+webkit;
const output=mkdtempSync(path.join(os.tmpdir(),'crewcheck-stay-api-'));
const root='android-wrapper/app/src/main/java/com/crewcheck/app/';
const sources=['NotificationTiming','StayAlarmEngine','StayAlarmAndroid','StayAlarmBridge','StayAlarmReceiver','StayAlarmSessionHost','StayAlarmHostAndroid','StayAlarmDurableAuthority','StayAlarmDurableAuthorityAndroid','StayAlarmCompositeOwner'].map(name=>root+name+'.java')
 .concat(['scripts/fixtures/StayAlarmEngineFixture.java','scripts/fixtures/StayAlarmBridgeFixture.java','scripts/fixtures/StayAlarmHostAdmissionFixture.java']);
try {
 const args=['-source','8','-target','8','-cp',classpath,'-d',output,...sources];
 if(process.env.STAY_ECJ_JAR)execFileSync('java',['-jar',process.env.STAY_ECJ_JAR,...args],{stdio:'inherit'});
 else execFileSync('javac',args,{stdio:'inherit'});
 execFileSync('java',['-cp',output+path.delimiter+classpath,'StayAlarmBridgeFixture'],{stdio:'inherit',timeout:30000});
 execFileSync('java',['-cp',output+path.delimiter+classpath,'com.crewcheck.app.StayAlarmHostAdmissionFixture'],{stdio:'inherit',timeout:30000});
 console.log('PASS real Android driver/receiver/bridge compile against Android15/API35 classes; production JSON bridge ran on JVM with fake device, no APK/device/alarm');
}finally{rmSync(output,{recursive:true,force:true});}
