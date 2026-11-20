package com.crewcheck.watch;

import android.app.NotificationManager;
import android.app.job.JobScheduler;
import android.content.Context;
import com.google.android.gms.wearable.DataMap;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

/** Reviews of cb845fb36 and 706cef67c (P1): a former account's roster or pairing never comes
 * back on the watch, through the real routing (Data Layer item, message, Sincronizar import,
 * cloud), after logout or account change, in any delivery order, including items delivered
 * late or replayed after a new login, and a late credential delete. The phone's account epoch
 * is the only authority; snapshot times never are. Cloud sync OFF keeps working. Synthetic
 * accounts and rosters only. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, instrumentedPackages = {"com.crewcheck.watch"},
        shadows = {WatchCacheLifecycleTest.TestKey.class, WatchCloudSyncTest.TestCloudKey.class})
public class WatchAccountBindingTest {
    static final String A = "a".repeat(32), B = "b".repeat(32);
    static final String CRED_A = "cw1." + A + "." + "C".repeat(43), CRED_B = "cw1." + B + "." + "E".repeat(43);
    static final String CRED_A2 = "cw1." + A + "." + "D".repeat(43);
    static final long T = 1_900_000_000_000L;
    // Phone epochs: A logged in, logout, B logged in, A logged in again.
    static final long E_A = 10, E_LOGOUT = 20, E_B = 30, E_A2 = 40;
    Context context;
    final WatchCloudClient.Transport realTransport = WatchCloudClient.transport;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        WatchNotificationCenter.setEnabled(context, true);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
    }

    @After public void restoreTransport() { WatchCloudClient.transport = realTransport; }

    /** A roster that always produces a local notice, so a returning roster would be visible. */
    static String roster(String account, long epoch, long generatedAt, String gate) throws Exception {
        JSONObject json = WatchContextSnapshot.demo(generatedAt).toJson()
                .put("state", "CHANGED").put("changed", true).put("detail", "Escala " + gate).put("gate", gate)
                .put("validUntilEpochMs", generatedAt + 3_600_000L);
        if (account != null) json.put("account", account);
        if (epoch > 0) json.put("accountEpoch", epoch);
        return json.toString();
    }
    static DataMap snapshotItem(String json) { DataMap m = new DataMap(); m.putString(WatchContract.DATA_KEY_SNAPSHOT_JSON, json); m.putLong("sentAtEpochMs", 1L); return m; }
    static DataMap credentialItem(String credential, long epoch) { DataMap m = new DataMap(); m.putString(WatchContract.DATA_KEY_CLOUD_CREDENTIAL, credential); m.putLong(WatchContract.DATA_KEY_ACCOUNT_EPOCH, epoch); return m; }
    static DataMap accountItem(String account, long epoch) { DataMap m = new DataMap(); m.putString(WatchContract.DATA_KEY_ACCOUNT, account); m.putLong(WatchContract.DATA_KEY_ACCOUNT_EPOCH, epoch); return m; }

    void item(String path, DataMap map) { CrewCheckDataLayerService.itemChanged(context, path, map); }
    void state(String account, long epoch) { item(WatchContract.ACCOUNT_PATH, accountItem(account, epoch)); }
    void credential(String credential, long epoch) { item(WatchContract.CLOUD_PATH, credentialItem(credential, epoch)); }
    void rosterItem(String json) { item(WatchContract.SNAPSHOT_PATH, snapshotItem(json)); }
    void rosterMessage(String json) { CrewCheckDataLayerService.message(context, WatchContract.SNAPSHOT_PATH, json.getBytes(StandardCharsets.UTF_8)); }
    boolean sync(WatchSyncClient.Item... items) { return WatchSyncClient.importItems(context, Arrays.asList(items), new AtomicLong()); }
    static WatchSyncClient.Item at(String path, DataMap map) { return new WatchSyncClient.Item(path, map); }

    WatchContextSnapshot cached() { return new SecureSnapshotStore(context).load(); }
    String pairedOwner() { WatchCloudCredentialStore.Pairing p = new WatchCloudCredentialStore(context).current(); return p == null ? null : p.owner; }
    int notices() { return Shadows.shadowOf(context.getSystemService(NotificationManager.class)).getAllNotifications().size(); }
    void cancelNotices() { context.getSystemService(NotificationManager.class).cancelAll(); }
    void resetWatch() {
        context.getSharedPreferences("crewcheck_watch_account", Context.MODE_PRIVATE).edit().clear().commit();
        new SecureSnapshotStore(context).clear();
        new WatchCloudCredentialStore(context).clear();
        cancelNotices();
    }

    @Test public void cloudOffBluetoothKeepsWorkingForOneAccount() throws Exception {
        state(A, E_A);
        rosterMessage(roster(A, E_A, T, "A1"));
        assertEquals("A1", cached().gate);
        assertEquals(1, notices());
        rosterItem(roster(A, E_A, T + 60_000, "A2"));
        assertEquals("A2", cached().gate);
        assertNull("no cloud pairing involved", pairedOwner());
    }

    @Test public void oldPhoneWithoutEpochStillSyncs() throws Exception {
        rosterMessage(roster(null, 0, T, "L1"));
        rosterItem(roster(null, 0, T + 1, "L2"));
        assertEquals("L2", cached().gate);
    }

    @Test public void sessionExpiryInTheSameEpochKeepsPairingAndShowsThePlaceholder() throws Exception {
        state(A, E_A);
        credential(CRED_A, E_A);
        rosterItem(roster(A, E_A, T, "A1"));
        rosterItem(roster(null, E_A, T + 1_000, "SESSAO")); // unmarked, stamped by the phone in A's epoch
        assertEquals("SESSAO", cached().gate);
        assertEquals("same person: still paired", A, pairedOwner());
        rosterItem(roster(B, E_A, T + 2_000, "B?"));
        assertEquals("another account never shares an epoch", "SESSAO", cached().gate);
    }

    @Test public void logoutDropsEverythingForEveryBluetoothPath() throws Exception {
        state(A, E_A);
        credential(CRED_A, E_A);
        rosterItem(roster(A, E_A, T, "A1"));
        state("", E_LOGOUT);
        assertNull("roster of A cleared on logout", cached());
        assertNull("pairing of A cleared on logout", pairedOwner());
        assertEquals(0, notices());
        assertNull(context.getSystemService(JobScheduler.class).getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID));
        // A's items, also generated after anything seen before (time proves nothing): refused, no notice.
        rosterMessage(roster(A, E_A, T + 5_000, "A-late"));
        rosterItem(roster(A, E_A, T + 6_000, "A-late"));
        assertFalse(sync(at(WatchContract.SNAPSHOT_PATH, snapshotItem(roster(A, E_A, T + 7_000, "A-late"))),
                at(WatchContract.CLOUD_PATH, credentialItem(CRED_A, E_A))));
        rosterMessage(roster(null, 0, T + 8_000, "LEGACY"));
        assertNull(cached());
        assertNull(pairedOwner());
        assertEquals(0, notices());
    }

    /** dot, 706cef67c P1: credential B before A's logout state, then a roster of A generated
     * after the last one seen and delivered late. */
    @Test public void lateUnseenRosterOfAAfterCredentialB() throws Exception {
        state(A, E_A);
        rosterItem(roster(A, E_A, T, "A1"));
        credential(CRED_B, E_B);
        assertNull("A's roster goes before anything of B", cached());
        assertEquals(B, pairedOwner());
        rosterMessage(roster(A, E_A, T + 1_000, "A2"));
        rosterItem(roster(A, E_A, T + 1_500, "A2"));
        state("", E_LOGOUT); // A's logout state arrives after B's credential: older, ignored
        state(A, E_A);
        assertNull("A's late roster never shows under B", cached());
        assertEquals("B's pairing survives", B, pairedOwner());
        rosterItem(roster(B, E_B, T + 3_000, "B1"));
        assertEquals("B1", cached().gate);
    }

    /** Every delivery order of logout state, B's state, credential and roster, with A's late items in between. */
    @Test public void switchToBInEveryDeliveryOrder() throws Exception {
        List<Runnable> steps = Arrays.asList(
                () -> state("", E_LOGOUT), () -> state(B, E_B), () -> credential(CRED_B, E_B),
                () -> { try { rosterItem(roster(B, E_B, T + 3_000, "B1")); } catch (Exception e) { throw new AssertionError(e); } });
        int orders = 0;
        for (List<Integer> order : permutations(Arrays.asList(0, 1, 2, 3))) {
            resetWatch();
            state(A, E_A);
            credential(CRED_A, E_A);
            rosterItem(roster(A, E_A, T, "A1"));
            for (int index : order) {
                steps.get(index).run();
                rosterMessage(roster(A, E_A, T + 9_000, "A-late"));
                credential(CRED_A, E_A);
            }
            assertEquals(order.toString(), B, pairedOwner());
            assertEquals(order.toString(), "B1", cached().gate);
            orders++;
        }
        assertEquals(24, orders);
    }

    /** dot, 706cef67c: after A logs in again, Sincronizar or the Data Layer replays the
     * logout state and A's older items; the new session keeps roster, notice and pairing. */
    @Test public void replayAfterReLoginOfTheSameAccount() throws Exception {
        state(A, E_A);
        credential(CRED_A, E_A);
        rosterItem(roster(A, E_A, T, "A1"));
        state("", E_LOGOUT);
        state(A, E_A2);
        credential(CRED_A, E_A2);
        rosterItem(roster(A, E_A2, T + 3_000, "A3"));
        assertEquals(1, notices());
        state("", E_LOGOUT);
        sync(at(WatchContract.ACCOUNT_PATH, accountItem("", E_LOGOUT)), at(WatchContract.CLOUD_PATH, credentialItem(CRED_A, E_A)),
                at(WatchContract.SNAPSHOT_PATH, snapshotItem(roster(A, E_A, T + 4_000, "A-old"))));
        rosterMessage(roster(A, E_A, T + 5_000, "A-old"));
        assertEquals("A3", cached().gate);
        assertEquals(A, pairedOwner());
        assertEquals("replay clears nothing", 1, notices());
        assertNotNull(context.getSystemService(JobScheduler.class).getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID));
    }

    /** dot, 706cef67c: a delete of A's credential item delivered after the switch to B. */
    @Test public void lateCredentialDeleteAfterSwitchKeepsB() throws Exception {
        state(A, E_A);
        credential(CRED_A, E_A);
        state(B, E_B);
        credential(CRED_B, E_B);
        rosterItem(roster(B, E_B, T, "B1"));
        CrewCheckDataLayerService.itemDeleted(context, WatchContract.CLOUD_PATH);
        assertEquals(B, pairedOwner());
        assertEquals("B1", cached().gate);
        assertNotNull(context.getSystemService(JobScheduler.class).getPendingJob(WatchCloudSyncJob.PERIODIC_JOB_ID));
    }

    @Test public void credentialOfAnOlderEpochOrWithoutEpochIsRefused() throws Exception {
        credential(CRED_B, E_B);
        assertFalse(WatchCloudClient.acceptCredential(context, CRED_A, E_A));
        assertFalse(WatchCloudClient.acceptCredential(context, CRED_A, 0L));
        assertFalse("same epoch, other account", WatchCloudClient.acceptCredential(context, CRED_A, E_B));
        assertEquals(B, pairedOwner());
        assertTrue("same account re-pairs in its epoch", WatchCloudClient.acceptCredential(context, CRED_B, E_B));
    }

    @Test public void firstEpochDropsALegacyOwnerlessCache() throws Exception {
        rosterItem(roster(null, 0, T, "LEGACY")); // cache from before this version
        assertEquals("LEGACY", cached().gate);
        credential(CRED_B, E_B);
        assertNull("ownerless cache is not assumed to be B's", cached());
        rosterItem(roster(null, 0, T + 1, "LEGACY"));
        assertNull(cached());
    }

    @Test public void firstAccountedRosterDropsALegacyOwnerlessCache() throws Exception {
        rosterItem(roster(null, 0, T, "LEGACY"));
        cancelNotices();
        rosterItem(roster(B, E_B, T + 1, "B1"));
        assertEquals("B1", cached().gate);
        rosterItem(roster(null, 0, T + 2, "LEGACY"));
        assertEquals("B1", cached().gate);
    }

    @Test public void syncReimportAppliesTheRuleWithoutNotifying() throws Exception {
        assertTrue(sync(at(WatchContract.SNAPSHOT_PATH, snapshotItem(roster(A, E_A, T, "A1"))), at(WatchContract.ACCOUNT_PATH, accountItem(A, E_A))));
        assertEquals("A1", cached().gate);
        assertEquals("Sincronizar keeps its old behaviour: no notice", 0, notices());
        assertFalse(sync(at(WatchContract.ACCOUNT_PATH, accountItem(B, E_B)), at(WatchContract.SNAPSHOT_PATH, snapshotItem(roster(A, E_A, T + 9, "A2")))));
        assertNull("state is applied before rosters, whatever the item order", cached());
    }

    @Test public void cloudRosterMustBelongToTheCurrentAccount() throws Exception {
        credential(CRED_B, E_B);
        WatchCloudClient.transport = (url, authorization, etag) -> new WatchCloudClient.Response(200, "\"x\"",
                new JSONObject().put("snapshot", new JSONObject(roster(A, 0, System.currentTimeMillis() - 1000, "A1"))).toString());
        assertEquals(WatchCloudClient.Result.REJECTED, WatchCloudClient.fetch(context, System.currentTimeMillis()));
        assertNull(cached());
    }

    /** dot, f478699a9 (P2): same account and epoch, a newer cloud copy and then older Bluetooth
     * items (persistent Data Layer item via Sincronizar, late messages, descending times). */
    @Test public void olderRosterOfTheSameEpochNeverOverwritesANewerOne() throws Exception {
        long now = System.currentTimeMillis();
        state(A, E_A);
        credential(CRED_A, E_A);
        WatchCloudClient.transport = (url, authorization, etag) -> new WatchCloudClient.Response(200, "\"t2\"",
                new JSONObject().put("snapshot", new JSONObject(roster(A, 0, now - 60_000, "A-T2"))).toString());
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, now));
        assertEquals("A-T2", cached().gate);
        int noticesAfterCloud = notices();
        // Sincronizar re-imports the persistent, older Bluetooth item of the same epoch.
        assertFalse(sync(at(WatchContract.SNAPSHOT_PATH, snapshotItem(roster(A, E_A, now - 120_000, "A-T1")))));
        assertEquals("A-T2", cached().gate);
        // Late messages and items, descending times: refused, no notice.
        for (long age : new long[]{90_000, 100_000, 110_000, 600_000}) {
            rosterMessage(roster(A, E_A, now - age, "A-OLD"));
            rosterItem(roster(A, E_A, now - age, "A-OLD"));
        }
        assertEquals("A-T2", cached().gate);
        assertEquals("no notice for a refused roster", noticesAfterCloud, notices());
        // Same instant: the first copy stays (cloud and Bluetooth carry the same projection);
        // Sincronizar still counts it as present, without saving or notifying again.
        assertTrue(sync(at(WatchContract.SNAPSHOT_PATH, snapshotItem(roster(A, E_A, now - 60_000, "A-SAME")))));
        rosterMessage(roster(A, E_A, now - 60_000, "A-SAME"));
        assertEquals("A-T2", cached().gate);
        assertEquals(noticesAfterCloud, notices());
        // A newer one is accepted.
        rosterMessage(roster(A, E_A, now - 30_000, "A-T3"));
        assertEquals("A-T3", cached().gate);
        // And the cloud copy older than it is ignored too (the inverse direction).
        assertEquals(WatchCloudClient.Result.UNCHANGED, WatchCloudClient.fetch(context, now));
        assertEquals("A-T3", cached().gate);
    }

    /** The cloud fetch's isCurrent(owner) check is redundant with the pairing generation: a
     * response or credential of the previous pairing is discarded after any transition or
     * re-pairing, also of the same account (where isCurrent alone could not tell them apart). */
    @Test public void oldCloudResponseOrCredentialAfterATransitionIsDiscarded() throws Exception {
        long now = System.currentTimeMillis();
        String[] gate = {"A-OLD"};
        Runnable[] duringRequest = {() -> {}};
        WatchCloudClient.transport = (url, authorization, etag) -> {
            duringRequest[0].run();
            return new WatchCloudClient.Response(200, "\"x\"", new JSONObject().put("snapshot", new JSONObject(roster(A, 0, now - 1_000, gate[0]))).toString());
        };
        // Switch to B while A's request is in flight.
        state(A, E_A);
        credential(CRED_A, E_A);
        duringRequest[0] = () -> { state(B, E_B); credential(CRED_B, E_B); };
        assertEquals(WatchCloudClient.Result.STALE, WatchCloudClient.fetch(context, now));
        assertNull(cached());
        assertEquals(B, pairedOwner());
        // Logout and a new login of the same account A while A's old request is in flight.
        resetWatch();
        state(A, E_A);
        credential(CRED_A, E_A);
        duringRequest[0] = () -> { state("", E_LOGOUT); state(A, E_A2); credential(CRED_A2, E_A2); };
        assertEquals(WatchCloudClient.Result.STALE, WatchCloudClient.fetch(context, now));
        assertNull("the old session's answer is not the new session's roster", cached());
        assertEquals(CRED_A2, new WatchCloudCredentialStore(context).load());
        // The old credential replayed after the new login is refused; the new pairing stays.
        duringRequest[0] = () -> {};
        assertFalse(WatchCloudClient.acceptCredential(context, CRED_A, E_A));
        credential(CRED_A, E_A);
        assertEquals(CRED_A2, new WatchCloudCredentialStore(context).load());
        gate[0] = "A-NEW";
        assertEquals(WatchCloudClient.Result.UPDATED, WatchCloudClient.fetch(context, now));
        assertEquals("A-NEW", cached().gate);
    }

    static List<List<Integer>> permutations(List<Integer> items) {
        List<List<Integer>> out = new ArrayList<>();
        if (items.isEmpty()) { out.add(new ArrayList<>()); return out; }
        for (int i = 0; i < items.size(); i++) {
            List<Integer> rest = new ArrayList<>(items);
            Integer head = rest.remove(i);
            for (List<Integer> tail : permutations(rest)) { tail.add(0, head); out.add(tail); }
        }
        return out;
    }
}
