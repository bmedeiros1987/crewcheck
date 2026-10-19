package com.crewcheck.app;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.*;
import com.crewcheck.watch.CrewLifeLoopTestPeer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowContentResolver;
import org.robolectric.shadows.ShadowLooper;
import org.robolectric.util.ReflectionHelpers;

/** Real Android broadcasts + actual registered Activity receiver + paused real main Looper.
 * Only GMS transport, source provider and receiver disk are synthetic; no device/API access.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE, shadows = CrewLifeAckContinuationTest.FakeWearable.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class CrewLifeAckContinuationTest {
    private MainActivity activity;
    private CrewCheckWatchSyncService service;
    private CrewLifeLoopTestPeer peer;
    private final List<Runnable> heldAcks = new ArrayList<>();
    private final List<String> cleanupAcks = new ArrayList<>();
    private boolean holdAcks;
    private int snapshots, controls;
    private static NodeClient nodeClient;
    private static CapabilityClient capabilityClient;
    private static DataClient dataClient;
    private static MessageClient messageClient;

    @Implements(value = Wearable.class, isInAndroidSdk = false)
    public static class FakeWearable {
        @Implementation public static NodeClient getNodeClient(Context c) { return nodeClient; }
        @Implementation public static CapabilityClient getCapabilityClient(Context c) { return capabilityClient; }
        @Implementation public static DataClient getDataClient(Context c) { return dataClient; }
        @Implementation public static MessageClient getMessageClient(Context c) { return messageClient; }
    }
    public static class PostingWebView extends WebView {
        PostingWebView(Context context) { super(context); }
        @Override public boolean postDelayed(Runnable action, long delay) {
            return new Handler(Looper.getMainLooper()).postDelayed(action, delay);
        }
    }
    public static class SyntheticProvider extends ContentProvider {
        static int refreshes, reads;
        static String summary() throws Exception {
            long now = System.currentTimeMillis();
            String day = Instant.ofEpochMilli(now).atZone(ZoneOffset.UTC).toLocalDate().toString();
            return new JSONObject().put("automatic", true).put("generatedAtEpochMs", now)
                    .put("sourceZoneId", "UTC").put("day", day).put("energyDate", day)
                    .put("energyZoneId", "UTC").put("energyScore", 0).put("steps", 51).toString();
        }
        @Override public boolean onCreate() { return true; }
        @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) {
            reads++;
            try { MatrixCursor c = new MatrixCursor(new String[]{"json"}); c.addRow(new Object[]{summary()}); return c; }
            catch (Exception e) { throw new IllegalStateException(e); }
        }
        @Override public Bundle call(String method, String arg, Bundle extras) {
            if ("refresh".equals(method)) refreshes++;
            return new Bundle();
        }
        @Override public String getType(Uri u) { return "application/json"; }
        @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException(); }
        @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException(); }
        @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
    }
    @Before public void setup() throws Exception {
        ReflectionHelpers.setStaticField(CrewLifeV2Phone.class, "diskFailed", false);
        ReflectionHelpers.setStaticField(CrewLifeV2Phone.class, "retryScheduled", false);
        ReflectionHelpers.setStaticField(CrewLifeV2Phone.class, "retries", 0);
        activity = Robolectric.buildActivity(MainActivity.class).get(); // no onCreate/network/navigation
        Context app = activity.getApplicationContext();
        app.getSharedPreferences("crewcheck_crewlife_v2_protocol", 0).edit().clear().commit();
        app.getSharedPreferences("crewcheck_watch_health_consent", 0).edit().clear().commit();
        ReflectionHelpers.setField(activity, "webView", new PostingWebView(activity));
        ReflectionHelpers.setField(activity, "companionAccountHint", "synthetic-owner");
        SyntheticProvider.refreshes = SyntheticProvider.reads = 0;
        SyntheticProvider provider = new SyntheticProvider();
        ProviderInfo info = new ProviderInfo(); info.authority = "com.crewcheck.life.summary";
        provider.attachInfo(app, info);
        ShadowContentResolver.registerProviderInternal(info.authority, provider);
        peer = new CrewLifeLoopTestPeer();
        service = new CrewCheckWatchSyncService();
        ReflectionHelpers.setField(service, "mBase", app);
        nodeClient = mock(NodeClient.class); capabilityClient = mock(CapabilityClient.class);
        dataClient = mock(DataClient.class); messageClient = mock(MessageClient.class);
        Node node = mock(Node.class); when(node.getId()).thenReturn("watchA");
        CapabilityInfo capability = mock(CapabilityInfo.class); when(capability.getNodes()).thenReturn(Set.of(node));
        when(nodeClient.getConnectedNodes()).thenAnswer(i -> Tasks.forResult(List.of(node)));
        when(capabilityClient.getCapability(anyString(), anyInt())).thenAnswer(i -> Tasks.forResult(capability));
        when(dataClient.deleteDataItems(any(Uri.class))).thenAnswer(i -> Tasks.forResult(1));
        when(dataClient.putDataItem(any(PutDataRequest.class))).thenAnswer(i -> {
            PutDataRequest request = i.getArgument(0);
            String raw = DataMap.fromByteArray(request.getData()).getString("crewLifeJson");
            if (raw != null) {
                if ("snapshot".equals(new JSONObject(raw).optString("kind"))) snapshots++;
                peer.data(raw, System.currentTimeMillis());
            }
            return Tasks.forResult(mock(DataItem.class));
        });
        when(messageClient.sendMessage(anyString(), anyString(), any(byte[].class))).thenAnswer(i -> {
            controls++;
            String ack = peer.control(new String((byte[]) i.getArgument(2), StandardCharsets.UTF_8));
            if (ack != null) {
                if (new JSONObject(ack).has("status")) cleanupAcks.add(ack);
                Runnable delivery = () -> deliverAck(ack);
                if (holdAcks) heldAcks.add(delivery); else new Handler(Looper.getMainLooper()).post(delivery);
            }
            return Tasks.forResult(1);
        });
        WatchHealthConsent.grant(app, "1.0", Set.of("recovery", "sleep", "activity"));
        ReflectionHelpers.callInstanceMethod(activity, "registerWatchSyncRequestReceiver");
    }
    private void deliverAck(String raw) {
        MessageEvent e = mock(MessageEvent.class);
        when(e.getPath()).thenReturn(CrewLifeV2Protocol.ACK_PATH);
        when(e.getSourceNodeId()).thenReturn("watchA");
        when(e.getData()).thenReturn(raw.getBytes(StandardCharsets.UTF_8));
        service.onMessageReceived(e);
    }
    private boolean joinIo() throws Exception {
        boolean seen = false;
        for (Thread t : Thread.getAllStackTraces().keySet()) if (t.getName().equals("crewlife-companion-sync") && t.isAlive()) {
            seen = true; t.join(2000); assertFalse("native source thread must terminate", t.isAlive());
        }
        return seen;
    }
    private void drainUntilIdle() throws Exception {
        ShadowLooper main = Shadows.shadowOf(Looper.getMainLooper());
        for (int round = 0; round < 120; round++) {
            main.idle(); boolean io = joinIo(); main.idle();
            Duration next = main.getNextScheduledTaskTime();
            if (next.equals(Duration.ZERO) && !joinIo()) return;
            if (!next.equals(Duration.ZERO)) main.runToNextTask();
        }
        fail("queue self-sustains: snapshots=" + snapshots + " providerRefresh=" + SyntheticProvider.refreshes
                + " controls=" + controls + " next=" + Shadows.shadowOf(Looper.getMainLooper()).getNextScheduledTaskTime());
    }
    private void externalRequest() { activity.sendBroadcast(new Intent(MainActivity.ACTION_WATCH_SYNC_REQUEST).setPackage(activity.getPackageName())); }
    private void assertIdleAndStable() throws Exception {
        int before = snapshots, refresh = SyntheticProvider.refreshes, query = SyntheticProvider.reads;
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(30)); drainUntilIdle();
        assertEquals(before, snapshots); assertEquals(refresh, SyntheticProvider.refreshes); assertEquals(query, SyntheticProvider.reads);
        assertEquals(Duration.ZERO, Shadows.shadowOf(Looper.getMainLooper()).getNextScheduledTaskTime());
        System.out.println("ACK_QUEUE_IDLE snapshots=" + snapshots + " providerRefresh=" + SyntheticProvider.refreshes
                + " queries=" + SyntheticProvider.reads + " controls=" + controls + " next=PT0S");
    }
    private void releaseAcksReversed() throws Exception {
        for (int i = 0; i < 10; i++) {
            List<Runnable> batch = new ArrayList<>(heldAcks); heldAcks.clear();
            Collections.reverse(batch); for (Runnable r : batch) r.run();
            drainUntilIdle(); if (heldAcks.isEmpty()) return;
        }
        fail("ACK handling did not settle");
    }
    @Test public void externalRequestEndsWithoutSelfSustainingAckRefresh() throws Exception {
        externalRequest(); drainUntilIdle();
        assertEquals("only original external event refreshes provider", 1, SyntheticProvider.refreshes);
        assertTrue("bounded original cached+settled phases", snapshots > 0 && snapshots <= 2);
        assertEquals(Integer.valueOf(0), peer.value("recoveryScore", System.currentTimeMillis()));
        assertIdleAndStable();
    }
    @Test public void proofAckWithoutOriginalWorkDoesNotStartReads() throws Exception {
        JSONObject source = com.crewcheck.health.CompanionFreshness.filter(new JSONObject(SyntheticProvider.summary()), System.currentTimeMillis());
        CrewLifeWatchPublisher.publishCrewLife(activity, CrewLifeV2Protocol.project(source).toString(), null);
        drainUntilIdle(); assertEquals(0, snapshots); assertEquals(0, SyntheticProvider.reads); assertEquals(0, SyntheticProvider.refreshes);
        assertIdleAndStable();
    }
    @Test public void duplicateAndReorderedAcksCannotCreateWork() throws Exception {
        holdAcks = true; externalRequest(); drainUntilIdle(); assertEquals(0, snapshots);
        releaseAcksReversed(); holdAcks = false;
        for (String ack : new ArrayList<>(cleanupAcks)) { deliverAck(ack); deliverAck(ack); }
        drainUntilIdle(); assertEquals(1, SyntheticProvider.refreshes); assertTrue(snapshots <= 2); assertIdleAndStable();
    }
    @Test public void logoutDropsContinuationAndQueuedOldAcks() throws Exception {
        holdAcks = true; externalRequest(); drainUntilIdle();
        ReflectionHelpers.callInstanceMethod(activity, "invalidateCompanionOnAccountChange", ReflectionHelpers.ClassParameter.from(String.class, ""));
        releaseAcksReversed(); holdAcks = false; drainUntilIdle();
        assertEquals(0, snapshots); assertEquals(1, SyntheticProvider.refreshes); assertIdleAndStable();
    }
    @Test public void explicitRetryDoesNotInventAnExternalProviderRefresh() throws Exception {
        externalRequest(); drainUntilIdle(); int before = snapshots;
        CrewLifeV2Phone.retry(activity); drainUntilIdle();
        assertEquals(before, snapshots); assertEquals(1, SyntheticProvider.refreshes); assertIdleAndStable();
    }
    @Test public void renderedWebProjectionCannotRestartNativeRead() throws Exception {
        assertFalse(activity.new CrewCheckNativeBridge().publishWatchCrewLife("{\"schemaVersion\":1,\"steps\":51}"));
        drainUntilIdle(); assertEquals(0, snapshots); assertEquals(0, SyntheticProvider.reads); assertEquals(0, SyntheticProvider.refreshes);
        assertIdleAndStable();
    }
    @Test public void destroyedActivityCannotResumeFromQueuedAcksOrDelay() throws Exception {
        holdAcks = true; externalRequest(); Shadows.shadowOf(Looper.getMainLooper()).idle(); joinIo();
        ReflectionHelpers.callInstanceMethod(activity, "unregisterWatchSyncRequestReceiver");
        releaseAcksReversed(); holdAcks = false; drainUntilIdle();
        assertEquals(0, snapshots); assertIdleAndStable();
    }
}
