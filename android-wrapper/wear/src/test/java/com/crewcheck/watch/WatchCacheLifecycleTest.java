package com.crewcheck.watch;

import android.content.Context;
import android.os.Bundle;
import android.os.Looper;
import com.google.android.gms.wearable.MessageEvent;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Before;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowSystemClock;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.lang.reflect.Field;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import static org.junit.Assert.*;

/** Actual DataLayer message handler, encrypted save/load, SharedPreferences listener,
 * Activity resume/pause, posted minute tick and ambient callbacks. Android Keystore
 * key lookup alone uses a fixed TEST key; no device transport/pairing claim. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@LooperMode(LooperMode.Mode.LEGACY)
@Config(sdk=35, instrumentedPackages={"com.crewcheck.watch"}, qualifiers="w192dp-h192dp-round-mdpi", shadows={
        WatchTextLayoutTest.NoDeviceAmbient.class, WatchCacheLifecycleTest.TestKey.class})
public class WatchCacheLifecycleTest {
    @Before public void alignSyntheticWallClock() {
        ShadowSystemClock.setNanoTime(1_700_000_000_000L * 1_000_000L);
    }
    @Implements(value=SecureSnapshotStore.class, isInAndroidSdk=false)
    public static class TestKey {
        @Implementation protected SecretKey getOrCreateKey() {
            return new SecretKeySpec(new byte[32], "AES");
        }
    }
    private static String payload(String gate, long validUntil) throws Exception {
        long now=ShadowSystemClock.currentTimeMillis();
        JSONObject json=WatchContextSnapshot.demo(now).toJson();
        return json.put("state","REPORTING").put("presentationTime","18:20").put("primaryTime","18:20").put("gate",gate)
                .put("validUntilEpochMs",validUntil).toString();
    }
    private static void deliver(CrewCheckDataLayerService service, String json) {
        service.onMessageReceived(new MessageEvent() {
            public int getRequestId(){return 1;}
            public String getPath(){return WatchContract.SNAPSHOT_PATH;}
            public byte[] getData(){return json.getBytes(StandardCharsets.UTF_8);}
            public String getSourceNodeId(){return "synthetic-phone";}
        });
    }
    private static String text(View view) {
        if(view instanceof TextView)return ((TextView)view).getText().toString();
        String out="";
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)out+=text(((ViewGroup)view).getChildAt(i));
        return out;
    }
    private static View content(MainActivity activity) throws Exception {
        Field field=MainActivity.class.getDeclaredField("content");field.setAccessible(true);return (View)field.get(activity);
    }
    private static void settle(){Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(250));}

    @Test public void dataLayerUpdatesOpenActivityPauseStopsListenerAndMinuteTickExpiresFacts() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        context.getSharedPreferences("crewcheck_watch_secure",Context.MODE_PRIVATE).edit().clear().commit();
        WatchNotificationCenter.setEnabled(context,false);
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try(ActivityController<MainActivity> activity=Robolectric.buildActivity(MainActivity.class).create().start().resume()) {
            MainActivity screen=activity.get();
            long expiry=ShadowSystemClock.currentTimeMillis()+90_000L;
            deliver(service.get(),payload("B123",expiry));settle();
            assertTrue("DataLayer → encrypted cache → listener redraw",text(content(screen)).contains("B123"));
            String encrypted=context.getSharedPreferences("crewcheck_watch_secure",Context.MODE_PRIVATE).getString("snapshot_payload_v1","");
            assertFalse("actual store writes encrypted bytes",encrypted.contains("B123"));assertFalse(encrypted.isEmpty());
            activity.pause();
            deliver(service.get(),payload("C234",expiry));settle();
            assertFalse("paused Activity has no cache listener",text(content(screen)).contains("C234"));
            activity.resume();settle();
            assertTrue("resume loads newest cache",text(content(screen)).contains("C234"));
            // Handler scheduling and wall clock are independent in Robolectric4.14.
            // Advance the app's synthetic wall clock before running the posted tick.
            ShadowSystemClock.setNanoTime((expiry + 1L) * 1_000_000L);
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(3));
            assertTrue(ShadowSystemClock.currentTimeMillis()>expiry);
            assertTrue(text(content(screen)).contains("Dados vencidos"));
            assertFalse("automatic minute tick hides expired gate",text(content(screen)).contains("C234"));
        } finally { service.destroy(); }
    }
    @Test public void ambientCallbackAndCacheListenerUpdateThenExpireWithoutForegroundTick() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        context.getSharedPreferences("crewcheck_watch_secure",Context.MODE_PRIVATE).edit().clear().commit();
        WatchNotificationCenter.setEnabled(context,false);
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try(ActivityController<MainActivity> activity=Robolectric.buildActivity(MainActivity.class).create().start().resume()) {
            MainActivity screen=activity.get();long expiry=ShadowSystemClock.currentTimeMillis()+90_000L;
            screen.getAmbientCallback().onEnterAmbient(new Bundle());
            String beforeDelivery = text(content(screen));
            assertTrue(beforeDelivery.contains("CrewCheck"));
            String firstPayload = payload("B123",expiry);
            WatchContextSnapshot first = WatchContextSnapshot.fromJson(firstPayload);
            String firstVisible = "APZ " + first.presentationTime;
            assertFalse("empty AOD must not already contain the expected operation",beforeDelivery.contains(firstVisible));
            deliver(service.get(),firstPayload);settle();
            assertTrue("ambient listener records current cache",new SecureSnapshotStore(context).load().gate.equals("B123"));
            assertTrue("DataLayer delivery must change the visible AOD",text(content(screen)).contains(firstVisible));
            assertNotEquals(beforeDelivery,text(content(screen)));
            String secondPayload = new JSONObject(payload("C234",expiry))
                    .put("presentationTime","19:42").put("primaryTime","19:42").toString();
            WatchContextSnapshot second = WatchContextSnapshot.fromJson(secondPayload);
            String secondVisible = "APZ " + second.presentationTime;
            deliver(service.get(),secondPayload);settle();
            String liveText = text(content(screen));
            assertTrue("second DataLayer delivery must replace visible operation",liveText.contains(secondVisible));
            assertFalse("old APZ must disappear after replacement",liveText.contains(firstVisible));
            assertEquals("C234",new SecureSnapshotStore(context).load().gate);
            // Handler scheduling and wall clock are independent in Robolectric4.14.
            // Advance the app's synthetic wall clock before running the posted tick.
            ShadowSystemClock.setNanoTime((expiry + 1L) * 1_000_000L);
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(3));
            screen.getAmbientCallback().onUpdateAmbient();
            assertFalse(text(content(screen)).contains("18:20"));
            assertFalse(text(content(screen)).contains("B123"));
            assertTrue(text(content(screen)).contains("CrewCheck"));
            assertFalse("the APZ actually displayed before expiry must disappear",text(content(screen)).contains(secondVisible));
            assertFalse(text(content(screen)).contains(second.presentationTime));
            assertFalse(text(content(screen)).contains("C234"));
            assertNotEquals("expiry must visibly change the live AOD",liveText,text(content(screen)));
        } finally { service.destroy(); }
    }
}
