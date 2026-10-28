package com.crewcheck.watch;

import android.app.NotificationManager;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Context;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** Cloud fetch with a fake transport: credential at rest, ETag, pairing generation checked
 * after the network (A→B and logout in flight, 200 and 401), account-bound cache and
 * notifications, temporal limits, battery-aware job. No network, device or account. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, instrumentedPackages = {"com.crewcheck.watch"},
        shadows = {WatchCacheLifecycleTest.TestKey.class, WatchCloudSyncTest.TestCloudKey.class})
public class WatchCloudSyncTest {
    @Implements(WatchCloudCredentialStore.class)
    public static class TestCloudKey {
        @Implementation protected SecretKey key() { return new SecretKeySpec(new byte[32], "AES"); }
    }

    static final String A = "cw1." + "a".repeat(32) + "." + "C".repeat(43);
    static final String A2 = "cw1." + "a".repeat(32) + "." + "D".repeat(43);
    static final String B = "cw1." + "b".repeat(32) + "." + "E".repeat(43);
    static final long NOW = 1_900_000_000_000L;
    final List<String[]> requests = new ArrayList<>();
    WatchCloudClient.Response next;
    Runnable duringRequest;
    Context context;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        WatchCloudClient.forgetPairing(context);
        WatchNotificationCenter.setEnabled(context, true);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        duringRequest = null;
        WatchCloudClient.transport = (url, authorization, etag) -> {
            requests.add(new String[]{url, authorization, etag});
            if (duringRequest != null) duringRequest.run();
            if (next == null) throw new java.io.IOException("offline");
            return next;
        };
    }

    @After public void restore() {
        WatchCloudSyncJob.cancel(context);
    }

    static JSONObject snapshot(long generatedAt, String gate) throws Exception {
        // The server stamps the pairing's account on every cloud roster; gates starting with
        // "B" are account B's in these tests, the rest account A's.
        return WatchContextSnapshot.demo(generatedAt).toJson()
                .put("gate", gate).put("state", "CHANGED").put("changed", true)
                .put("account", gate.startsWith("B-") ? "b".repeat(32) : "a".repeat(32))
                .put("validUntilEpochMs", generatedAt + 3_600_000L);
    }

    static String body(JSONObject snapshot) throws Exception {
        return new JSONObject().put("ok", true).put("snapshot", snapshot).toString();
    }

    static String body(long generatedAt, String gate) throws Exception {
        return body(snapshot(generatedAt, gate));
    }

    JobInfo periodic() {
        return context.getSystemService(JobScheduler.class).getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID);
    }

    int notifications() {
        return Shadows.shadowOf(context.getSystemService(NotificationManager.class)).getAllNotifications().size();
    }

    void saveLocal(long generatedAt, String gate) throws Exception {
        new SecureSnapshotStore(context).save(snapshot(generatedAt, gate).toString());
    }

    @Test public void credentialIsValidatedAndEncryptedAtRest() {
        WatchCloudCredentialStore store = new WatchCloudCredentialStore(context);
        for (String bad : new String[]{null, "", "cw1.x.y", A + "x", "cw2." + "a".repeat(32) + "." + "C".repeat(43)}) {
            assertEquals(bad, WatchCloudCredentialStore.SaveResult.REJECTED, store.save(bad));
        }
        long before = store.generation();
        assertEquals(WatchCloudCredentialStore.SaveResult.SAME_ACCOUNT, store.save(A));
        assertEquals(A, store.load());
        assertEquals(before + 1, store.generation());
        String raw = context.getSharedPreferences("crewcheck_watch_cloud", Context.MODE_PRIVATE).getAll().toString();
        assertFalse("credential never stored in clear", raw.contains("C".repeat(43)));
        store.clear();
        assertNull(store.load());
        assertEquals("generation never goes back, even after clear", before + 2, store.generation());
    }

    @Test public void withoutCredentialNothingLeavesTheWatch() {
        assertEquals(WatchCloudClient.Result.NOT_PAIRED_HERE, WatchCloudClient.fetch(context, NOW));
        assertTrue(requests.isEmpty());
    }

    @Test public void downloadsWithEtagAndNeverReplacesNewerData() throws Exception {
        assertTrue(WatchCloudClient.acceptCredential(context, A));
        next = new WatchCloudClient.Response(200, "\"e1\"", body(NOW - 60_000, "B12"));
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, NOW));
        assertEquals("https://crewcheck.online/api/watch/cloud/snapshot", requests.get(0)[0]);
        assertEquals("Bearer " + A, requests.get(0)[1]);
        assertNull(requests.get(0)[2]);
        assertEquals("B12", new SecureSnapshotStore(context).load().gate);

        next = new WatchCloudClient.Response(304, "\"e1\"", null);
        assertEquals(WatchCloudClient.Result.UNCHANGED, WatchCloudClient.fetch(context, NOW));
        assertEquals("\"e1\"", requests.get(1)[2]);

        // Bluetooth delivered something newer for the same account: an older cloud copy is ignored.
        saveLocal(NOW, "C7");
        next = new WatchCloudClient.Response(200, "\"e2\"", body(NOW - 30_000, "B12"));
        assertEquals(WatchCloudClient.Result.UNCHANGED, WatchCloudClient.fetch(context, NOW));
        assertEquals("C7", new SecureSnapshotStore(context).load().gate);

        next = new WatchCloudClient.Response(204, null, null);
        assertEquals(WatchCloudClient.Result.EMPTY, WatchCloudClient.fetch(context, NOW));
        assertEquals("C7", new SecureSnapshotStore(context).load().gate);
    }

    @Test public void temporalLimitsRejectFutureGenerationAndExcessiveValidity() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        JSONObject future = snapshot(NOW + WatchCloudClient.MAX_CLOCK_SKEW_MS + 1, "F1");
        JSONObject year = snapshot(NOW - 1000, "Y1").put("validUntilEpochMs", NOW - 1000 + 365L * 24 * 3_600_000L);
        JSONObject overSix = snapshot(NOW - 1000, "S7").put("validUntilEpochMs", NOW - 1000 + WatchCloudClient.MAX_VALIDITY_MS + 1);
        for (JSONObject bad : new JSONObject[]{future, year, overSix}) {
            next = new WatchCloudClient.Response(200, "\"bad\"", body(bad));
            assertEquals(bad.optString("gate"), WatchCloudClient.Result.REJECTED, WatchCloudClient.fetch(context, NOW));
            assertNull(new SecureSnapshotStore(context).load());
            assertNull("a rejected body never becomes the ETag", new WatchCloudCredentialStore(context).etag());
        }
        JSONObject edge = snapshot(NOW + WatchCloudClient.MAX_CLOCK_SKEW_MS, "OK").put("validUntilEpochMs", NOW + WatchCloudClient.MAX_CLOCK_SKEW_MS + WatchCloudClient.MAX_VALIDITY_MS);
        next = new WatchCloudClient.Response(200, "\"ok\"", body(edge));
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, NOW));
    }

    @Test public void failuresKeepCredentialAndRoster() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        saveLocal(NOW, "B12");
        for (WatchCloudClient.Response response : new WatchCloudClient.Response[]{
                null, new WatchCloudClient.Response(503, null, null), new WatchCloudClient.Response(429, null, null),
                new WatchCloudClient.Response(200, null, "not json"), new WatchCloudClient.Response(200, null, "{\"ok\":true}")}) {
            next = response;
            assertEquals(WatchCloudClient.Result.FAILED, WatchCloudClient.fetch(context, NOW));
            assertEquals(A, new WatchCloudCredentialStore(context).load());
            assertEquals("B12", new SecureSnapshotStore(context).load().gate);
            assertNotNull(periodic());
        }
    }

    @Test public void pairingWithBDuringRequestDiscardsA200() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        duringRequest = () -> WatchCloudClient.acceptCredential(context, B);
        next = new WatchCloudClient.Response(200, "\"a\"", body(NOW, "A-GATE"));
        assertEquals(WatchCloudClient.Result.STALE, WatchCloudClient.fetch(context, NOW));
        assertNull("A's projection never lands after B paired", new SecureSnapshotStore(context).load());
        assertNull("nor its ETag", new WatchCloudCredentialStore(context).etag());
        assertEquals(0, notifications());
        assertEquals(B, new WatchCloudCredentialStore(context).load());
        assertNotNull(periodic());
    }

    @Test public void pairingWithBDuringRequestIgnoresA401() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        duringRequest = () -> {
            try {
                WatchCloudClient.acceptCredential(context, B);
                saveLocal(NOW, "B-GATE"); // B's roster arrives by Bluetooth meanwhile
            } catch (Exception error) { throw new RuntimeException(error); }
        };
        next = new WatchCloudClient.Response(401, null, null);
        assertEquals(WatchCloudClient.Result.STALE, WatchCloudClient.fetch(context, NOW));
        assertEquals("A's late 401 does not unpair B", B, new WatchCloudCredentialStore(context).load());
        assertEquals("B-GATE", new SecureSnapshotStore(context).load().gate);
        assertNotNull("B's job survives", periodic());
    }

    @Test public void logoutDuringRequestDiscardsTheResponse() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        duringRequest = () -> WatchCloudClient.forgetPairing(context);
        next = new WatchCloudClient.Response(200, "\"a\"", body(NOW, "A-GATE"));
        assertEquals(WatchCloudClient.Result.STALE, WatchCloudClient.fetch(context, NOW));
        assertNull(new SecureSnapshotStore(context).load());
        assertNull(new WatchCloudCredentialStore(context).load());
        assertEquals(0, notifications());
        assertNull(periodic());
    }

    @Test public void accountChangeClearsRosterAndNotificationsOfThePreviousAccount() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        next = new WatchCloudClient.Response(200, "\"a\"", body(NOW, "A-GATE"));
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, NOW));
        assertEquals(1, notifications());

        // Same account, new secret (re-pair): its roster stays.
        WatchCloudClient.acceptCredential(context, A2);
        assertEquals("A-GATE", new SecureSnapshotStore(context).load().gate);

        // Another account: A's roster and notice go before anything of B is fetched.
        WatchCloudClient.acceptCredential(context, B);
        assertNull(new SecureSnapshotStore(context).load());
        assertEquals(0, notifications());
        // B's projection is accepted even though it is older than A's was.
        next = new WatchCloudClient.Response(200, "\"b\"", body(NOW - 600_000, "B-GATE"));
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, NOW));
        assertEquals("B-GATE", new SecureSnapshotStore(context).load().gate);
    }

    @Test public void unpairedOrLogoutForgetsCredentialRosterNotificationsAndJob() throws Exception {
        WatchCloudClient.acceptCredential(context, A);
        JobInfo job = periodic();
        assertNotNull("pairing schedules the periodic fetch", job);
        assertTrue(job.isPeriodic());
        assertEquals(60 * 60_000L, job.getIntervalMillis());
        assertEquals(JobInfo.NETWORK_TYPE_ANY, job.getNetworkType());
        assertTrue("waits for a battery that is not low", job.isRequireBatteryNotLow());

        next = new WatchCloudClient.Response(200, "\"a\"", body(NOW, "A-GATE"));
        WatchCloudClient.fetch(context, NOW);
        assertEquals(1, notifications());
        next = new WatchCloudClient.Response(401, null, null);
        assertEquals(WatchCloudClient.Result.UNPAIRED, WatchCloudClient.fetch(context, NOW));
        assertNull(new WatchCloudCredentialStore(context).load());
        assertNull(new SecureSnapshotStore(context).load());
        assertEquals(0, notifications());
        assertNull(periodic());

        // Phone logout (Data Layer item deleted) has the same effect.
        WatchCloudClient.acceptCredential(context, A);
        saveLocal(NOW, "A-GATE");
        WatchCloudClient.forgetPairing(context);
        assertNull(new WatchCloudCredentialStore(context).load());
        assertNull(new SecureSnapshotStore(context).load());
        assertNull(periodic());
    }

    @Test public void invalidCredentialFromThePhoneSchedulesNothing() {
        assertFalse(WatchCloudClient.acceptCredential(context, "cw1.bad"));
        assertNull(periodic());
    }
}
