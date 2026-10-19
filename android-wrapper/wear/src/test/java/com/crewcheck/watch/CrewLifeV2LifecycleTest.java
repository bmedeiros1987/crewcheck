package com.crewcheck.watch;

import android.content.Context;
import android.os.Bundle;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import com.google.android.gms.wearable.MessageEvent;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.*;
import org.robolectric.shadows.ShadowSystemClock;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import static org.junit.Assert.*;
import static com.crewcheck.watch.CrewLifeFenceTest.*;
import static com.crewcheck.watch.CrewLifeSnapshotTest.STREAM;

@RunWith(org.robolectric.RobolectricTestRunner.class)
@LooperMode(LooperMode.Mode.LEGACY)
@Config(sdk=35,instrumentedPackages={"com.crewcheck.watch"},qualifiers="w192dp-h192dp-round-mdpi",shadows={
        WatchTextLayoutTest.NoDeviceAmbient.class,CrewLifeV2LifecycleTest.TestHealthKey.class,
        WatchCacheLifecycleTest.TestKey.class,CrewLifeV2LifecycleTest.AckTransport.class})
public class CrewLifeV2LifecycleTest {
    private Context context;
    private static String deliveredAck;
    private static boolean failNextCommit;
    @Before public void setup() {
        ShadowSystemClock.setNanoTime(1_800_000_000_000L*1_000_000L);
        context=RuntimeEnvironment.getApplication();
        context.getSharedPreferences("crewcheck_watch_wellbeing",0).edit().clear().commit();
        context.getSharedPreferences("crewcheck_watch_secure",0).edit().clear().commit();
        WatchNotificationCenter.setEnabled(context,false);deliveredAck=null;failNextCommit=false;
    }
    @Implements(value=WellbeingStore.class,isInAndroidSdk=false)
    public static class TestHealthKey {
        @Implementation protected SecretKey getOrCreateKey(){return new SecretKeySpec(new byte[32],"AES");}
        @Implementation protected boolean commitHealth(android.content.SharedPreferences.Editor edit) {
            if(failNextCommit){failNextCommit=false;return false;}return edit.commit();
        }
    }
    @Implements(value=CrewCheckDataLayerService.class,isInAndroidSdk=false)
    public static class AckTransport extends org.robolectric.shadows.ShadowService {
        @Implementation protected void sendCrewLifeAck(String node,String ack) throws Exception {
            assertEquals(NODE,node);
            android.content.SharedPreferences p=RuntimeEnvironment.getApplication().getSharedPreferences("crewcheck_watch_wellbeing",0);
            JSONObject journal=new JSONObject(p.getString("crewlife_fence_v2","{}"));
            JSONObject message=new JSONObject(ack);
            if ("challenge".equals(message.getString("op"))) {
                JSONObject pending=journal.getJSONObject("pendingChallenge");
                assertEquals(node,pending.getString("node"));
                assertEquals(message.getString("wearChallenge"),pending.getString("wearChallenge"));
                assertEquals(message.getString("requestId"),pending.getString("requestId"));
            } else {
                assertTrue(journal.getLong("revision") >= message.getLong("revision"));
                assertEquals(message.getString("streamId"),journal.getString("streamId"));
                assertEquals(message.getString("wearChallenge"),journal.getJSONObject("appliedReceipt").getString("wearChallenge"));
                assertFalse(journal.has("pendingChallenge"));
                assertFalse(p.contains("crewlife_payload_v1"));
                if(journal.getLong("revision")==message.getLong("revision")) assertFalse(p.contains("crewlife_payload_v2"));
            }
            deliveredAck=ack;
        }
    }
    private static void deliver(CrewCheckDataLayerService service,String path,String raw) {
        if(path.equals(WatchContract.CREWLIFE_V2_PATH) && !raw.equals("{}")) CrewLifeSnapshot.fromJson(raw,ShadowSystemClock.currentTimeMillis());
        service.onMessageReceived(new MessageEvent(){
            public int getRequestId(){return 1;} public String getPath(){return path;}
            public byte[] getData(){return raw.getBytes(StandardCharsets.UTF_8);} public String getSourceNodeId(){return NODE;}
        });
    }
    private static String payload(long rev,int score,long scoreExpiry,long stepsExpiry) throws Exception {
        long now=ShadowSystemClock.currentTimeMillis();
        JSONObject j=CrewLifeSnapshot.demo(now).toJson().put("revision",rev).put("validUntilEpochMs",now+120000);
        JSONObject m=j.getJSONObject("metrics");
        m.getJSONObject("recoveryScore").put("value",score).put("validUntilEpochMs",scoreExpiry);
        m.getJSONObject("steps").put("value",51).put("validUntilEpochMs",stepsExpiry);
        m.remove("sleepMinutes");m.remove("activeMinutes");return j.toString();
    }
    private static String handshake(CrewCheckDataLayerService service,String action,String stream,long revision,String id) throws Exception {
        deliver(service,WatchContract.CREWLIFE_CONTROL_PATH,request(action,stream,revision,id));
        assertNotNull(deliveredAck);JSONObject challenge=new JSONObject(deliveredAck);
        assertEquals("challenge",challenge.getString("op"));
        String wire=echo(action,stream,revision,id,challenge.getString("wearChallenge"));
        deliveredAck=null;deliver(service,WatchContract.CREWLIFE_CONTROL_PATH,wire);assertNotNull(deliveredAck);
        return wire;
    }
    private static void reset(CrewCheckDataLayerService service) throws Exception {handshake(service,"reset",STREAM,1,STREAM);}
    private static String handshake(WellbeingStore store,String action,String stream,long revision,String id) throws Exception {
        String challenge=store.applyCrewLifeControl(request(action,stream,revision,id),NODE);assertNotNull(challenge);
        String wire=echo(action,stream,revision,id,new JSONObject(challenge).getString("wearChallenge"));
        assertNotNull(store.applyCrewLifeControl(wire,NODE));return wire;
    }
    private static String text(View view) {
        if(view instanceof TextView)return ((TextView)view).getText().toString();String out="";
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)out+=text(((ViewGroup)view).getChildAt(i))+"|";
        return out;
    }
    private static View content(MainActivity a) throws Exception {Field f=MainActivity.class.getDeclaredField("content");f.setAccessible(true);return (View)f.get(a);}
    private static void showHealth(MainActivity a) throws Exception {
        Field f=MainActivity.class.getDeclaredField("MODE_CREWLIFE");f.setAccessible(true);
        java.lang.reflect.Method m=MainActivity.class.getDeclaredMethod("showScreen",int.class);m.setAccessible(true);m.invoke(a,f.getInt(null));
    }
    private static void settle(){Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(250));}
    private CrewLifeSnapshot assertHealthCached() throws Exception {
        android.content.SharedPreferences p=context.getSharedPreferences("crewcheck_watch_wellbeing",0);
        String info="time="+ShadowSystemClock.currentTimeMillis()+" fence="+p.getString("crewlife_fence_v2","{}");
        WellbeingStore store=new WellbeingStore(context);
        CrewLifeSnapshot value=store.loadCrewLife();
        assertNotNull(info+" keys="+p.getAll().keySet(),value);return value;
    }
    @Test public void migrationClearsLegacyWithoutTouchingRoutineOrOperationAndRejectsV1Replay() throws Exception {
        new SecureSnapshotStore(context).save(WatchContextSnapshot.demo(ShadowSystemClock.currentTimeMillis()).toJson().toString());
        new WellbeingStore(context).saveRoutine(RoutineSnapshot.demo(ShadowSystemClock.currentTimeMillis()).toJson().toString());
        context.getSharedPreferences("crewcheck_watch_wellbeing",0).edit().putString("crewlife_payload_v1","legacySynthetic").putString("crewlife_iv_v1","legacy").commit();
        WellbeingStore s=new WellbeingStore(context);assertNull(s.loadCrewLife());
        assertFalse(context.getSharedPreferences("crewcheck_watch_wellbeing",0).contains("crewlife_payload_v1"));
        assertNotNull(s.loadRoutine());assertNotNull(new SecureSnapshotStore(context).load());
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {deliver(service.get(),WatchContract.CREWLIFE_PATH,"{\"schemaVersion\":1,\"recoveryScore\":78}");assertNull(s.loadCrewLife());}
        finally{service.destroy();}
    }
    @Test public void ackFollowsDurableCleanupAndReplayFenceSurvivesNewStoreInstance() throws Exception {
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {
            reset(service.get());long now=ShadowSystemClock.currentTimeMillis();String raw=payload(2,0,now+1000,now+2000);
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,raw);
            assertEquals(Integer.valueOf(0),assertHealthCached().value("recoveryScore",now));
            String cipher=context.getSharedPreferences("crewcheck_watch_wellbeing",0).getString("crewlife_payload_v2","");
            assertFalse(cipher.isEmpty());assertFalse(cipher.contains("recoveryScore"));
            handshake(service.get(),"revoke",STREAM,3,"00000000-0000-4000-8000-000000000002");
            assertEquals("revoke_ack",new JSONObject(deliveredAck).getString("op"));assertNull(new WellbeingStore(context).loadCrewLife());
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,raw);assertNull(new WellbeingStore(context).loadCrewLife());
            assertEquals(3,new JSONObject(context.getSharedPreferences("crewcheck_watch_wellbeing",0).getString("crewlife_fence_v2","{}")).getLong("revision"));
        } finally{service.destroy();}
    }
    @Test public void actualDataLayerUpdatesOpenActivityPartialExpiryPauseResumeAndAmbientNeverShowOldHealth() throws Exception {
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try(ActivityController<MainActivity> activity=Robolectric.buildActivity(MainActivity.class).create().start().resume()) {
            reset(service.get());MainActivity a=activity.get();showHealth(a);long now=ShadowSystemClock.currentTimeMillis();
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,payload(2,0,now+1000,now+4000));settle();
            assertTrue(text(content(a)).contains("0/100"));assertTrue(text(content(a)).contains("51"));
            ShadowSystemClock.setNanoTime((now+1000)*1_000_000L);Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1100));
            assertFalse(text(content(a)).contains("0/100"));assertTrue(text(content(a)).contains("51"));
            activity.pause();
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,payload(3,42,now+3000,now+4000));settle();
            assertFalse(text(content(a)).contains("42/100"));activity.resume();settle();assertTrue(text(content(a)).contains("42/100"));
            a.getAmbientCallback().onEnterAmbient(new Bundle());assertFalse(text(content(a)).contains("42/100"));
            ShadowSystemClock.setNanoTime((now+5000)*1_000_000L);a.getAmbientCallback().onUpdateAmbient();
            assertFalse(text(content(a)).contains("42/100"));a.getAmbientCallback().onExitAmbient();showHealth(a);
            assertTrue(text(content(a)).contains("Sem medições válidas"));assertNull(new WellbeingStore(context).loadCrewLife());
        }finally{service.destroy();}
    }
    @Test public void actualComplicationDataExpiresBeforeTheMetricBoundaryIncludingZeroRing() throws Exception {
        long now=ShadowSystemClock.currentTimeMillis();WellbeingStore s=new WellbeingStore(context);
        handshake(s,"reset",STREAM,1,STREAM);
        String wire=payload(2,0,now+1000,now+4000);
        CrewLifeSnapshot.fromJson(wire,ShadowSystemClock.currentTimeMillis());
        s.applyCrewLifeData(wire,NODE,ShadowSystemClock.currentTimeMillis());
        assertHealthCached();
        ServiceController<CrewLifeComplicationService> provider=Robolectric.buildService(CrewLifeComplicationService.class).create();
        try {
            java.lang.reflect.Method build=BaseComplicationService.class.getDeclaredMethod("buildData",androidx.wear.watchface.complications.data.ComplicationType.class,boolean.class);
            build.setAccessible(true);
            androidx.wear.watchface.complications.data.ComplicationData data=(androidx.wear.watchface.complications.data.ComplicationData)build.invoke(provider.get(),androidx.wear.watchface.complications.data.ComplicationType.RANGED_VALUE,false);
            assertNotNull(data);assertEquals(now+999,data.getValidTimeRange().getEndDateTimeMillis().toEpochMilli());
            assertFalse(data.getValidTimeRange().contains(java.time.Instant.ofEpochMilli(now+1000)));
            ShadowSystemClock.setNanoTime((now+1000)*1_000_000L);
            assertNull(build.invoke(provider.get(),androidx.wear.watchface.complications.data.ComplicationType.RANGED_VALUE,false));
        }finally{provider.destroy();}
    }
    @Test public void failedDurableCommitCannotEmitCleanupAck() throws Exception {
        WellbeingStore store=new WellbeingStore(context);store.loadCrewLife();failNextCommit=true;
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {
            deliver(service.get(),WatchContract.CREWLIFE_CONTROL_PATH,request("reset",STREAM,1,STREAM));
            assertNull(deliveredAck);assertNull(store.loadCrewLife());
            assertFalse(context.getSharedPreferences("crewcheck_watch_wellbeing",0).contains("crewlife_fence_v2"));
        }finally{service.destroy();}
    }
    @Test public void crashBeforeConsumeCommitHasNoAckRetryAndRestartUseDurableReceipt() throws Exception {
        WellbeingStore store=new WellbeingStore(context);store.loadCrewLife();
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {
            deliver(service.get(),WatchContract.CREWLIFE_CONTROL_PATH,request("reset",STREAM,1,STREAM));
            JSONObject challenge=new JSONObject(deliveredAck);String nonce=challenge.getString("wearChallenge");
            String wire=echo("reset",STREAM,1,STREAM,nonce);deliveredAck=null;failNextCommit=true;
            deliver(service.get(),WatchContract.CREWLIFE_CONTROL_PATH,wire);assertNull(deliveredAck);
            JSONObject journal=new JSONObject(context.getSharedPreferences("crewcheck_watch_wellbeing",0).getString("crewlife_fence_v2","{}"));
            assertTrue(journal.has("pendingChallenge"));assertFalse(journal.has("appliedReceipt"));
            // Process/store recreation after commit failure: pending tuple remains usable, but no false ACK.
            assertNotNull(new WellbeingStore(context).applyCrewLifeControl(wire,NODE));
            long now=ShadowSystemClock.currentTimeMillis();String raw=payload(2,0,now+1000,now+4000);
            new WellbeingStore(context).applyCrewLifeData(raw,NODE,now);
            // Simulate lost ACK after durable commit; exact retry after restart must not clear newer values.
            String ack=new WellbeingStore(context).applyCrewLifeControl(wire,NODE);assertNotNull(ack);
            assertEquals("reset_ack",new JSONObject(ack).getString("op"));assertHealthCached();
            journal=new JSONObject(context.getSharedPreferences("crewcheck_watch_wellbeing",0).getString("crewlife_fence_v2","{}"));
            assertEquals(2,journal.getLong("revision"));assertFalse(journal.has("pendingChallenge"));
        }finally{service.destroy();}
    }
    @Test public void lostJournalAndDelayedResetCannotRestoreLegacyOrOldV2Health() throws Exception {
        WellbeingStore store=new WellbeingStore(context);
        String old=handshake(store,"reset",STREAM,1,STREAM);
        context.getSharedPreferences("crewcheck_watch_wellbeing",0).edit().clear().commit();
        String b="00000000-0000-4000-8000-000000000002";
        handshake(new WellbeingStore(context),"reset",b,1,b);
        assertNull(new WellbeingStore(context).applyCrewLifeControl(old,NODE));
        long now=ShadowSystemClock.currentTimeMillis();
        new WellbeingStore(context).applyCrewLifeData(payload(2,78,now+1000,now+4000),NODE,now);
        assertNull(new WellbeingStore(context).loadCrewLife());
        JSONObject journal=new JSONObject(context.getSharedPreferences("crewcheck_watch_wellbeing",0).getString("crewlife_fence_v2","{}"));
        assertEquals(b,journal.getString("streamId"));
    }
    @Test public void challengedRevokeAfterJournalLossPersistsOnlyRevokedFenceBeforeCleanupAck() throws Exception {
        WellbeingStore store=new WellbeingStore(context);
        handshake(store,"revoke",STREAM,3,STREAM);
        JSONObject state=new JSONObject(context.getSharedPreferences("crewcheck_watch_wellbeing",0).getString("crewlife_fence_v2","{}"));
        assertTrue(state.getBoolean("revoked"));assertFalse(state.has("pendingChallenge"));assertNull(store.loadCrewLife());
        long now=ShadowSystemClock.currentTimeMillis();store.applyCrewLifeData(payload(4,78,now+1000,now+4000),NODE,now);
        assertNull(new WellbeingStore(context).loadCrewLife());
    }
    @Test public void phoneZeroTimeTombstoneViaDataLayerAdvancesRevokedFenceAndClearsCiphertext() throws Exception {
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {
            reset(service.get());long now=ShadowSystemClock.currentTimeMillis();
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,payload(2,78,now+1000,now+4000));assertHealthCached();
            JSONObject tombstone=new JSONObject(payload(3,78,now+1000,now+4000)).put("kind","revoked")
                    .put("generatedAtEpochMs",0).put("validUntilEpochMs",0).put("metrics",new JSONObject());
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,tombstone.toString());
            android.content.SharedPreferences p=context.getSharedPreferences("crewcheck_watch_wellbeing",0);
            JSONObject state=new JSONObject(p.getString("crewlife_fence_v2","{}"));
            assertEquals(3,state.getLong("revision"));assertTrue(state.getBoolean("revoked"));
            assertFalse(p.contains("crewlife_payload_v2"));assertNull(new WellbeingStore(context).loadCrewLife());
            deliver(service.get(),WatchContract.CREWLIFE_V2_PATH,payload(4,78,now+1000,now+4000));
            assertNull(new WellbeingStore(context).loadCrewLife());
        }finally{service.destroy();}
    }
    @Test public void losingOnlyJournalClearsOrphanCiphertextBeforeChallengeResponse() throws Exception {
        WellbeingStore store=new WellbeingStore(context);handshake(store,"reset",STREAM,1,STREAM);
        long now=ShadowSystemClock.currentTimeMillis();store.applyCrewLifeData(payload(2,78,now+1000,now+4000),NODE,now);assertHealthCached();
        android.content.SharedPreferences p=context.getSharedPreferences("crewcheck_watch_wellbeing",0);
        assertTrue(p.getBoolean("crewlife_migrated_v2",false));assertTrue(p.contains("crewlife_payload_v2"));
        p.edit().remove("crewlife_fence_v2").commit();
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {
            deliver(service.get(),WatchContract.CREWLIFE_CONTROL_PATH,request("reset",B,1,B));
            assertNotNull(deliveredAck);assertEquals("challenge",new JSONObject(deliveredAck).getString("op"));
            assertFalse(p.contains("crewlife_payload_v2"));assertFalse(p.contains("crewlife_iv_v2"));
            assertTrue(p.getBoolean("crewlife_migrated_v2",false));assertNull(new WellbeingStore(context).loadCrewLife());
        }finally{service.destroy();}
    }
    @Test public void corruptedJournalClearsCiphertextAndRequiresFreshChallenge() throws Exception {
        WellbeingStore store=new WellbeingStore(context);String old=handshake(store,"reset",STREAM,1,STREAM);
        long now=ShadowSystemClock.currentTimeMillis();store.applyCrewLifeData(payload(2,78,now+1000,now+4000),NODE,now);assertHealthCached();
        context.getSharedPreferences("crewcheck_watch_wellbeing",0).edit().putString("crewlife_fence_v2","{").commit();
        assertNull(new WellbeingStore(context).loadCrewLife());
        assertNull(new WellbeingStore(context).applyCrewLifeControl(old,NODE));
        assertNotNull(new WellbeingStore(context).applyCrewLifeControl(request("reset",STREAM,1,B),NODE));
    }
    @Test public void dataEventPathUsesSourceHostAndFullReplacementRatherThanMessageOnly() throws Exception {
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try {
            reset(service.get());long now=ShadowSystemClock.currentTimeMillis();
            changedData(service.get(),NODE,payload(2,78,now+1000,now+2000));
            assertEquals(78,assertHealthCached().recoveryScore);
            changedData(service.get(),"foreign-node",payload(3,42,now+1000,now+2000));
            assertEquals(78,assertHealthCached().recoveryScore);
            changedData(service.get(),NODE,"{}");assertNull(new WellbeingStore(context).loadCrewLife());
        }finally{service.destroy();}
    }
    private static void changedData(CrewCheckDataLayerService service,String node,String raw) {
        com.google.android.gms.wearable.DataMap map=new com.google.android.gms.wearable.DataMap();map.putString(WatchContract.DATA_KEY_CREWLIFE_JSON,raw);
        byte[] bytes=map.toByteArray();
        com.google.android.gms.wearable.DataItem item=new com.google.android.gms.wearable.DataItem(){
            public android.net.Uri getUri(){return android.net.Uri.parse("wear://"+node+WatchContract.CREWLIFE_V2_PATH);}
            public byte[] getData(){return bytes;}
            public com.google.android.gms.wearable.DataItem setData(byte[] value){return this;}
            public java.util.Map<String,com.google.android.gms.wearable.DataItemAsset> getAssets(){return java.util.Collections.emptyMap();}
            public com.google.android.gms.wearable.DataItem freeze(){return this;}public boolean isDataValid(){return true;}
        };
        service.processDataEvent(new com.google.android.gms.wearable.DataEvent(){
            public int getType(){return TYPE_CHANGED;}public com.google.android.gms.wearable.DataItem getDataItem(){return item;}
            public com.google.android.gms.wearable.DataEvent freeze(){return this;}public boolean isDataValid(){return true;}
        });
    }
    @Test public void malformedReplacementClearsPreviousHealthAndOldRevisionCannotReturn() throws Exception {
        WellbeingStore s=new WellbeingStore(context);handshake(s,"reset",STREAM,1,STREAM);
        long now=ShadowSystemClock.currentTimeMillis();String raw=payload(2,78,now+1000,now+2000);CrewLifeSnapshot.fromJson(raw,ShadowSystemClock.currentTimeMillis());s.applyCrewLifeData(raw,NODE,ShadowSystemClock.currentTimeMillis());assertHealthCached();
        s.applyCrewLifeData("{}",NODE,now);assertNull(s.loadCrewLife());s.applyCrewLifeData(raw,NODE,now);assertNull(s.loadCrewLife());
    }
}
