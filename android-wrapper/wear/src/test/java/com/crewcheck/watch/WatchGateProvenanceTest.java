package com.crewcheck.watch;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** Gate provenance on the watch through its real consumers: local notifications never treat a
 * reported gate as confirmed (text and dedupe), the gate detail screen states the origin, and
 * the gate fact and the gate complication open that screen. Synthetic data only. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@org.robolectric.annotation.LooperMode(org.robolectric.annotation.LooperMode.Mode.LEGACY)
@Config(sdk = 35, instrumentedPackages = {"com.crewcheck.watch"}, qualifiers = "w225dp-h225dp-round-xhdpi",
        shadows = {WatchTextLayoutTest.NoDeviceAmbient.class, WatchCacheLifecycleTest.TestKey.class})
public class WatchGateProvenanceTest {
    Context context;

    @Before public void setUp() {
        // App code reads Robolectric's clock: pin it to a realistic synthetic instant.
        org.robolectric.shadows.ShadowSystemClock.setNanoTime(1_800_000_000_000L * 1_000_000L);
        context = RuntimeEnvironment.getApplication();
        WatchNotificationCenter.setEnabled(context, true);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        context.getSharedPreferences("crewcheck_watch_notifications", Context.MODE_PRIVATE).edit().clear().commit();
        cancelAll();
    }

    /** App code reads Robolectric's clock, not the wall clock. */
    static long now() { return org.robolectric.shadows.ShadowSystemClock.currentTimeMillis(); }

    static WatchContextSnapshot snapshot(String state, String gate, String source, String note) throws Exception {
        long now = now();
        JSONObject json = WatchContextSnapshot.demo(now).toJson()
                .put("state", state).put("changed", false).put("headline", "").put("gate", gate).put("remoteStand", false)
                .put("currentFlight", "QA123").put("nextFlight", "QA456").put("connection", "GRU")
                .put("boardingTime", "09:30").put("validUntilEpochMs", now + 3_600_000L);
        if (source != null) json.put("gateSource", source);
        if (note != null) json.put("gateNote", note);
        return WatchContextSnapshot.fromJson(json.toString());
    }

    List<Notification> posted() {
        return Shadows.shadowOf(context.getSystemService(NotificationManager.class)).getAllNotifications();
    }

    void cancelAll() {
        context.getSystemService(NotificationManager.class).cancelAll();
    }

    static String text(Notification n) {
        return n.extras.getCharSequence(Notification.EXTRA_TITLE) + " | " + n.extras.getCharSequence(Notification.EXTRA_TEXT);
    }

    @Test public void contractKeepsOnlyKnownSources() throws Exception {
        assertEquals("reported", snapshot("BOARDING", "12", "REPORTED", "x").gateSource);
        assertEquals("radar", snapshot("BOARDING", "12", "radar", null).gateSource);
        assertEquals("", snapshot("BOARDING", "12", "roster", null).gateSource);
        assertEquals("", snapshot("BOARDING", "12", "<b>", null).gateSource);
        assertEquals("", snapshot("BOARDING", "12", null, null).gateSource);
        WatchContextSnapshot round = WatchContextSnapshot.fromJson(snapshot("BOARDING", "12", "reported", "Informado por FlightAware · a confirmar").toJson().toString());
        assertEquals("reported", round.gateSource);
        assertEquals("Informado por FlightAware · a confirmar", round.gateNote);
        assertTrue(round.gateReported());
    }

    @Test public void boardingNoticeNeverPresentsAReportedGateAsConfirmed() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "12", "reported", "a confirmar"));
        assertEquals(1, posted().size());
        String reported = text(posted().get(0));
        assertTrue(reported, reported.contains("Embarque") && reported.contains("QA123"));
        assertFalse("reported gate not announced: " + reported, reported.contains("12") && reported.matches(".*\\b12\\b.*"));

        // A reported gate appearing or changing is not an alert.
        cancelAll();
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "14", "reported", "a confirmar"));
        assertEquals("reported gate change does not notify", 0, posted().size());

        // The same gate proven by the source is announced, and a proven change notifies.
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "14", "radar", null));
        assertEquals(1, posted().size());
        assertTrue(text(posted().get(0)), text(posted().get(0)).contains("14"));
        cancelAll();
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "16", "radar", null));
        assertEquals(1, posted().size());
        assertTrue(text(posted().get(0)).contains("16"));
        // Manual gates keep their behavior.
        cancelAll();
        WatchNotificationCenter.postForSnapshot(context, snapshot("BOARDING", "18", "manual", null));
        assertTrue(text(posted().get(0)).contains("18"));
    }

    @Test public void connectionNoticeAndRemoteStandFollowTheSameRule() throws Exception {
        WatchNotificationCenter.postForSnapshot(context, snapshot("CONNECTION", "22", "reported", null));
        String reported = text(posted().get(0));
        assertFalse(reported, reported.matches(".*\\b22\\b.*"));
        cancelAll();
        WatchNotificationCenter.postForSnapshot(context, snapshot("CONNECTION", "24", "reported", null));
        assertEquals(0, posted().size());

        JSONObject remote = snapshot("BOARDING", "", "reported", null).toJson().put("remoteStand", true).put("currentFlight", "QA777");
        WatchNotificationCenter.postForSnapshot(context, WatchContextSnapshot.fromJson(remote.toString()));
        String remoteText = text(posted().get(0));
        assertFalse("a reported remote stand is not announced as remote: " + remoteText, remoteText.contains("remot") || remoteText.contains("Remota"));
    }

    @Test public void gateDetailStatesOriginAndConfirmation() throws Exception {
        String[][] cases = {
                {"reported", "Informado por FlightAware · a confirmar · recebido 09:20 BRT", "A confirmar"},
                {"radar", "Fonte operacional · recebido 09:20 BRT", "Confirmado pela fonte"},
                {"manual", "Informado por você · às 09:10 BRT", "Informado por você"},
                {"", "", "Origem não informada"}};
        for (String[] c : cases) {
            new SecureSnapshotStore(context).save(snapshot("BOARDING", "B12", c[0], c[1]).toJson().toString());
            Intent open = new Intent(context, MainActivity.class).putExtra("crewcheck_screen", "gate");
            try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class, open).create().start().resume().visible()) {
                String screen = visibleText(controller.get());
                assertTrue(c[0] + ": " + screen, screen.contains("PORTÃO ‖ B12 ‖") && screen.contains(c[2]));
                if (!c[1].isEmpty()) assertTrue(screen, screen.contains(c[1]));
                assertEquals(c[0] + " shows the airport caveat only when reported", "reported".equals(c[0]), screen.contains("Confirme no painel"));
            }
        }
        // A stale snapshot never shows an old gate on the detail screen.
        JSONObject stale = snapshot("BOARDING", "B12", "radar", null).toJson();
        stale.put("generatedAtEpochMs", now() - 7_200_000L).put("validUntilEpochMs", now() - 60_000L);
        new SecureSnapshotStore(context).save(stale.toString());
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class,
                new Intent(context, MainActivity.class).putExtra("crewcheck_screen", "gate")).create().start().resume().visible()) {
            String screen = visibleText(controller.get());
            assertTrue(screen, screen.contains("desatualizado"));
            assertFalse(screen, screen.contains("B12"));
        }
    }

    @Test public void gateFactAndComplicationOpenTheDetail() throws Exception {
        new SecureSnapshotStore(context).save(snapshot("BOARDING", "B12", "reported", "a confirmar").toJson().toString());
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible()) {
            MainActivity activity = controller.get();
            View gate = find((View) field(activity, "content"), "PORTÃO B12, ver detalhes");
            assertNotNull("gate fact is tappable", gate);
            assertTrue("touch target ≥ 48dp", gate.getMinimumHeight() >= Math.round(48 * activity.getResources().getDisplayMetrics().density));
            assertTrue(gate.performClick());
            assertEquals(4, field(activity, "screenMode"));
            assertTrue(visibleText(activity).contains("A confirmar"));
        }
        GateComplicationService service = Robolectric.buildService(GateComplicationService.class).create().get();
        Intent tap = service.tapIntent();
        assertEquals("gate", tap.getStringExtra("crewcheck_screen"));
        assertEquals(MainActivity.class.getName(), tap.getComponent().getClassName());
        assertNull("other complications keep opening the home screen",
                Robolectric.buildService(NextStepComplicationService.class).create().get().tapIntent().getStringExtra("crewcheck_screen"));
    }

    static String visibleText(MainActivity activity) throws Exception {
        List<String> out = new ArrayList<>();
        collect((View) field(activity, "content"), out);
        return String.join(" ‖ ", out);
    }

    static void collect(View v, List<String> out) {
        if (v.getVisibility() != View.VISIBLE) return;
        if (v instanceof TextView) out.add(((TextView) v).getText().toString());
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) collect(((ViewGroup) v).getChildAt(i), out);
    }

    static View find(View v, String description) {
        if (description.contentEquals(v.getContentDescription() == null ? "" : v.getContentDescription())) return v;
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) {
            View found = find(((ViewGroup) v).getChildAt(i), description);
            if (found != null) return found;
        }
        return null;
    }

    static Object field(Object o, String n) throws Exception { Field f = o.getClass().getDeclaredField(n); f.setAccessible(true); return f.get(o); }
}
