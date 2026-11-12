package com.crewcheck.watch;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
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
