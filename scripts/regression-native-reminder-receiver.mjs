import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root='android-wrapper/app/src/main/java/com/crewcheck/app/';
const receiver=fs.readFileSync(process.env.CREWCHECK_RECEIVER_SOURCE||root+'CrewCheckNotificationReceiver.java','utf8');
function extract(signature){const start=receiver.indexOf(signature);assert(start>=0,signature);let at=receiver.indexOf('{',start),end=at+1,depth=1;for(;depth;end++){if(receiver[end]==='{')depth++;if(receiver[end]==='}')depth--;}return receiver.slice(start,end).replaceAll('System.currentTimeMillis()','NOW');}
const output=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-receiver-fence-'));
try {
 fs.mkdirSync(path.join(output,'android'),{recursive:true});fs.writeFileSync(path.join(output,'android/R.java'),'package android;public class R{public static class drawable{public static final int ic_dialog_info=1;}}');
 fs.writeFileSync(path.join(output,'ReceiverFenceFixture.java'),`package com.crewcheck.app;
import java.util.*;
public class ReceiverFenceFixture {
 static long NOW=1_800_000_000_000L;static final String CHANNEL_ID="crewcheck_alerts";static int cases;
 static void check(boolean value){if(!value)throw new AssertionError("receiver case "+(++cases));cases++;}
 static class Manifest {static class permission{static final String POST_NOTIFICATIONS="notify";}}
 static class PackageManager {static final int PERMISSION_GRANTED=0;}
 static class Build {static class VERSION{static int SDK_INT=36;}static class VERSION_CODES{static final int O=26;}}
 static class MainActivity {}
 static class Intent {static final int FLAG_ACTIVITY_SINGLE_TOP=1,FLAG_ACTIVITY_CLEAR_TOP=2;Map<String,Object> values=new HashMap<>();Intent(){}Intent(Context c,Class<?> type){}void addFlags(int f){}String getStringExtra(String k){return (String)values.get(k);}long getLongExtra(String k,long fallback){return values.containsKey(k)?(Long)values.get(k):fallback;}}
 static class Context {static final String NOTIFICATION_SERVICE="notifications";NotificationManager manager=new NotificationManager();boolean allowed=true;int checkSelfPermission(String p){return allowed?0:1;}Object getSystemService(String name){return manager;}}
 static class PendingIntent {static final int FLAG_UPDATE_CURRENT=1,FLAG_IMMUTABLE=2;static PendingIntent getActivity(Context c,int id,Intent i,int flags){return new PendingIntent();}}
 static class NotificationChannel {NotificationChannel(String id,String name,int level){}void setDescription(String value){}}
 static class Notification {static final int VISIBILITY_PRIVATE=0;static class BigTextStyle{BigTextStyle bigText(String text){return this;}}static class Builder{
 Builder(Context c){}Builder(Context c,String id){}Builder setContentTitle(String s){return this;}Builder setVisibility(int v){return this;}Builder setContentText(String s){return this;}Builder setStyle(BigTextStyle s){return this;}Builder setSmallIcon(int i){return this;}Builder setContentIntent(PendingIntent p){return this;}Builder setOnlyAlertOnce(boolean b){return this;}Builder setAutoCancel(boolean b){return this;}Notification build(){return new Notification();}}}
 static class NotificationManager {static final int IMPORTANCE_HIGH=4;int displayed;String tag;void createNotificationChannel(NotificationChannel c){}void notify(int id,Notification n){displayed++;}void notify(String key,int id,Notification n){tag=key;displayed++;}}
 static class Store implements NotificationLedger.Store {String scope="",epoch="";Map<String,Long> rows=new HashMap<>();public String scope(){return scope;}public String epoch(){return epoch;}public Map<String,Long> entries(){return new HashMap<>(rows);}public void commit(String s,String e,Map<String,Long> rows){scope=s;epoch=e;this.rows=new HashMap<>(rows);}}
 static class NotificationLedgerAndroid {static final String TAG="crewcheck-reminder:";static final Store store=new Store();Context context;NotificationLedgerAndroid(Context c){context=c;}NotificationLedger ledger(){return new NotificationLedger(store,new NotificationLedger.Device(){public long now(){return NOW;}public void cancel(String key){}public void dismiss(){context.manager.displayed=0;}});}}
 ${extract('public void onReceive(')}
 ${extract('private static void ensureChannel(')}
 static Intent prepare(Context c,String title){long at=NOW-1;String key=NotificationIdentity.key(title,"synthetic",at);Intent i=new Intent();i.values.put("scheduledAt",at);i.values.put("title",title);i.values.put("body","synthetic");long saved=NOW;NOW-=60000;check(new NotificationLedgerAndroid(c).ledger().schedule(key,at,e->{i.values.put("notificationKey",key);i.values.put("notificationEpoch",e);}));NOW=saved;return i;}
 public static void main(String[] args){Context c=new Context();NotificationLedger ledger=new NotificationLedgerAndroid(c).ledger();ReceiverFenceFixture r=new ReceiverFenceFixture();
 check(ledger.scope("account-A"));Intent old=prepare(c,"old-account");check(ledger.scope(""));check(ledger.scope("account-B"));r.onReceive(c,old);check(c.manager.displayed==0); // baseline receiver fails here
 Intent current=prepare(c,"new-account");r.onReceive(c,current);check(c.manager.displayed==1);check(c.manager.tag.startsWith(NotificationLedgerAndroid.TAG));r.onReceive(c,current);check(c.manager.displayed==1);
 check(ledger.scope(""));check(c.manager.displayed==0);check(ledger.scope("account-B"));
 Intent legacy=new Intent();legacy.values.put("scheduledAt",NOW-1);legacy.values.put("title","legacy");r.onReceive(c,legacy);check(c.manager.displayed==0);
 Intent denied=prepare(c,"denied");c.allowed=false;r.onReceive(c,denied);check(c.manager.displayed==0);c.allowed=true;r.onReceive(c,denied);check(c.manager.displayed==1);
 check(ledger.scope(""));check(ledger.scope("account-B"));Intent expired=prepare(c,"expired");NOW+=120001;r.onReceive(c,expired);check(c.manager.displayed==0);
 System.out.println("PASS actual receiver method: "+cases+" assertions; prior-account and legacy suppression, single claim, permission, expiry, own-tray cleanup; clock/dependencies synthetic");}}
`);
 const run=args=>{const r=spawnSync('java',args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
 run(['com.sun.tools.javac.Main','-d',output,...['NotificationIdentity','NotificationTiming','NotificationLedger'].map(n=>root+n+'.java'),path.join(output,'android/R.java'),path.join(output,'ReceiverFenceFixture.java')]);
 process.stdout.write(run(['-cp',output,'com.crewcheck.app.ReceiverFenceFixture']));
}finally{fs.rmSync(output,{recursive:true,force:true});}
