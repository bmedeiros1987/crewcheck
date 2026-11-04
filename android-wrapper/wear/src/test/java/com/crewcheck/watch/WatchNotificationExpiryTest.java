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
import org.robolectric.shadows.ShadowSystemClock;
import static org.junit.Assert.*;

/** Actual notification entry point and Android NotificationManager shadow, synthetic data only.
 * No Data Layer transport, physical watch or provider coverage claim. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@org.robolectric.annotation.LooperMode(org.robolectric.annotation.LooperMode.Mode.LEGACY)
@Config(sdk = 35, instrumentedPackages = {"com.crewcheck.watch"})
public class WatchNotificationExpiryTest {
    private static final long NOW = 1_800_000_000_000L;
    private Context context;
    private NotificationManager manager;

    @Before public void reset() {
        ShadowSystemClock.setNanoTime(NOW * 1_000_000L);
        assertEquals("notification code and fixture must share the synthetic wall clock",
                NOW, System.currentTimeMillis());
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

    @Test public void delayedOfflineDeliveryNeverPostsExpiredOperationalNotices() throws Exception {
        for (String state : new String[]{"BOARDING", "LEAVE_SOON", "CONNECTION", "OVERNIGHT", "CHANGED"}) {
            for (String source : new String[]{"radar", "manual"}) {
                WatchNotificationCenter.postForSnapshot(context,
                        snapshot(state, source, "14", NOW - 5_400_000L));
                assertEquals(state + "/" + source + " expired delivery", 0, count());
            }
        }
    }

    @Test public void exactValidityBoundaryMatchesSnapshotThenOneMillisecondLaterIsRejected() throws Exception {
        WatchContextSnapshot boundary = snapshot("BOARDING", "radar", "14", NOW);
        assertFalse(boundary.isStale(NOW));
        WatchNotificationCenter.postForSnapshot(context, boundary);
        assertEquals(1, count());
        manager.cancelAll();
        ShadowSystemClock.setNanoTime((NOW + 1L) * 1_000_000L);
        assertTrue(boundary.isStale(NOW + 1L));
        // Different gate bypasses deduplication: expiry alone must reject this notice.
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "radar", "18", NOW));
        assertEquals(0, count());
    }

    @Test public void freshBoardingAndLeaveNoticeStillPostAndDeduplicate() throws Exception {
        for (String state : new String[]{"BOARDING", "LEAVE_SOON"}) {
            reset();
            WatchContextSnapshot fresh = snapshot(state, "radar", "14", NOW + 1_800_000L);
            WatchNotificationCenter.postForSnapshot(context, fresh);
            assertEquals(state, 1, count());
            manager.cancelAll();
            WatchNotificationCenter.postForSnapshot(context, fresh);
            assertEquals("same valid context stays deduplicated", 0, count());
        }
    }

    @Test public void rejectedExpiredNoticeDoesNotConsumeFreshNoticeFingerprint() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "manual", "14", NOW - 1L));
        assertEquals(0, count());
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "manual", "14", NOW + 60_000L));
        assertEquals(1, count());
        Notification notice = Shadows.shadowOf(manager).getAllNotifications().get(0);
        assertTrue(notice.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("PORTÃO 14"));
    }

    @Test public void reportedGateChangesNeverCreateGateAlertsAndRevokedProjectionDoesNotNotify() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "reported", "14", NOW + 60_000L));
        assertEquals("boarding event remains allowed", 1, count());
        Notification notice = Shadows.shadowOf(manager).getAllNotifications().get(0);
        assertFalse(notice.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("PORTÃO"));
        manager.cancelAll();
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "reported", "18", NOW + 60_000L));
        assertEquals("reported gate change alone is not an alert", 0, count());
        WatchNotificationCenter.postForSnapshot(context, snapshot("UNKNOWN", "", "", NOW + 60_000L));
        assertEquals("invalidated projection has no operational notice", 0, count());
    }
}
