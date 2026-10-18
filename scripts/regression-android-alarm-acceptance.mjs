import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync(process.env.CREWCHECK_ALARM_ACTIVITY || 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','utf8');
function method(signature){const start=source.indexOf(signature);assert(start>=0,signature);let i=source.indexOf('{',start),depth=1,end=i+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end);}
const schedule=method(source.includes('private boolean scheduleCrewCheckNotification(')?'private boolean scheduleCrewCheckNotification(':'private void scheduleCrewCheckNotification(');
const bridge=method('public boolean scheduleNotification(');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-alarm-acceptance-'));
try {
 fs.mkdirSync(path.join(temp,'android/app'),{recursive:true});
 fs.writeFileSync(path.join(temp,'android/app/AlarmManager.java'),`package android.app;
public class AlarmManager {public static final int RTC_WAKEUP=0; public int idle,normal; public long at; public boolean fail;
public void setAndAllowWhileIdle(int type,long when,Object pi){if(fail)throw new SecurityException();idle++;at=when;}
public void set(int type,long when,Object pi){if(fail)throw new SecurityException();normal++;at=when;}}`);
 fs.writeFileSync(path.join(temp,'AlarmAcceptance.java'),`public class AlarmAcceptance {
static class Context {static final String ALARM_SERVICE="alarm";}
static class Build {static class VERSION {static int SDK_INT=36;} static class VERSION_CODES {static final int M=23;}}
static class CrewCheckNotificationReceiver {}
static class Intent {Intent(Object context,Class<?> receiver){} void putExtra(String k,Object v){}}
static class PendingIntent {static final int FLAG_UPDATE_CURRENT=1,FLAG_IMMUTABLE=2;static PendingIntent getBroadcast(Object c,int id,Intent i,int f){return new PendingIntent();}}
boolean permission=true; android.app.AlarmManager alarm=new android.app.AlarmManager();
boolean hasCrewCheckNotificationPermission(){return permission;}
void ensureCrewCheckNotificationChannel(){}
void runOnUiThread(Runnable task){}
Object getSystemService(String name){return alarm;}
${schedule}
${bridge}
static int cases;static void check(boolean value){cases++;if(!value)throw new AssertionError("case "+cases);}
public static void main(String[] args){AlarmAcceptance a=new AlarmAcceptance();long future=System.currentTimeMillis()+600000;
check(!a.scheduleNotification("a","b","NaN"));check(!a.scheduleNotification("a","b","-1"));
a.permission=false;check(!a.scheduleNotification("a","b",""+future));check(a.alarm.idle==0);
a.permission=true;a.alarm.fail=true;check(!a.scheduleNotification("a","b",""+future));
a.alarm.fail=false;check(a.scheduleNotification("a","b",""+future));check(a.alarm.idle==1&&a.alarm.at==future);
Build.VERSION.SDK_INT=22;check(a.scheduleNotification(null,null,""+future));check(a.alarm.normal==1);
a.alarm=null;check(!a.scheduleNotification("a","b",""+future));
System.out.println("PASS actual schedule and bridge Java methods: "+cases+" synthetic acceptance/failure cases; no OS scheduling or send");}}
`);
 const run=args=>{const r=spawnSync('java',args,{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
 run(['com.sun.tools.javac.Main','-d',temp,path.join(temp,'android/app/AlarmManager.java'),path.join(temp,'AlarmAcceptance.java')]);
 process.stdout.write(run(['-cp',temp,'AlarmAcceptance']));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
