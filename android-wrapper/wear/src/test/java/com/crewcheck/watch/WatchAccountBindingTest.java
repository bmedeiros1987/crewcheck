package com.crewcheck.watch;

import android.app.NotificationManager;
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
import static org.junit.Assert.*;

/** Review of cb845fb36 (P1 residual): a former account's roster never comes back on the watch
 * through Bluetooth (message, Data Layer item, Sincronizar re-import) after logout or account
 * change, in either delivery order of credential and roster, nor from a legacy ownerless cache.
 * Cloud sync OFF keeps working. Synthetic accounts and rosters only. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, instrumentedPackages = {"com.crewcheck.watch"},
        shadows = {WatchCacheLifecycleTest.TestKey.class, WatchCloudSyncTest.TestCloudKey.class})
public class WatchAccountBindingTest {
    static final String A = "a".repeat(32), B = "b".repeat(32);
    static final String CRED_A = "cw1." + A + "." + "C".repeat(43), CRED_B = "cw1." + B + "." + "E".repeat(43);
    static final long T = 1_900_000_000_000L;
    Context context;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        WatchNotificationCenter.setEnabled(context, true);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
    }

    final WatchCloudClient.Transport realTransport = WatchCloudClient.transport;
    @After public void restoreTransport() { WatchCloudClient.transport = realTransport; }

    /** A roster that always produces a local notice, so a returning roster would be visible. */
    static String roster(String account, long generatedAt, String gate) throws Exception {
        JSONObject json = WatchContextSnapshot.demo(generatedAt).toJson()
                .put("state", "CHANGED").put("changed", true).put("detail", "Escala " + gate).put("gate", gate)
                .put("validUntilEpochMs", generatedAt + 3_600_000L);
        if (account != null) json.put("account", account);
        return json.toString();
    }

    WatchContextSnapshot cached() { return new SecureSnapshotStore(context).load(); }
    int notices() { return Shadows.shadowOf(context.getSystemService(NotificationManager.class)).getAllNotifications().size(); }
    void cancelNotices() { context.getSystemService(NotificationManager.class).cancelAll(); }

    @Test public void cloudOffBluetoothKeepsWorkingForOneAccount() throws Exception {
        assertNotNull(WatchAccountGuard.intake(context, roster(A, T, "A1")));
        assertEquals("A1", cached().gate);
        assertEquals(1, notices());
        assertNotNull(WatchAccountGuard.intake(context, roster(A, T + 60_000, "A2")));
        assertEquals("A2", cached().gate);
        assertNull("no cloud pairing involved", new WatchCloudCredentialStore(context).load());
    }

    @Test public void syncReimportAppliesTheAccountRuleWithoutNotifying() throws Exception {
        assertNotNull(WatchAccountGuard.intake(context, roster(A, T, "A1"), false));
        assertEquals("A1", cached().gate);
        assertEquals("Sincronizar keeps its old behaviour: no notice", 0, notices());
        WatchAccountGuard.retire(context, A, T + 1_000);
        assertNull(WatchAccountGuard.intake(context, roster(A, T, "A1"), false));
        assertNull(cached());
    }

    @Test public void oldPhoneWithoutAccountStillSyncs() throws Exception {
        assertNotNull(WatchAccountGuard.intake(context, roster(null, T, "L1")));
        assertNotNull(WatchAccountGuard.intake(context, roster(null, T + 1, "L2")));
        assertEquals("L2", cached().gate);
    }

    @Test public void logoutRetiresTheAccountForEveryBluetoothPath() throws Exception {
        WatchCloudClient.acceptCredential(context, CRED_A);
        WatchAccountGuard.intake(context, roster(A, T, "A1"));
        cancelNotices();
        WatchAccountGuard.retire(context, A, T + 1_000); // phone: "A retired at T+1s"
        assertNull("roster of A cleared on logout", cached());
        assertNull("A's cloud pairing goes with it, whatever the Data Layer order", new WatchCloudCredentialStore(context).load());
        assertEquals(0, notices());
        // Residual Data Layer item / Sincronizar re-import / late message of A: refused, no notice.
        assertNull(WatchAccountGuard.intake(context, roster(A, T, "A1")));
        assertNull(WatchAccountGuard.intake(context, roster(A, T + 1_000, "A1b")));
        assertNull(cached());
        assertEquals(0, notices());
        // Ownerless roster after accounts are known (phone invalidation or legacy item): refused.
        assertNull(WatchAccountGuard.intake(context, roster(null, T + 5_000, "L")));
        // A logs in again: a roster generated after the retirement is A again.
        assertNotNull(WatchAccountGuard.intake(context, roster(A, T + 120_000, "A2")));
        assertEquals("A2", cached().gate);
    }

    @Test public void switchToBWithRetirementFirstThenRosterB() throws Exception {
        WatchAccountGuard.intake(context, roster(A, T, "A1"));
        cancelNotices();
        WatchAccountGuard.retire(context, A, T + 1_000);
        WatchCloudClient.acceptCredential(context, CRED_B);
        assertNotNull(WatchAccountGuard.intake(context, roster(B, T + 2_000, "B1")));
        assertNull(WatchAccountGuard.intake(context, roster(A, T, "A1")));
        assertEquals("B1", cached().gate);
        assertEquals(CRED_B, new WatchCloudCredentialStore(context).load());
    }

    @Test public void switchWithRosterBBeforeCredentialB() throws Exception {
        WatchCloudClient.acceptCredential(context, CRED_A);
        WatchAccountGuard.intake(context, roster(A, T, "A1"));
        cancelNotices();
        // Roster B arrives first (no retirement record yet): A's roster, notice and pairing go.
        assertNotNull(WatchAccountGuard.intake(context, roster(B, T + 2_000, "B1")));
        assertEquals("B1", cached().gate);
        assertNull("A's cloud pairing dropped on the switch", new WatchCloudCredentialStore(context).load());
        assertNull(context.getSystemService(JobScheduler.class).getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID));
        // Then the credential B and the late retirement of A: B stays, A never returns.
        WatchCloudClient.acceptCredential(context, CRED_B);
        WatchAccountGuard.retire(context, A, T + 1_000);
        assertEquals("B1", cached().gate);
        assertNull(WatchAccountGuard.intake(context, roster(A, T, "A1")));
        assertEquals("B1", cached().gate);
    }

    @Test public void switchWithCredentialBBeforeRosterB() throws Exception {
        WatchCloudClient.acceptCredential(context, CRED_A);
        WatchAccountGuard.intake(context, roster(A, T, "A1"));
        cancelNotices();
        WatchCloudClient.acceptCredential(context, CRED_B); // credential first
        assertNull("A's roster gone before anything of B arrives", cached());
        assertEquals(0, notices());
        assertNull("residual A item refused", WatchAccountGuard.intake(context, roster(A, T, "A1")));
        assertNotNull(WatchAccountGuard.intake(context, roster(B, T + 2_000, "B1")));
        assertEquals("B1", cached().gate);
    }

    @Test public void firstPairingDropsALegacyOwnerlessCache() throws Exception {
        WatchAccountGuard.intake(context, roster(null, T, "LEGACY")); // cache from before this version
        assertEquals("LEGACY", cached().gate);
        WatchCloudClient.acceptCredential(context, CRED_B);
        assertNull("ownerless cache is not assumed to be B's", cached());
        assertNull(WatchAccountGuard.intake(context, roster(null, T + 1, "LEGACY")));
    }

    @Test public void firstAccountedRosterDropsALegacyOwnerlessCache() throws Exception {
        WatchAccountGuard.intake(context, roster(null, T, "LEGACY"));
        cancelNotices();
        assertNotNull(WatchAccountGuard.intake(context, roster(B, T + 1, "B1")));
        assertEquals("B1", cached().gate);
        assertNull(WatchAccountGuard.intake(context, roster(null, T + 2, "LEGACY")));
        assertEquals("B1", cached().gate);
    }

    @Test public void cloudRosterMustBelongToThePairing() throws Exception {
        WatchCloudClient.acceptCredential(context, CRED_B);
        WatchCloudClient.transport = (url, authorization, etag) -> new WatchCloudClient.Response(200, "\"x\"",
                new JSONObject().put("snapshot", new JSONObject(roster(A, System.currentTimeMillis() - 1000, "A1"))).toString());
        assertEquals(WatchCloudClient.Result.REJECTED, WatchCloudClient.fetch(context, System.currentTimeMillis()));
        assertNull(cached());
    }
}
