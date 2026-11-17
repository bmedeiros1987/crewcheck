import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const jar=process.env.ANDROID_ALL_JAR;
assert(jar && fs.existsSync(jar),'Pinned Android-all framework jar required (test runtime only)');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-life-reminder-'));
try {
 const stub=path.join(temp,'com/crewcheck/app/MainActivity.java');fs.mkdirSync(path.dirname(stub),{recursive:true});
 fs.writeFileSync(stub,'package com.crewcheck.app; public class MainActivity extends android.app.Activity {}');
 const root='android-wrapper/app/src/main/java/com/crewcheck/app/';
 const files=['NotificationIdentity','NotificationTiming','NotificationLedger','NotificationLedgerAndroid','LifeReminderLedger','LifeReminderAndroid','CrewCheckNotificationReceiver'].map(n=>root+n+'.java');
 const run=args=>{const r=spawnSync('java',args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
 run(['com.sun.tools.javac.Main','-cp',jar,'-d',temp,...files,stub,'scripts/fixtures/LifeReminderLedgerFixture.java']);
 process.stdout.write(run(['-cp',temp+path.delimiter+jar,'com.crewcheck.app.LifeReminderLedgerFixture']));
 console.log('PASS Android adapter/actual receiver compile against framework API; MainActivity is a type-only stub here, full application compilation remains separate.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
