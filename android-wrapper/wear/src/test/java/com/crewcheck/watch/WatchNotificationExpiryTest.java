package com.crewcheck.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

import static org.junit.Assert.*;

/** Actual notification entry point and Android NotificationManager shadow, synthetic data only.
 * No Data Layer transport, physical watch or provider coverage claim. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35)
public class WatchNotificationExpiryTest {
    private static final long NOW = 1_800_000_000_000L;
    private Context context;
    private NotificationManager manager;

    @Before public void reset() {
        context = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(RuntimeEnvironment.getApplication())
                .grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        context.getSharedPreferences("crewcheck_watch_notifications", Context.MODE_PRIVATE)
                .edit().clear().commit();
        manager = context.getSystemService(NotificationManager.class);
        manager.cancelAll();
    }

    private WatchContextSnapshot snapshot(String state, String source, String gate, long expiry) throws Exception {
        JSONObject json = WatchContextSnapshot.demo(NOW - 7_200_000L).toJson()
                .put("state", state).put("changed", false).put("headline", "")
                .put("currentFlight", "QA123").put("gate", gate).put("gateSource", source)
                .put("remoteStand", false).put("validUntilEpochMs", expiry);
        return WatchContextSnapshot.fromJson(json);
    }

    private int count() { return Shadows.shadowOf(manager).getAllNotifications().size(); }

    private WatchContextSnapshot boarding(String contextId, String gate, long generation) throws Exception {
        JSONObject json = snapshot("BOARDING", "radar", gate, NOW + 60_000L).toJson()
                .put("contextId", contextId).put("generatedAtEpochMs", generation);
        return WatchContextSnapshot.fromJson(json);
    }

    private String activeText() {
        assertEquals(1, count());
        return Shadows.shadowOf(manager).getAllNotifications().get(0)
                .extras.getCharSequence(Notification.EXTRA_TEXT).toString();
    }

    private void assertSilentUpdate() {
        Notification active = manager.getActiveNotifications()[0].getNotification();
        assertTrue((active.flags & Notification.FLAG_ONLY_ALERT_ONCE) != 0);
        assertEquals(Notification.GROUP_ALERT_SUMMARY, active.getGroupAlertBehavior());
    }

    @Test public void distinctNoticeReplacesAnActiveOneAndCanAlertOnTheExistingChannel() throws Exception {
        NotificationChannel quiet = new NotificationChannel("crewcheck_watch_ops", "Fixture",
                NotificationManager.IMPORTANCE_LOW);
        quiet.enableVibration(false);
        quiet.setSound(null, null);
        manager.createNotificationChannel(quiet);

        WatchNotificationCenter.postForSnapshot(context, boarding("qa-flight", "14", NOW - 10_000L), NOW);
        assertTrue(activeText().contains("PORTÃO 14"));
        // Keep A posted. B represents a change in the confirmed operational data.
        WatchNotificationCenter.postForSnapshot(context, boarding("qa-flight", "18", NOW), NOW);
        assertTrue(activeText().contains("PORTÃO 18"));
        StatusBarNotification[] active = manager.getActiveNotifications();
        assertEquals(1, active.length);
        assertEquals(4101, active[0].getId());
        assertEquals("B is eligible for normal Android alerting",
                0, active[0].getNotification().flags & Notification.FLAG_ONLY_ALERT_ONCE);
        NotificationChannel kept = manager.getNotificationChannel(quiet.getId());
        assertEquals(NotificationManager.IMPORTANCE_LOW, kept.getImportance());
        assertFalse(kept.shouldVibrate());
        assertNull(kept.getSound());
    }

    @Test public void activeNoticeSurvivesInterleavedReplaysButAllowsFreshCorrections() throws Exception {
        WatchContextSnapshot first = boarding("qa-flight", "14", NOW - 20_000L);
        WatchContextSnapshot refresh = boarding("qa-flight", "14", NOW - 10_000L);
        WatchContextSnapshot changed = boarding("qa-flight", "18", NOW);
        WatchNotificationCenter.postForSnapshot(context, first, NOW);
        // Dismissing the card does not make a minute refresh a new notice.
        manager.cancelAll();
        WatchNotificationCenter.postForSnapshot(context, refresh, NOW);
        assertEquals(0, count());
        WatchNotificationCenter.postForSnapshot(context, changed, NOW);
        assertTrue(activeText().contains("PORTÃO 18"));

        WatchNotificationCenter.postForSnapshot(context, first, NOW + 26_000L);
        assertTrue(activeText().contains("PORTÃO 18"));
        WatchNotificationCenter.postForSnapshot(context,
                boarding("qa-flight", "20", NOW - 5_000L), NOW + 26_000L);
        assertTrue("a previously unseen older revision cannot replace the newer gate",
                activeText().contains("PORTÃO 18"));
        manager.cancelAll();
        // Replay interleaves with B even when A was previously only an equivalent refresh.
        WatchNotificationCenter.postForSnapshot(context, refresh, NOW + 26_000L);
        assertEquals(0, count());
        WatchNotificationCenter.postForSnapshot(context,
                boarding("qa-flight", "14", NOW + 26_000L), NOW + 26_000L);
        assertTrue("a genuinely newer correction to the same gate is a new notice", activeText().contains("PORTÃO 14"));
    }

    @Test public void aDifferentOccurrenceMayHaveExactlyTheSameLabel() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, boarding("qa-first-flight", "14", NOW - 10_000L), NOW);
        String previousText = activeText();
        manager.cancelAll();
        WatchNotificationCenter.postForSnapshot(context, boarding("qa-second-flight", "14", NOW), NOW);
        assertEquals(previousText, activeText());
    }

    @Test public void countdownCanRefreshAnActiveCardWithoutASecondAlert() throws Exception {
        JSONObject connection = boarding("qa-flight", "14", NOW - 20_000L).toJson()
                .put("state", "CONNECTION").put("connection", "18 MIN");
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(connection), NOW);
        assertTrue(activeText().contains("18 MIN"));
        connection.put("connection", "17 MIN").put("generatedAtEpochMs", NOW);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(connection), NOW);
        assertTrue(activeText().contains("17 MIN"));
        assertSilentUpdate();
        manager.cancelAll();
        connection.put("connection", "16 MIN").put("generatedAtEpochMs", NOW + 1_000L);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(connection), NOW + 1_000L);
        assertEquals("a dismissed card is not recreated by its countdown", 0, count());
    }

    @Test public void sameLeaveTimeDoesNotRealertWhenOnlyItsHeadlineChanges() throws Exception {
        JSONObject leave = boarding("qa-leave", "", NOW - 20_000L).toJson().put("state", "LEAVE_SOON")
                .put("leaveTime", "17:55").put("headline", "SAIR EM 18 MIN");
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(leave), NOW);
        assertTrue(activeText().contains("Saia às 17:55"));
        manager.cancelAll();
        leave.put("headline", "SAIR EM 17 MIN").put("generatedAtEpochMs", NOW);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(leave), NOW);
        assertEquals(0, count());
        leave.put("leaveTime", "17:50").put("generatedAtEpochMs", NOW + 1_000L);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(leave), NOW + 1_000L);
        assertTrue(activeText().contains("Saia às 17:50"));
    }

    @Test public void withdrawingConfirmationUpdatesTheCardSilently() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, boarding("qa-flight", "14", NOW - 10_000L), NOW);
        assertTrue(activeText().contains("PORTÃO 14"));
        JSONObject reported = boarding("qa-flight", "18", NOW).toJson().put("gateSource", "reported");
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(reported), NOW);
        assertFalse(activeText().contains("PORTÃO"));
        assertSilentUpdate();
    }

    @Test public void previousInstallKeepsItsLastNoticeWithoutRetainingReadableText() throws Exception {
        JSONObject first = boarding("qa-legacy", "14", NOW).toJson()
                .put("headline", "EMBARQUE").put("primaryTime", "13:45").put("leaveTime", "")
                .put("nextFlight", "").put("boardingTime", "13:45").put("overnight", "");
        String legacy = "BOARDING|EMBARQUE|13:45||QA123||14|13:45||FALSE|EMBARQUE|QA123 · PORTÃO 14 · EMBARQUE 13:45";
        SharedPreferences prefs = context.getSharedPreferences("crewcheck_watch_notifications", Context.MODE_PRIVATE);
        prefs.edit().putString("last_fingerprint", legacy).commit();

        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(first), NOW);
        assertEquals(0, count());
        assertFalse(prefs.contains("last_fingerprint"));
        assertFalse(prefs.getString("recent_notice_receipts", "").contains("qa-legacy"));
        first.put("contextId", "qa-new").put("generatedAtEpochMs", NOW + 1_000L);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(first), NOW + 1_000L);
        assertTrue(activeText().contains("PORTÃO 14"));
    }

    @Test public void publicEntryUsesWallClockToRejectExpiredDeliveryAndAcceptFreshDelivery() throws Exception {
        // Avoid framework-specific wall-clock interception: both instants are deliberately
        // far outside any running Android/JVM clock. Exact boundaries use the same body below.
        JSONObject json = WatchContextSnapshot.demo(1L).toJson()
                .put("state", "BOARDING").put("changed", false).put("currentFlight", "QA123")
                .put("gate", "14").put("gateSource", "radar")
                .put("validUntilEpochMs", 1L);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(json));
        assertEquals("public entry must reject delayed expired data", 0, count());
        json.put("validUntilEpochMs", Long.MAX_VALUE);
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(json));
        assertEquals("public entry must accept still-valid data", 1, count());
    }

    @Test public void delayedOfflineDeliveryNeverPostsExpiredOperationalNotices() throws Exception {
        for (String state : new String[]{"BOARDING", "LEAVE_SOON", "CONNECTION", "OVERNIGHT", "CHANGED"}) {
            for (String source : new String[]{"radar", "manual"}) {
                WatchNotificationCenter.postForSnapshot(context,
                        snapshot(state, source, "14", NOW - 5_400_000L), NOW);
                assertEquals(state + "/" + source + " expired delivery", 0, count());
            }
        }
    }

    @Test public void exactValidityBoundaryMatchesSnapshotThenOneMillisecondLaterIsRejected() throws Exception {
        WatchContextSnapshot boundary = snapshot("BOARDING", "radar", "14", NOW);
        assertFalse(boundary.isStale(NOW));
        WatchNotificationCenter.postForSnapshot(context, boundary, NOW);
        assertEquals(1, count());
        manager.cancelAll();
        assertTrue(boundary.isStale(NOW + 1L));
        // Different gate bypasses deduplication: expiry alone must reject this notice.
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "radar", "18", NOW), NOW + 1L);
        assertEquals(0, count());
    }

    @Test public void freshBoardingAndLeaveNoticeStillPostAndDeduplicate() throws Exception {
        for (String state : new String[]{"BOARDING", "LEAVE_SOON"}) {
            reset();
            WatchContextSnapshot fresh = snapshot(state, "radar", "14", NOW + 1_800_000L);
            WatchNotificationCenter.postForSnapshot(context, fresh, NOW);
            assertEquals(state, 1, count());
            manager.cancelAll();
            WatchNotificationCenter.postForSnapshot(context, fresh, NOW);
            assertEquals("same valid context stays deduplicated", 0, count());
        }
    }

    @Test public void confirmedHotelVanUsesExistingGuardsAndDoesNotAlertForReportedGateChanges() throws Exception {
        JSONObject raw = snapshot("LEAVE_SOON", "reported", "", NOW + 60_000L).toJson()
                .put("headline", "VAN DO HOTEL").put("currentFlight", "").put("nextFlight", "QA123")
                .put("leaveTime", "07:30").put("presentationTime", "").put("presentationPlace", "")
                .put("trafficDetail", "APZ hotel 19/10 07:30 America/Recife")
                .put("hotelPickup", "APZ hotel 19/10 07:30 America/Recife")
                .put("schedule", new org.json.JSONArray().put(new JSONObject().put("id", "synthetic-next")
                        .put("kind", "flight").put("title", "QA123").put("gate", "B26")));
        WatchContextSnapshot van = WatchContextSnapshot.fromJson(raw);
        WatchNotificationCenter.setEnabled(context, false);
        WatchNotificationCenter.postForSnapshot(context, van, NOW);
        assertEquals("disabled stays disabled", 0, count());
        WatchNotificationCenter.setEnabled(context, true);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        WatchNotificationCenter.postForSnapshot(context, van, NOW);
        assertEquals("permission is still required", 0, count());
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        WatchNotificationCenter.postForSnapshot(context, van, NOW + 60_001L);
        assertEquals("late hotel notice stays expired", 0, count());
        WatchNotificationCenter.postForSnapshot(context, van, NOW);
        assertEquals(1, count());
        Notification notice = Shadows.shadowOf(manager).getAllNotifications().get(0);
        String body = notice.extras.getCharSequence(Notification.EXTRA_TEXT).toString();
        assertTrue(body.contains("07:30"));
        assertTrue(body.contains("APZ hotel"));
        assertFalse(body.contains("PORTÃO"));
        assertFalse(body.contains("B26"));
        assertFalse(body.contains("apresentação"));
        manager.cancelAll();
        raw.getJSONArray("schedule").getJSONObject(0).put("gate", "B27");
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(raw), NOW);
        assertEquals("reported next gate alone cannot create a new hotel notice", 0, count());
    }

    @Test public void rejectedExpiredNoticeDoesNotConsumeFreshNoticeFingerprint() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "manual", "14", NOW - 1L), NOW);
        assertEquals(0, count());
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "manual", "14", NOW + 60_000L), NOW);
        assertEquals(1, count());
        Notification notice = Shadows.shadowOf(manager).getAllNotifications().get(0);
        assertTrue(notice.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("PORTÃO 14"));
    }

    @Test public void reportedGateChangesNeverCreateGateAlertsAndRevokedProjectionDoesNotNotify() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "reported", "14", NOW + 60_000L), NOW);
        assertEquals("boarding event remains allowed", 1, count());
        Notification notice = Shadows.shadowOf(manager).getAllNotifications().get(0);
        assertFalse(notice.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("PORTÃO"));
        manager.cancelAll();
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "reported", "18", NOW + 60_000L), NOW);
        assertEquals("reported gate change alone is not an alert", 0, count());
        WatchNotificationCenter.postForSnapshot(context, snapshot("UNKNOWN", "", "", NOW + 60_000L), NOW);
        assertEquals("invalidated projection has no operational notice", 0, count());
    }
}
