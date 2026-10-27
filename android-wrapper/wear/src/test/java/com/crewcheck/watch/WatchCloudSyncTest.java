package com.crewcheck.watch;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Context;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** Cloud fetch with a fake transport: credential at rest, ETag, never older over newer,
 * 401 forgets credential and roster, failures keep both, battery-aware job. No network. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, instrumentedPackages = {"com.crewcheck.watch"},
        shadows = {WatchCacheLifecycleTest.TestKey.class, WatchCloudSyncTest.TestCloudKey.class})
public class WatchCloudSyncTest {
    @Implements(WatchCloudCredentialStore.class)
    public static class TestCloudKey {
        @Implementation protected SecretKey key() { return new SecretKeySpec(new byte[32], "AES"); }
    }

    static final String CREDENTIAL = "cw1." + "a".repeat(32) + "." + "C".repeat(43);
    static final long NOW = 1_900_000_000_000L;
    final List<String[]> requests = new ArrayList<>();
    WatchCloudClient.Response next;
    Context context;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        new WatchCloudCredentialStore(context).clear();
        new SecureSnapshotStore(context).clear();
        WatchCloudClient.transport = (url, authorization, etag) -> {
            requests.add(new String[]{url, authorization, etag});
            if (next == null) throw new java.io.IOException("offline");
            return next;
        };
    }

    @After public void restore() {
        WatchCloudSyncJob.cancel(context);
    }

    static String body(long generatedAt, String gate) throws Exception {
        JSONObject snapshot = WatchContextSnapshot.demo(generatedAt).toJson()
                .put("gate", gate).put("validUntilEpochMs", generatedAt + 3_600_000L);
        return new JSONObject().put("ok", true).put("snapshot", snapshot).toString();
    }

    @Test public void credentialIsValidatedAndEncryptedAtRest() {
        WatchCloudCredentialStore store = new WatchCloudCredentialStore(context);
        for (String bad : new String[]{null, "", "cw1.x.y", CREDENTIAL + "x", "cw2." + "a".repeat(32) + "." + "C".repeat(43)}) {
            assertFalse(bad, store.save(bad));
        }
        assertTrue(store.save(CREDENTIAL));
        assertEquals(CREDENTIAL, store.load());
        String raw = context.getSharedPreferences("crewcheck_watch_cloud", Context.MODE_PRIVATE).getAll().toString();
        assertFalse("credential never stored in clear", raw.contains("C".repeat(43)));
    }

    @Test public void withoutCredentialNothingLeavesTheWatch() {
        assertEquals(WatchCloudClient.Result.NOT_PAIRED_HERE, WatchCloudClient.fetch(context, NOW));
        assertTrue(requests.isEmpty());
    }

    @Test public void downloadsWithEtagAndNeverReplacesNewerData() throws Exception {
        new WatchCloudCredentialStore(context).save(CREDENTIAL);
        next = new WatchCloudClient.Response(200, "\"e1\"", body(NOW - 60_000, "B12"));
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, NOW));
        assertEquals(WatchCloudClient.SNAPSHOT_URL, requests.get(0)[0]);
        assertEquals("https://crewcheck.online/api/watch/cloud/snapshot", requests.get(0)[0]);
        assertEquals("Bearer " + CREDENTIAL, requests.get(0)[1]);
        assertNull(requests.get(0)[2]);
        assertEquals("B12", new SecureSnapshotStore(context).load().gate);

        next = new WatchCloudClient.Response(304, "\"e1\"", null);
        assertEquals(WatchCloudClient.Result.UNCHANGED, WatchCloudClient.fetch(context, NOW));
        assertEquals("\"e1\"", requests.get(1)[2]);

        // Bluetooth delivered something newer meanwhile: an older cloud copy is ignored.
        new SecureSnapshotStore(context).save(new JSONObject(body(NOW, "C7")).getJSONObject("snapshot").toString());
        next = new WatchCloudClient.Response(200, "\"e2\"", body(NOW - 30_000, "B12"));
        assertEquals(WatchCloudClient.Result.UNCHANGED, WatchCloudClient.fetch(context, NOW));
        assertEquals("C7", new SecureSnapshotStore(context).load().gate);

        next = new WatchCloudClient.Response(204, null, null);
        assertEquals(WatchCloudClient.Result.EMPTY, WatchCloudClient.fetch(context, NOW));
        assertEquals("C7", new SecureSnapshotStore(context).load().gate);
    }

    @Test public void failuresKeepCredentialAndRoster() throws Exception {
        new WatchCloudCredentialStore(context).save(CREDENTIAL);
        new SecureSnapshotStore(context).save(new JSONObject(body(NOW, "B12")).getJSONObject("snapshot").toString());
        for (WatchCloudClient.Response response : new WatchCloudClient.Response[]{
                null, new WatchCloudClient.Response(503, null, null), new WatchCloudClient.Response(429, null, null),
                new WatchCloudClient.Response(200, null, "not json"), new WatchCloudClient.Response(200, null, "{\"ok\":true}")}) {
            next = response;
            assertEquals(WatchCloudClient.Result.FAILED, WatchCloudClient.fetch(context, NOW));
            assertEquals(CREDENTIAL, new WatchCloudCredentialStore(context).load());
            assertEquals("B12", new SecureSnapshotStore(context).load().gate);
        }
    }

    @Test public void unpairedForgetsCredentialRosterAndJob() throws Exception {
        CrewCheckDataLayerService.acceptCloudCredential(context, CREDENTIAL);
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        JobInfo job = scheduler.getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID);
        assertNotNull("pairing schedules the periodic fetch", job);
        assertTrue(job.isPeriodic());
        assertEquals(60 * 60_000L, job.getIntervalMillis());
        assertEquals(JobInfo.NETWORK_TYPE_ANY, job.getNetworkType());
        assertTrue("waits for a battery that is not low", job.isRequireBatteryNotLow());

        new SecureSnapshotStore(context).save(new JSONObject(body(NOW, "B12")).getJSONObject("snapshot").toString());
        next = new WatchCloudClient.Response(401, null, null);
        assertEquals(WatchCloudClient.Result.UNPAIRED, WatchCloudClient.fetch(context, NOW));
        assertNull(new WatchCloudCredentialStore(context).load());
        assertNull("logout on the phone also clears the roster on the watch", new SecureSnapshotStore(context).load());
        assertNull(scheduler.getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID));
    }

    @Test public void invalidCredentialFromThePhoneSchedulesNothing() {
        CrewCheckDataLayerService.acceptCloudCredential(context, "cw1.bad");
        assertNull(context.getSystemService(JobScheduler.class).getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID));
    }
}
