package com.crewcheck.watch;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import com.google.android.gms.wearable.MessageEvent;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;
import org.robolectric.shadows.ShadowSystemClock;
import java.util.Set;
import java.lang.reflect.Proxy;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@LooperMode(LooperMode.Mode.LEGACY)
@Config(sdk=35,instrumentedPackages={"com.crewcheck.watch"},shadows={WatchCacheLifecycleTest.TestKey.class})
public class OperationalReplayJournalTest {
 Context context;SecureSnapshotStore store;String raw,lease;JSONObject admission;
 static final String NODE="synthetic-phone",PREFS="crewcheck_watch_secure",JOURNAL="operational_transport_journal_v1";
 @Before public void setup()throws Exception{
  resetUncertain();context=RuntimeEnvironment.getApplication();context.getSharedPreferences(PREFS,0).edit().clear().commit();
  WatchNotificationCenter.setEnabled(context,false);ShadowSystemClock.setNanoTime(1700000000000L*1000000L);
  store=new SecureSnapshotStore(context);admission=OperationalTestIngress.admit(store,NODE);lease=admission.getString("leaseId");
  raw=WatchContextSnapshot.demo(1700000000000L).toJson().put("contextId","legitimate:id/123").put("gate","MANUAL A12")
    .put("validUntilEpochMs",1700000090000L).toString();
 }
 static void resetUncertain()throws Exception{var f=SecureSnapshotStore.class.getDeclaredField("writeUncertain");f.setAccessible(true);f.setBoolean(null,false);}
 String envelope(long revision)throws Exception{return OperationalTestIngress.envelope(raw,lease,revision);}
 JSONObject revoke(String l,long revision)throws Exception{return new JSONObject().put("transportVersion",1).put("operation","revoke")
  .put("leaseId",l).put("revision",Long.toString(revision)).put("requestId",OperationalTestIngress.nonce());}
 @Test public void exactPayloadAndValiditySurviveEncryptionRestartAndDuplicate()throws Exception{
  assertEquals(OperationalReplayFence.Result.ACCEPTED,store.accept(NODE,raw,envelope(2)));
  String sealed=context.getSharedPreferences(PREFS,0).getString(JOURNAL,"");assertFalse(sealed.contains("MANUAL A12"));
  store=new SecureSnapshotStore(context);assertEquals("MANUAL A12",store.load().gate);assertEquals("legitimate:id/123",store.load().contextId);
  assertEquals(1700000090000L,store.load().validUntilEpochMs);
  assertEquals(OperationalReplayFence.Result.DUPLICATE,store.accept(NODE,raw,envelope(2)));
  assertEquals(sealed,context.getSharedPreferences(PREFS,0).getString(JOURNAL,""));
  assertEquals(OperationalReplayFence.Result.REJECTED,store.accept(NODE,raw,envelope(1)));
  assertEquals(OperationalReplayFence.Result.REJECTED,store.accept("foreign",raw,envelope(3)));
 }
 @Test public void missingPartialCorruptJournalRejectOldDataAndAdmission()throws Exception{
  for(String bad:new String[]{null,"{}","corrupt"}) {
   assertEquals(OperationalReplayFence.Result.ACCEPTED,store.accept(NODE,raw,envelope(1)));
   var e=context.getSharedPreferences(PREFS,0).edit();if(bad==null)e.remove(JOURNAL);else e.putString(JOURNAL,bad);e.commit();
   store=new SecureSnapshotStore(context);assertNull(store.load());assertEquals(OperationalReplayFence.Result.REJECTED,store.accept(NODE,raw,envelope(2)));
   assertNull(store.admit(NODE,admission.toString(),Set.of(NODE)));
   admission=OperationalTestIngress.admit(store,NODE);lease=admission.getString("leaseId");
  }
 }
 @Test public void rawMessageCannotBootstrapOrRestoreAfterClear()throws Exception{
  CrewCheckDataLayerService service=Robolectric.buildService(CrewCheckDataLayerService.class).create().get();
  MessageEvent legacy=new MessageEvent(){public int getRequestId(){return 1;}public String getPath(){return WatchContract.SNAPSHOT_PATH;}
   public byte[] getData(){return raw.getBytes(java.nio.charset.StandardCharsets.UTF_8);}public String getSourceNodeId(){return NODE;}};
  service.onMessageReceived(legacy);assertNull(store.load());
  assertEquals(OperationalReplayFence.Result.ACCEPTED,store.accept(NODE,raw,envelope(1)));store.clear();
  service.onMessageReceived(legacy);assertNull(store.load());assertEquals(OperationalReplayFence.Result.REJECTED,store.accept(NODE,raw,envelope(2)));
 }
 @Test public void revokedLeaseStaysRevokedAfterRestartAndDuplicateDoesNotWriteAgain()throws Exception{
  store.accept(NODE,raw,envelope(1));JSONObject command=revoke(lease,2);
  assertEquals("cleared",new JSONObject(store.revoke(NODE,command.toString())).getString("status"));assertNull(store.load());
  String sealed=context.getSharedPreferences(PREFS,0).getString(JOURNAL,"");store=new SecureSnapshotStore(context);
  assertEquals("cleared",new JSONObject(store.revoke(NODE,command.toString())).getString("status"));
  assertEquals(sealed,context.getSharedPreferences(PREFS,0).getString(JOURNAL,""));
  assertEquals(OperationalReplayFence.Result.REJECTED,store.accept(NODE,raw,envelope(99)));assertNull(store.load());
 }
 @Test public void oldRevokeDoesNotClearNewLeaseOrDifferentPendingChallenge()throws Exception{
  JSONObject old=revoke(lease,2);admission=OperationalTestIngress.admit(store,NODE);lease=admission.getString("leaseId");
  store.accept(NODE,raw,envelope(1));JSONObject request=new JSONObject().put("transportVersion",1).put("operation","admit")
   .put("requestId",OperationalTestIngress.nonce()).put("leaseId",OperationalTestIngress.nonce());
  String pending=store.challenge(NODE,request.toString(),Set.of(NODE));
  assertEquals("not_current",new JSONObject(store.revoke(NODE,old.toString())).getString("status"));assertEquals("MANUAL A12",store.load().gate);
  assertNotNull(store.admit(NODE,pending,Set.of(NODE)));
 }
 @Test public void revokeBeforeAdmitCancelsOnlyMatchingPendingLease()throws Exception{
  JSONObject request=new JSONObject().put("transportVersion",1).put("operation","admit")
   .put("requestId",OperationalTestIngress.nonce()).put("leaseId",OperationalTestIngress.nonce());
  String pending=store.challenge(NODE,request.toString(),Set.of(NODE));JSONObject command=revoke(request.getString("leaseId"),1);
  assertEquals("not_current",new JSONObject(store.revoke(NODE,command.toString())).getString("status"));
  assertNull(store.admit(NODE,pending,Set.of(NODE)));assertEquals(lease,admission.getString("leaseId"));
 }
 @Test public void ambiguousOrDisconnectedConnectionCannotAdmit()throws Exception{
  JSONObject request=new JSONObject().put("transportVersion",1).put("operation","admit")
   .put("requestId",OperationalTestIngress.nonce()).put("leaseId",OperationalTestIngress.nonce());
  assertNull(store.challenge(NODE,request.toString(),Set.of(NODE,"other")));
  String pending=store.challenge(NODE,request.toString(),Set.of(NODE));store.connectionChanged(Set.of());
  assertNull(store.admit(NODE,pending,Set.of(NODE)));
 }
 @Test public void commitFailureNeverAcknowledgesClearedAndRetryAfterRestartIsExplicit()throws Exception{
  store.accept(NODE,raw,envelope(1));JSONObject command=revoke(lease,2);final boolean[] fail={true};
  Context wrapped=new ContextWrapper(context){public Context getApplicationContext(){return this;}
   public SharedPreferences getSharedPreferences(String n,int mode){SharedPreferences actual=context.getSharedPreferences(n,mode);
    return (SharedPreferences)Proxy.newProxyInstance(getClassLoader(),new Class[]{SharedPreferences.class},(proxy,method,args)->{
     if(!method.getName().equals("edit"))return method.invoke(actual,args);SharedPreferences.Editor edit=actual.edit();
     return Proxy.newProxyInstance(getClassLoader(),new Class[]{SharedPreferences.Editor.class},(ep,em,ea)->{
      if(em.getName().equals("commit")&&fail[0])return false;Object value=em.invoke(edit,ea);return value instanceof SharedPreferences.Editor?ep:value;});});}}
  ;
  try{new SecureSnapshotStore(wrapped).revoke(NODE,command.toString());fail("must not ACK a failed commit");}catch(IllegalStateException expected){}
  assertNull(store.load()); // Uncertain in-memory journal is never exposed as authoritative.
  fail[0]=false;resetUncertain(); // Explicit simulated process restart: prior disk state is still unconfirmed.
  assertEquals("cleared",new JSONObject(new SecureSnapshotStore(context).revoke(NODE,command.toString())).getString("status"));assertNull(store.load());
 }
}
