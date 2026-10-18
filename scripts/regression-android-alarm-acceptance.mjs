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
public class AlarmManager {public static final int RTC_WAKEUP=0; public int idle,normal,exact; public long at; public boolean fail,allowed,revoked;
public boolean canScheduleExactAlarms(){return allowed;}
public void setExactAndAllowWhileIdle(int type,long when,Object pi){if(fail||revoked)throw new SecurityException();exact++;at=when;}
public void setExact(int type,long when,Object pi){if(fail)throw new SecurityException();exact++;at=when;}
public void setAndAllowWhileIdle(int type,long when,Object pi){if(fail)throw new SecurityException();idle++;at=when;}
public void set(int type,long when,Object pi){if(fail)throw new SecurityException();normal++;at=when;}}`);
 fs.writeFileSync(path.join(temp,'AlarmAcceptance.java'),`import com.crewcheck.app.NotificationIdentity;
import com.crewcheck.app.NotificationLedger;
public class AlarmAcceptance {
static class Context {static final String ALARM_SERVICE="alarm";}
static class NotificationLedgerAndroid {
 static class Store implements NotificationLedger.Store {String scope="fixture",epoch="epoch";java.util.Map<String,Long> rows=new java.util.HashMap<>();public String scope(){return scope;}public String epoch(){return epoch;}public java.util.Map<String,Long> entries(){return new java.util.HashMap<>(rows);}public void commit(String s,String e,java.util.Map<String,Long> r){scope=s;epoch=e;rows=new java.util.HashMap<>(r);}}
 static final Store store=new Store();NotificationLedgerAndroid(Object c){}
 NotificationLedger ledger(){return new NotificationLedger(store,new NotificationLedger.Device(){public long now(){return System.currentTimeMillis();}public void cancel(String key){}public void dismiss(){}});}
 static Intent envelope(Object c,String key){Intent i=new Intent(c,CrewCheckNotificationReceiver.class);i.setData("crewcheck-reminder://job/"+key);return i;}
}
static class Build {static class VERSION {static int SDK_INT=36;} static class VERSION_CODES {static final int M=23;}}
static class CrewCheckNotificationReceiver {}
static class Uri {static String parse(String value){return value;}}
static class Intent {String data="";Intent(Object context,Class<?> receiver){} void putExtra(String k,Object v){} void setData(String value){data=value;}}
static class PendingIntent {static final int FLAG_UPDATE_CURRENT=1,FLAG_IMMUTABLE=2;static java.util.Set<String> identities=new java.util.HashSet<>();static PendingIntent getBroadcast(Object c,int id,Intent i,int f){identities.add(id+":"+i.data);return new PendingIntent();}}
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
a.alarm.allowed=true;check(a.scheduleNotification("a","b",""+future));check(a.alarm.exact==1&&a.alarm.idle==1);
a.alarm.revoked=true;check(a.scheduleNotification("a","b",""+future));check(a.alarm.exact==1&&a.alarm.idle==2);
a.alarm.revoked=false;a.alarm.allowed=false;Build.VERSION.SDK_INT=30;check(a.scheduleNotification("a","b",""+future));check(a.alarm.exact==2);
Build.VERSION.SDK_INT=22;check(a.scheduleNotification(null,null,""+future));check(a.alarm.exact==3);
Build.VERSION.SDK_INT=36;PendingIntent.identities.clear();
check(("Aa"+"body"+future).hashCode()==("BB"+"body"+future).hashCode());
check(a.scheduleNotification("Aa","body",""+future));check(a.scheduleNotification("BB","body",""+future));check(PendingIntent.identities.size()==2);
check(a.scheduleNotification("Aa","body",""+future));check(PendingIntent.identities.size()==2);
check(!NotificationIdentity.key("ab","c",future).equals(NotificationIdentity.key("a","bc",future)));
check(NotificationIdentity.key("a","b",future).matches("[0-9a-f]{64}"));
a.alarm=null;check(!a.scheduleNotification("a","b",""+future));
System.out.println("PASS actual schedule and bridge Java methods: "+cases+" synthetic acceptance/failure cases; no OS scheduling or send");}}
`);
 const run=args=>{const r=spawnSync('java',args,{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
 run(['com.sun.tools.javac.Main','-d',temp,'android-wrapper/app/src/main/java/com/crewcheck/app/NotificationIdentity.java','android-wrapper/app/src/main/java/com/crewcheck/app/NotificationTiming.java','android-wrapper/app/src/main/java/com/crewcheck/app/NotificationLedger.java',path.join(temp,'android/app/AlarmManager.java'),path.join(temp,'AlarmAcceptance.java')]);
 process.stdout.write(run(['-cp',temp,'AlarmAcceptance']));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
