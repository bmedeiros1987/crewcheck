package com.crewcheck.watch;

import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

/** Exercises the native activity; only the encrypted snapshot read is replaced by a fixture. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "w192dp-h192dp-round-mdpi",
        shadows = {WatchTextLayoutTest.NoDeviceAmbient.class,
                WatchScheduleNavigationAcceptanceTest.FixtureSnapshotStore.class})
public class WatchScheduleNavigationAcceptanceTest {
    private static final String SCHEDULE = "MINHA ESCALA";
    private static final String FLIGHT = "CC 9101";
    private static final String FIRST_ROUTE = "GRU → BSB";
    private static final String SECOND_ROUTE = "BSB → GYN";
    private static final String GLOBAL_GATE = "Z99";

    @Implements(SecureSnapshotStore.class)
    public static class FixtureSnapshotStore {
        private static WatchContextSnapshot selected;

        @Implementation
        protected WatchContextSnapshot load() {
            return selected == null ? null : WatchContextSnapshot.fromJson(selected.toJson());
        }
    }

    @After public void clearFixture() {
        FixtureSnapshotStore.selected = null;
    }

    @Test public void radarMenuAndExistingScheduleIntentUseTheSameNativeScreen() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            assertFalse(visibleText(activity, SCHEDULE));
            assertTrue(button(activity, "Escala · 2").performClick());
            assertTrue(visibleText(activity, SCHEDULE));
            assertEquals(2, labels(viewport(activity), FLIGHT).size());
            activity.getOnBackPressedDispatcher().onBackPressed();
            assertFalse(visibleText(activity, SCHEDULE));
            assertTrue(visibleText(activity, "Ver escala"));
            controller.newIntent(scheduleIntent());
            assertTrue(visibleText(activity, SCHEDULE));
        }
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            assertTrue(visibleText(controller.get(), SCHEDULE));
        }
    }

    @Test public void radarDepartureKeepsExistingRefreshAndTheScheduleRemainsReachable() throws Exception {
        putLive("LEAVE_SOON", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            assertTrue(button(activity, "Atualizar trânsito").isClickable());
            assertTrue(button(activity, "Escala · 2").performClick());
            assertTrue(visibleText(activity, SCHEDULE));
        }
    }

    @Test public void validSavedSnapshotIsReadableAndAnExpiredSnapshotIsNot() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            MainActivity activity = controller.get();
            assertTrue(visibleText(activity, SECOND_ROUTE));
            long now = System.currentTimeMillis();
            putSnapshot("REPORTING", "leg-a", "leg-b", now - 120_000, now - 60_000,
                    FIRST_ROUTE, SECOND_ROUTE);
            controller.pause().resume();
            assertTrue(visibleText(activity, SCHEDULE));
            assertFalse(visibleText(activity, FIRST_ROUTE));
            assertFalse(visibleText(activity, SECOND_ROUTE));
        }
    }

    @Test public void snapshotRefreshReplacesOldRowsAndRetainsSeveralStepsOnOneDay() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            MainActivity activity = controller.get();
            assertTrue(visibleText(activity, FIRST_ROUTE));
            long now = System.currentTimeMillis();
            putSnapshot("REPORTING", "leg-a", "leg-b", now + 1, now + 60_000,
                    "CGH → SDU", "SDU → VIX");
            JSONObject replacement = FixtureSnapshotStore.selected.toJson();
            replacement.getJSONArray("schedule")
                    .put(row("leg-c", "VIX → CGH", "16:00", "Qua, 25/11 • BRT"));
            FixtureSnapshotStore.selected = WatchContextSnapshot.fromJson(replacement);
            controller.pause().resume();
            assertFalse(visibleText(activity, FIRST_ROUTE));
            assertFalse(visibleText(activity, SECOND_ROUTE));
            assertTrue(visibleText(activity, "CGH → SDU"));
            assertTrue(visibleText(activity, "SDU → VIX"));
            assertTrue(visibleText(activity, "VIX → CGH"));
            assertEquals(3, labels(viewport(activity), FLIGHT).size());
        }
    }

    @Test public void missingOrAmbiguousOccurrenceIdentityDoesNotOpenDetail() throws Exception {
        for (String firstId : new String[]{"", "same"}) {
            putLive("REPORTING", firstId, "same");
            try (ActivityController<MainActivity> controller =
                         Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
                MainActivity activity = controller.get();
                assertFalse(scheduleCard(activity, 0).performClick());
                assertTrue(visibleText(activity, SCHEDULE));
            }
        }
    }

    @Test public void oneTapOpensThatOccurrenceAndBackReturnsToScheduleThenRadar() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            button(activity, "Escala · 2").performClick();
            assertTrue("the second occurrence opens with one touch",
                    scheduleCard(activity, 1).performClick());
            assertTrue(visibleText(activity, SECOND_ROUTE));
            assertFalse("a repeated flight number must not select the other occurrence",
                    visibleText(activity, FIRST_ROUTE));
            assertFalse("the global gate belongs to a different context",
                    visibleText(activity, GLOBAL_GATE));
            activity.getOnBackPressedDispatcher().onBackPressed();
            assertTrue(visibleText(activity, SCHEDULE));
            assertEquals(2, labels(viewport(activity), FLIGHT).size());
            activity.getOnBackPressedDispatcher().onBackPressed();
            assertFalse(visibleText(activity, SCHEDULE));
            assertTrue(visibleText(activity, "Ver escala"));
        }
    }

    @Test public void replacingTheSnapshotNeverRetargetsAnOpenDetail() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            MainActivity activity = controller.get();
            assertTrue("an eligible current occurrence must open",
                    scheduleCard(activity, 1).performClick());
            assertTrue(visibleText(activity, SECOND_ROUTE));
            long now = System.currentTimeMillis();
            // Simulated replacement from a different profile with the same local occurrence IDs.
            putSnapshot("REPORTING", "leg-a", "leg-b", now + 1, now + 60_000,
                    "CGH → SDU", "SDU → VIX");
            controller.pause().resume();
            assertTrue("return to the current schedule if the selection is no longer trustworthy",
                    visibleText(activity, SCHEDULE));
            assertFalse(visibleText(activity, SECOND_ROUTE));
            assertTrue(visibleText(activity, "SDU → VIX"));
            FixtureSnapshotStore.selected = null;
            controller.pause().resume();
            assertFalse(visibleText(activity, "SDU → VIX"));
        }
    }

    @Test public void staleCardCannotOpenReplacementWithReusedIdsAndTimestamps() throws Exception {
        long now = System.currentTimeMillis();
        putSnapshot("REPORTING", "leg-a", "leg-b", now, now + 60_000, FIRST_ROUTE, SECOND_ROUTE);
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            MainActivity activity = controller.get();
            View previousCard = scheduleCard(activity, 1);
            putSnapshot("REPORTING", "leg-a", "leg-b", now, now + 60_000,
                    "CGH → SDU", "SDU → VIX");
            assertTrue(previousCard.performClick());
            assertTrue(visibleText(activity, SCHEDULE));
            assertFalse(visibleText(activity, "DETALHE DA ETAPA"));
            assertFalse(visibleText(activity, SECOND_ROUTE));

            assertTrue(scheduleCard(activity, 1).performClick());
            assertTrue(visibleText(activity, "DETALHE DA ETAPA"));
            assertTrue(visibleText(activity, "SDU → VIX"));
            assertFalse(visibleText(activity, "CGH → SDU"));
        }
    }

    @Test public void storeUpdateClosesDetailAndRecoversWhenTheCacheIsRemoved() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            MainActivity activity = controller.get();
            assertTrue(scheduleCard(activity, 1).performClick());
            assertTrue(visibleText(activity, "DETALHE DA ETAPA"));
            var preferences = activity.getSharedPreferences("crewcheck_watch_secure", Context.MODE_PRIVATE);

            // The saved envelope can change before the receiver tells us who supplied it.
            preferences.edit().putString("snapshot_payload_v1", "synthetic-update").apply();
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(150));
            assertTrue(visibleText(activity, SCHEDULE));
            assertFalse(visibleText(activity, "DETALHE DA ETAPA"));

            assertTrue(scheduleCard(activity, 1).performClick());
            FixtureSnapshotStore.selected = null;
            preferences.edit().remove("snapshot_payload_v1").apply();
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(150));
            assertTrue(visibleText(activity, SCHEDULE));
            assertFalse(visibleText(activity, SECOND_ROUTE));
        }
    }

    @Test public void titleWithoutAnyDetailRemainsAReadOnlyRow() throws Exception {
        putLive("REPORTING", "leg-a", "leg-b");
        JSONObject data = FixtureSnapshotStore.selected.toJson();
        data.getJSONArray("schedule").put(0, new JSONObject()
                .put("id", "leg-a").put("title", FLIGHT).put("kind", "flight"));
        FixtureSnapshotStore.selected = WatchContextSnapshot.fromJson(data);
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
            assertFalse(scheduleCard(controller.get(), 0).performClick());
            assertTrue(scheduleCard(controller.get(), 1).performClick());
        }
    }

    @Test public void eligibleRowsHaveReachableTouchTargetsOnSmallRoundDisplays() throws Exception {
        for (int size : new int[]{192, 227}) {
            RuntimeEnvironment.setQualifiers("w" + size + "dp-h" + size + "dp-round-mdpi");
            for (float font : new float[]{1f, 1.5f, 2f}) {
                RuntimeEnvironment.setFontScale(font);
                putLive("REPORTING", "leg-a", "leg-b");
                try (ActivityController<MainActivity> controller =
                             Robolectric.buildActivity(MainActivity.class, scheduleIntent()).setup()) {
                    MainActivity activity = controller.get();
                    ScrollView scroll = viewport(activity);
                    int constraint = View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY);
                    scroll.measure(constraint, constraint);
                    scroll.layout(0, 0, size, size);
                    LinearLayout second = scheduleCard(activity, 1);
                    assertTrue("card is clickable at " + size + " dp / font " + font,
                            second.isClickable());
                    assertTrue("card exposes a 48 dp target", second.getHeight() >= 48);
                    assertTrue(scroll.isVerticalScrollBarEnabled());
                    assertTrue(second.performClick());
                    scroll.measure(constraint, constraint);
                    scroll.layout(0, 0, size, size);
                    TextView missingGate = button(activity, "Portão ainda não informado para este trecho.");
                    assertNotNull(missingGate.getLayout());
                    for (int line = 0; line < missingGate.getLineCount(); line++) {
                        assertEquals("detail remains readable at " + size + " dp / font " + font,
                                0, missingGate.getLayout().getEllipsisCount(line));
                    }
                }
            }
        }
    }

    private static Intent scheduleIntent() {
        return new Intent(RuntimeEnvironment.getApplication(), MainActivity.class)
                .putExtra("crewcheck_screen", "schedule");
    }

    private static void putLive(String state, String firstId, String secondId) throws Exception {
        long now = System.currentTimeMillis();
        putSnapshot(state, firstId, secondId, now - 1, now + 60_000, FIRST_ROUTE, SECOND_ROUTE);
    }

    private static void putSnapshot(String state, String firstId, String secondId, long generated,
                                    long expiry, String firstRoute, String secondRoute) throws Exception {
        JSONArray rows = new JSONArray()
                .put(row(firstId, firstRoute, "08:20", "Ter, 24/11 • BRT"))
                .put(row(secondId, secondRoute, "09:45", "Qua, 25/11 • BRT"));
        FixtureSnapshotStore.selected = WatchContextSnapshot.fromJson(new JSONObject()
                .put("schemaVersion", 1).put("contextId", "current-context")
                .put("generatedAtEpochMs", generated).put("validUntilEpochMs", expiry)
                .put("state", state).put("gate", GLOBAL_GATE).put("gateSource", "radar")
                .put("schedule", rows));
    }

    private static JSONObject row(String id, String route, String time, String date) throws Exception {
        return new JSONObject().put("id", id).put("kind", "flight").put("title", FLIGHT)
                .put("route", route).put("time", time).put("detail", date);
    }

    private static ScrollView viewport(MainActivity activity) {
        View root = activity.findViewById(android.R.id.content);
        assertTrue(root instanceof ViewGroup);
        View scroll = ((ViewGroup) root).getChildAt(0);
        assertTrue(scroll instanceof ScrollView);
        return (ScrollView) scroll;
    }

    private static boolean visibleText(MainActivity activity, String expected) {
        return contains(viewport(activity), expected);
    }

    private static boolean contains(View view, String expected) {
        if (view.getVisibility() != View.VISIBLE) return false;
        if (view instanceof TextView label && label.getText().toString().contains(expected)) return true;
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) {
                if (contains(group.getChildAt(i), expected)) return true;
            }
        }
        return false;
    }

    private static TextView button(MainActivity activity, String text) {
        List<TextView> matches = labels(viewport(activity), text);
        assertEquals("unique label: " + text, 1, matches.size());
        return matches.get(0);
    }

    private static LinearLayout scheduleCard(MainActivity activity, int index) {
        ScrollView scroll = viewport(activity);
        View content = scroll.getChildAt(0);
        List<TextView> titles = labels(scroll, FLIGHT);
        assertEquals("each occurrence is shown separately", 2, titles.size());
        View card = titles.get(index);
        while (card.getParent() instanceof View parent && parent != content) {
            card = parent;
        }
        assertTrue(card instanceof LinearLayout);
        return (LinearLayout) card;
    }

    private static List<TextView> labels(View root, String search) {
        List<TextView> result = new ArrayList<>();
        collectLabels(root, search, result);
        return result;
    }

    private static void collectLabels(View view, String search, List<TextView> result) {
        if (view.getVisibility() != View.VISIBLE) return;
        if (view instanceof TextView label && label.getText().toString().equals(search)) result.add(label);
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) {
                collectLabels(group.getChildAt(i), search, result);
            }
        }
    }
}
