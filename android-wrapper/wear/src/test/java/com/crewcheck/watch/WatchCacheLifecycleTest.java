package com.crewcheck.watch;

import android.content.Context;
import android.os.Bundle;
import android.os.Looper;
import com.google.android.gms.wearable.MessageEvent;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
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
@Config(sdk=35, qualifiers="w192dp-h192dp-round-mdpi", shadows={
        WatchTextLayoutTest.NoDeviceAmbient.class, WatchCacheLifecycleTest.TestKey.class})
public class WatchCacheLifecycleTest {
    @Implements(value=SecureSnapshotStore.class, isInAndroidSdk=false)
    public static class TestKey {
        @Implementation protected SecretKey getOrCreateKey() {
            return new SecretKeySpec(new byte[32], "AES");
        }
    }
    private static String payload(String gate, long validUntil) throws Exception {
        long now=System.currentTimeMillis();
        JSONObject json=WatchContextSnapshot.demo(now).toJson();
        return json.put("state","REPORTING").put("gate",gate)
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
            long expiry=System.currentTimeMillis()+90_000L;
            deliver(service.get(),payload("B123",expiry));settle();
            assertTrue("DataLayer → encrypted cache → listener redraw",text(content(screen)).contains("B123"));
            String encrypted=context.getSharedPreferences("crewcheck_watch_secure",Context.MODE_PRIVATE).getString("snapshot_payload_v1","");
            assertFalse("actual store writes encrypted bytes",encrypted.contains("B123"));assertFalse(encrypted.isEmpty());
            activity.pause();
            deliver(service.get(),payload("C234",expiry));settle();
            assertFalse("paused Activity has no cache listener",text(content(screen)).contains("C234"));
            activity.resume();settle();
            assertTrue("resume loads newest cache",text(content(screen)).contains("C234"));
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(3));
            assertTrue(System.currentTimeMillis()>expiry);
            assertTrue(text(content(screen)).contains("Snapshot vencido"));
            assertFalse("automatic minute tick hides expired gate",text(content(screen)).contains("C234"));
        } finally { service.destroy(); }
    }
    @Test public void ambientCallbackAndCacheListenerUpdateThenExpireWithoutForegroundTick() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        context.getSharedPreferences("crewcheck_watch_secure",Context.MODE_PRIVATE).edit().clear().commit();
        WatchNotificationCenter.setEnabled(context,false);
        ServiceController<CrewCheckDataLayerService> service=Robolectric.buildService(CrewCheckDataLayerService.class).create();
        try(ActivityController<MainActivity> activity=Robolectric.buildActivity(MainActivity.class).create().start().resume()) {
            MainActivity screen=activity.get();long expiry=System.currentTimeMillis()+90_000L;
            screen.getAmbientCallback().onEnterAmbient(new Bundle());
            deliver(service.get(),payload("B123",expiry));settle();
            assertTrue("ambient listener records current cache",new SecureSnapshotStore(context).load().gate.equals("B123"));
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(3));
            screen.getAmbientCallback().onUpdateAmbient();
            assertFalse(text(content(screen)).contains("18:20"));
            assertFalse(text(content(screen)).contains("B123"));
            assertTrue(text(content(screen)).contains("CrewCheck"));
        } finally { service.destroy(); }
    }
}
