"""Execute the REAL phone publisher against in-memory Android/GMS boundaries.
Requires --java-home and --json-jar; no device, credentials or network calls.
"""
import argparse, pathlib, tempfile, subprocess
p=argparse.ArgumentParser();p.add_argument('--java-home',required=True);p.add_argument('--json-jar',required=True);a=p.parse_args()
stubs={
'android/content/Context.java':'''package android.content; public abstract class Context {public static final int MODE_PRIVATE=0;public Context getApplicationContext(){return this;} public abstract SharedPreferences getSharedPreferences(String n,int mode);}''',
'android/content/SharedPreferences.java':'''package android.content;public interface SharedPreferences {String getString(String k,String d);Editor edit();interface Editor{Editor putString(String k,String v);Editor remove(String k);boolean commit();}}''',
'com/google/android/gms/wearable/DataMap.java':'''package com.google.android.gms.wearable;public class DataMap extends java.util.HashMap<String,String>{public void putString(String k,String v){put(k,v);}public String getString(String k){return get(k);}public void putLong(String k,long v){put(k,Long.toString(v));}}''',
'com/google/android/gms/wearable/PutDataRequest.java':'''package com.google.android.gms.wearable;public class PutDataRequest{public DataMap map;public PutDataRequest(DataMap m){map=m;}public PutDataRequest setUrgent(){return this;}}''',
'com/google/android/gms/wearable/PutDataMapRequest.java':'''package com.google.android.gms.wearable;public class PutDataMapRequest{final DataMap map=new DataMap();public static PutDataMapRequest create(String p){return new PutDataMapRequest();}public DataMap getDataMap(){return map;}public PutDataRequest asPutDataRequest(){return new PutDataRequest(map);}}''',
'com/google/android/gms/wearable/Wearable.java':'''package com.google.android.gms.wearable;
public class Wearable {
 public record Node(String id){public String getId(){return id;}}
 public record Message(String node,String path,byte[] bytes){}
 public static java.util.List<Node> nodes=java.util.List.of(new Node("wear"));
 public static final java.util.List<Message> messages=new java.util.ArrayList<>();
 public static final java.util.List<PutDataRequest> items=new java.util.ArrayList<>();
 public static class Task<T>{T value;Task(T v){value=v;}public Task<T> addOnSuccessListener(java.util.function.Consumer<T> c){c.accept(value);return this;}public Task<T> addOnFailureListener(java.util.function.Consumer<Exception> c){return this;}}
 public static class Nodes{public Task<java.util.List<Node>> getConnectedNodes(){return new Task<>(nodes);}}
 public static class Messages{public Task<Integer> sendMessage(String node,String path,byte[] bytes){messages.add(new Message(node,path,bytes.clone()));return new Task<>(1);}}
 public static class Data{public Task<Object> putDataItem(PutDataRequest r){items.add(r);return new Task<>(new Object());}}
 public static Nodes getNodeClient(android.content.Context c){return new Nodes();}
 public static Messages getMessageClient(android.content.Context c){return new Messages();}
 public static Data getDataClient(android.content.Context c){return new Data();}
}''',
'com/crewcheck/app/OperationalPhoneJournalHarness.java':'''package com.crewcheck.app;
import android.content.*;import com.google.android.gms.wearable.*;import org.json.*;import java.util.*;import java.nio.charset.StandardCharsets;
public class OperationalPhoneJournalHarness {
 static int checks;static void ok(boolean v){checks++;if(!v)throw new AssertionError("check "+checks);}
 static class Memory extends Context implements SharedPreferences {
  Map<String,String> disk=new HashMap<>();boolean fail;
  public SharedPreferences getSharedPreferences(String n,int m){return this;}
  public String getString(String k,String d){return disk.getOrDefault(k,d);}
  public Editor edit(){return new Editor(){Map<String,String> pending=new HashMap<>();Set<String> removed=new HashSet<>();
   public Editor putString(String k,String v){pending.put(k,v);return this;}public Editor remove(String k){removed.add(k);return this;}
   public boolean commit(){if(fail)return false;removed.forEach(disk::remove);disk.putAll(pending);return true;}};}
 }
 static JSONObject journal(Memory c)throws Exception{return new JSONObject(c.getString("operational_transport_v1","{}"));}
 static void restart()throws Exception{for(String name:List.of("document","runtimeLease")){var f=CrewCheckWatchPublisher.class.getDeclaredField(name);f.setAccessible(true);f.set(null,"");}var f=CrewCheckWatchPublisher.class.getDeclaredField("persistenceUncertain");f.setAccessible(true);f.setBoolean(null,false);}
 static String grant(Memory c)throws Exception{String doc=CrewCheckWatchPublisher.navigation(c);String lease=CrewCheckWatchPublisher.admitHost(c,doc);if(lease.isEmpty())return lease;
  JSONObject challenge=new JSONObject(Wearable.messages.get(Wearable.messages.size()-1).bytes()==null?"{}":new String(Wearable.messages.get(Wearable.messages.size()-1).bytes(),StandardCharsets.UTF_8));
  challenge.put("receiverChallenge","a".repeat(64));CrewCheckWatchPublisher.sessionMessage(c,"wear","/crewcheck/watch/session/challenge/v1",challenge.toString().getBytes(StandardCharsets.UTF_8));
  challenge.put("status","admitted");CrewCheckWatchPublisher.sessionMessage(c,"wear","/crewcheck/watch/session/ack/v1",challenge.toString().getBytes(StandardCharsets.UTF_8));return lease;}
 static String snapshot()throws Exception{long now=System.currentTimeMillis();return new JSONObject().put("schemaVersion",1).put("contextId","legitimate:flight/123").put("state","BOARDING").put("gate","MANUAL A12").put("generatedAtEpochMs",now).put("validUntilEpochMs",now+600000).toString();}
 static void ack(Memory c,String node,JSONObject command,String status)throws Exception{JSONObject ack=new JSONObject(command.toString()).put("status",status);CrewCheckWatchPublisher.sessionMessage(c,node,"/crewcheck/watch/session/revoke-ack/v1",ack.toString().getBytes(StandardCharsets.UTF_8));}
 public static void main(String[] args)throws Exception{
  Memory c=new Memory();restart();String lease=grant(c),raw=snapshot();ok(!lease.isEmpty());
  CrewCheckWatchPublisher.publish(c,raw,lease,null);ok(Wearable.items.size()==1);
  JSONObject sent=new JSONObject(Wearable.items.get(0).map.getString("snapshotJson"));ok(sent.getString("gate").equals("MANUAL A12"));ok(sent.getString("contextId").equals("legitimate:flight/123"));ok(sent.getLong("validUntilEpochMs")==new JSONObject(raw).getLong("validUntilEpochMs"));
  ok(CrewCheckWatchPublisher.revoke(c,lease));JSONObject entry=journal(c).getJSONArray("outbox").getJSONObject(0);String exact=entry.getString("command");JSONObject command=new JSONObject(exact);ok(command.getString("revision").equals("2"));
  int count=Wearable.items.size();CrewCheckWatchPublisher.publish(c,raw,lease,null);CrewCheckWatchPublisher.republishLast(c);ok(Wearable.items.size()==count);
  restart();CrewCheckWatchPublisher.retryRevocations(c);ok(new String(Wearable.messages.get(Wearable.messages.size()-1).bytes(),StandardCharsets.UTF_8).equals(exact));CrewCheckWatchPublisher.republishLast(c);ok(Wearable.items.size()==count);
  ack(c,"foreign",command,"cleared");ok(journal(c).getJSONArray("outbox").length()==1);
  JSONObject wrong=new JSONObject(command.toString()).put("requestId","f".repeat(64));ack(c,"wear",wrong,"cleared");ok(journal(c).getJSONArray("outbox").length()==1);
  ack(c,"wear",command,"not_current");ok(journal(c).getJSONArray("outbox").length()==0);ok(journal(c).getJSONObject("lastRevokeDisposition").getString("status").equals("not_current"));
  String newer=grant(c);String before=journal(c).toString();CrewCheckWatchPublisher.publish(c,raw,lease,null);ok(before.equals(journal(c).toString()));
  c.fail=true;ok(!CrewCheckWatchPublisher.revoke(c,newer));count=Wearable.items.size();CrewCheckWatchPublisher.republishLast(c);ok(Wearable.items.size()==count);restart();CrewCheckWatchPublisher.republishLast(c);ok(Wearable.items.size()==count);c.fail=false;
  c=new Memory();restart();for(int i=0;i<16;i++){String l=grant(c);ok(!l.isEmpty());ok(CrewCheckWatchPublisher.revoke(c,l));}
  ok(journal(c).getJSONArray("outbox").length()==16);String doc=CrewCheckWatchPublisher.navigation(c);ok(CrewCheckWatchPublisher.admitHost(c,doc).isEmpty());ok(CrewCheckWatchPublisher.localStatus(c).equals("pending_revocations_capacity"));
  JSONObject oldest=new JSONObject(journal(c).getJSONArray("outbox").getJSONObject(0).getString("command"));ack(c,"wear",oldest,"cleared");ok(journal(c).getJSONArray("outbox").length()==15);ok(!grant(c).isEmpty());
  System.out.println("REAL phone publisher: "+checks+" assertions PASS; synthetic storage/GMS only");
 }
}'''}
with tempfile.TemporaryDirectory(prefix='crewcheck-phone-journal-') as tmp:
 root=pathlib.Path(tmp)
 for name,source in stubs.items():
  f=root/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(source)
 files=[str(f) for f in root.rglob('*.java')]
 files.append('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchPublisher.java')
 classes=root/'classes';classes.mkdir()
 subprocess.run([a.java_home+'/bin/javac','-cp',a.json_jar,'-d',str(classes),*files],check=True)
 subprocess.run([a.java_home+'/bin/java','-cp',str(classes)+':'+a.json_jar,'com.crewcheck.app.OperationalPhoneJournalHarness'],check=True)
