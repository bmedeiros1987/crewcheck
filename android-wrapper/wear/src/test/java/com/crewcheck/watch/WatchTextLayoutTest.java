package com.crewcheck.watch;

import android.text.Layout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.fragment.app.FragmentActivity;
import androidx.wear.ambient.AmbientModeSupport;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.Assert.*;

/** Measures Android TextViews at onCreate; device-only ambient lifecycle is not exercised. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "w192dp-h192dp-round-mdpi",
        shadows = WatchTextLayoutTest.NoDeviceAmbient.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class WatchTextLayoutTest {
    @Implements(AmbientModeSupport.class)
    public static class NoDeviceAmbient {
        @Implementation
        protected static AmbientModeSupport.AmbientController attach(FragmentActivity activity) {
            return null;
        }
    }
    private static final String LONG_TEXT =
            "Apresentação São José dos Campos — conexão internacional alterada";

    @Test public void longOperationalTextAndButtonsFitSmallRoundScreens() throws Exception {
        for (float scale : new float[]{1f, 1.3f, 1.5f}) {
            RuntimeEnvironment.setFontScale(scale);
            try (ActivityController<MainActivity> controller =
                         Robolectric.buildActivity(MainActivity.class).create()) {
                MainActivity activity = controller.get();
                ScrollView scroll = field(activity, "scroll", ScrollView.class);
                LinearLayout content = field(activity, "content", LinearLayout.class);
                measure(scroll, 192);
                for (String state : new String[]{"CHANGED", "OVERNIGHT", "REPORTING", "CONNECTION"}) {
                    JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
                    json.put("state", state).put("headline", LONG_TEXT)
                            .put("detail", LONG_TEXT).put("overnight", LONG_TEXT)
                            .put("connection", LONG_TEXT).put("presentationPlace", LONG_TEXT);
                    WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(json.toString());
                    content.removeAllViews();
                    call(activity, "renderHeader", new Class[]{WatchContextSnapshot.class}, snapshot);
                    call(activity, "renderLiveState", new Class[]{WatchContextSnapshot.class, long.class},
                            snapshot, System.currentTimeMillis());
                    call(activity, "addNavigation", new Class[]{WatchContextSnapshot.class}, snapshot);
                    measure(scroll, 192);
                    assertFits(content);
                }
                content.removeAllViews();
                TextView text = (TextView) call(activity, "text",
                        new Class[]{String.class, int.class, int.class, boolean.class, int.class},
                        LONG_TEXT + " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 23,
                        android.graphics.Color.WHITE, true, android.view.Gravity.CENTER);
                content.addView(text);
                measure(scroll, 192);
                assertFits(content);
                assertTrue("long text wraps", text.getLineCount() > 2);
                assertEquals("full text remains reachable by scrolling", text.length(),
                        text.getLayout().getLineEnd(text.getLineCount() - 1));
                assertEquals("requested font scale", scale,
                        activity.getResources().getConfiguration().fontScale, .01f);
                assertEquals("SP conversion preserves Android's accessible font scaling",
                        android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP,
                                23, activity.getResources().getDisplayMetrics()), text.getTextSize(), .01f);
            }
        }
    }

    // Gate fields on small and large watches with the longest gate and a full 96-character detail.
    private static final String REPORTED_DETAIL = ("Embarcando · " + LONG_TEXT + " · " + LONG_TEXT).substring(0, 96);

    @Test public void reportedGateFitsLiveAndAmbientOnSmallAndLargeRoundScreens() throws Exception {
        for (int size : new int[]{192, 227}) {
            RuntimeEnvironment.setQualifiers("w" + size + "dp-h" + size + "dp-round-mdpi");
            for (float scale : new float[]{1f, 1.3f, 1.5f}) {
                RuntimeEnvironment.setFontScale(scale);
                try (ActivityController<MainActivity> controller =
                             Robolectric.buildActivity(MainActivity.class).create()) {
                    MainActivity activity = controller.get();
                    ScrollView scroll = field(activity, "scroll", ScrollView.class);
                    LinearLayout content = field(activity, "content", LinearLayout.class);
                    measure(scroll, size);
                    for (String state : new String[]{"BOARDING", "REPORTING", "CONNECTION", "CHANGED"}) {
                        JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
                        json.put("state", state).put("gate", "B123").put("remoteStand", false)
                                .put("detail", REPORTED_DETAIL).put("nextDetail", "GRU → SSA • PB123 • 09:30");
                        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(json.toString());
                        content.removeAllViews();
                        call(activity, "renderHeader", new Class[]{WatchContextSnapshot.class}, snapshot);
                        call(activity, "renderLiveState", new Class[]{WatchContextSnapshot.class, long.class},
                                snapshot, System.currentTimeMillis());
                        call(activity, "addNavigation", new Class[]{WatchContextSnapshot.class}, snapshot);
                        measure(scroll, size);
                        assertFits(content);
                        content.removeAllViews();
                        call(activity, "renderAmbient", new Class[]{WatchContextSnapshot.class, long.class},
                                snapshot, System.currentTimeMillis());
                        measure(scroll, size);
                        assertFits(content);
                        int available = scroll.getHeight() - scroll.getPaddingTop() - scroll.getPaddingBottom();
                        View last = content.getChildAt(content.getChildCount() - 1);
                        assertTrue("reported gate ambient fits without scrolling at " + size + "/" + scale + "/" + state,
                                last.getBottom() <= available);
                    }
                }
            }
        }
        ComplicationRendering gate = ComplicationText.gate(
                WatchContextSnapshot.fromJson(WatchContextSnapshot.demo(System.currentTimeMillis()).toJson()
                        .put("gate", "B123").put("remoteStand", false).toString()), System.currentTimeMillis());
        assertTrue("gate complication short text fits", gate.shortText.length() <= 7);
    }

    @Test @Config(qualifiers = "w227dp-h227dp-round-mdpi")
    public void scheduleRowsAndNavigationFitLargerWatchAtEnlargedFont() throws Exception {
        RuntimeEnvironment.setFontScale(1.5f);
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity = controller.get();
            ScrollView scroll = field(activity, "scroll", ScrollView.class);
            LinearLayout content = field(activity, "content", LinearLayout.class);
            measure(scroll, 227);
            content.removeAllViews();
            JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
            for (int i = 0; i < json.getJSONArray("schedule").length(); i++) {
                json.getJSONArray("schedule").getJSONObject(i)
                        .put("title", LONG_TEXT).put("route", LONG_TEXT);
            }
            WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(json.toString());
            call(activity, "renderSchedule", new Class[]{WatchContextSnapshot.class, long.class},
                    snapshot, System.currentTimeMillis());
            call(activity, "addNavigation", new Class[]{WatchContextSnapshot.class}, snapshot);
            measure(scroll, 227);
            assertFits(content);
            assertTrue("content can scroll within safe viewport", content.getHeight()
                    > scroll.getHeight() - scroll.getPaddingTop() - scroll.getPaddingBottom());
        }
    }

    @Test public void compactAmbientFitsWithoutInteractiveScrolling() throws Exception {
        assertAmbientFitsAtEveryFontSize(192);
    }

    @Test @Config(qualifiers = "w227dp-h227dp-round-mdpi")
    public void ambientDetailsRespectVerticalBudgetAtColumnThreshold() throws Exception {
        assertAmbientFitsAtEveryFontSize(227);
    }

    private static void assertAmbientFitsAtEveryFontSize(int size) throws Exception {
        for (float scale : new float[]{1f, 1.2f, 1.3f, 1.5f, 2f}) {
            RuntimeEnvironment.setFontScale(scale);
            try (ActivityController<MainActivity> controller =
                         Robolectric.buildActivity(MainActivity.class).create()) {
                MainActivity activity = controller.get();
                ScrollView scroll = field(activity, "scroll", ScrollView.class);
                LinearLayout content = field(activity, "content", LinearLayout.class);
                measure(scroll, size);
                content.removeAllViews();
                JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
                json.put("state", "CHANGED").put("headline", LONG_TEXT).put("gate", "B123");
                call(activity, "renderAmbient", new Class[]{WatchContextSnapshot.class, long.class},
                        WatchContextSnapshot.fromJson(json.toString()), System.currentTimeMillis());
                measure(scroll, size);
                assertFits(content);
                int available = scroll.getHeight() - scroll.getPaddingTop() - scroll.getPaddingBottom();
                View last = content.getChildAt(content.getChildCount() - 1);
                assertTrue("ambient fits without scrolling at " + size + "/" + scale,
                        last.getBottom() <= available);
                TextView clock = field(activity, "ambientClockView", TextView.class);
                assertEquals(1, clock.getLineCount());
                assertEquals(0, clock.getLayout().getEllipsisCount(0));
            }
        }
    }

    @Test public void staleScheduleHidesOperationalRows() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity = controller.get();
            LinearLayout content = field(activity, "content", LinearLayout.class);
            content.removeAllViews();
            long now = System.currentTimeMillis();
            WatchContextSnapshot snapshot = WatchContextSnapshot.demo(now - 7_200_000L);
            call(activity, "renderSchedule", new Class[]{WatchContextSnapshot.class, long.class}, snapshot, now);
            assertEquals("Only title, subtitle and sync instruction; no stale gate rows", 3, content.getChildCount());
            assertTrue(((TextView) content.getChildAt(2)).getText().toString().contains("Sincronize"));
        }
    }

    @Test public void scheduleDisplaysProducerDateAndZone() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity = controller.get();
            LinearLayout content = field(activity, "content", LinearLayout.class);
            content.removeAllViews();
            long now = System.currentTimeMillis();
            JSONObject json = WatchContextSnapshot.demo(now).toJson();
            json.getJSONArray("schedule").getJSONObject(0).put("detail", "19/10 BRT").put("presentation", "18/10 23:18");
            call(activity, "renderSchedule", new Class[]{WatchContextSnapshot.class, long.class}, WatchContextSnapshot.fromJson(json.toString()), now);
            assertTrue(allText(content).contains("19/10 BRT"));
            assertTrue(allText(content).contains("18/10 23:18"));
        }
    }
    private static String allText(View view) {
        if (view instanceof TextView) return ((TextView) view).getText().toString();
        String result = "";
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) result += allText(((ViewGroup) view).getChildAt(i));
        return result;
    }

    @Test public void reportingKeepsDateAndEstimatedBoardingVisible() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity = controller.get();
            JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
            json.put("state", "REPORTING").put("detail", "Embarque previsto 18/10 23:25 BRT")
                    .put("presentationPlace", "GRU • 18/10 • escala BRT");
            Object primary = call(activity, "primaryFor", new Class[]{WatchContextSnapshot.class}, WatchContextSnapshot.fromJson(json.toString()));
            String combined = "";
            for (Field f : primary.getClass().getDeclaredFields()) {
                f.setAccessible(true);
                if (f.getType() == String.class) combined += f.get(primary);
            }
            assertTrue(combined.contains("18/10"));
            assertTrue(combined.contains("Embarque previsto"));
        }
    }

    @Test public void staleNowCardContainsNoExpiredOperationalFacts() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity = controller.get();
            LinearLayout content = field(activity, "content", LinearLayout.class);
            content.removeAllViews();
            long now = System.currentTimeMillis();
            JSONObject json = WatchContextSnapshot.demo(now - 7_200_000L).toJson();
            json.put("gate", "B123").put("presentationTime", "18:20").put("boardingTime", "17:40");
            call(activity, "renderLiveState", new Class[]{WatchContextSnapshot.class, long.class}, WatchContextSnapshot.fromJson(json.toString()), now);
            String text = allText(content);
            assertTrue(text.contains("Dados vencidos"));
            assertFalse(text.contains("B123"));
            assertFalse(text.contains("18:20"));
            assertFalse(text.contains("17:40"));
        }
    }

    @Test public void compactAmbientDistinguishesApzFromLeaveTime() throws Exception {
        for (float scale : new float[]{1f, 1.5f, 2f}) {
            RuntimeEnvironment.setFontScale(scale);
            try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create()) {
                MainActivity activity = controller.get();
                ScrollView scroll = field(activity, "scroll", ScrollView.class);
                LinearLayout content = field(activity, "content", LinearLayout.class);
                measure(scroll, 192);
                for (String state : new String[]{"REPORTING", "LEAVE_SOON"}) {
                    content.removeAllViews();
                    JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
                    json.put("state", state).put("presentationTime", "18:20").put("leaveTime", "18:20").put("primaryTime", "18:20");
                    call(activity, "renderAmbient", new Class[]{WatchContextSnapshot.class, long.class}, WatchContextSnapshot.fromJson(json.toString()), System.currentTimeMillis());
                    measure(scroll, 192);
                    assertTrue(allText(content).contains(state.equals("REPORTING") ? "APZ 18:20" : "SAIR 18:20"));
                    assertFits(content);
                    assertTrue(content.getHeight() <= scroll.getHeight() - scroll.getPaddingTop() - scroll.getPaddingBottom());
                }
            }
        }
    }

    private static void measure(ScrollView scroll, int size) {
        int spec = View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY);
        scroll.measure(spec, spec);
        scroll.layout(0, 0, size, size);
        // onLayout installs padding and rebuilds responsive rows once size is known.
        scroll.measure(spec, spec);
        scroll.layout(0, 0, size, size);
    }

    private static void assertFits(View view) {
        if (view instanceof TextView) {
            TextView text = (TextView) view;
            Layout layout = text.getLayout();
            assertNotNull("TextView has been measured", layout);
            for (int i = 0; i < layout.getLineCount(); i++) {
                assertTrue("line wider than layout: " + text.getText() + " (" + layout.getLineMax(i) + "/" + layout.getWidth() + ")",
                        layout.getLineMax(i) <= layout.getWidth() + 1);
            }
            assertTrue("text has enough vertical space", layout.getHeight()
                    <= text.getHeight() - text.getCompoundPaddingTop() - text.getCompoundPaddingBottom());
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View child = group.getChildAt(i);
                assertTrue("child exceeds parent's right edge", child.getRight() <= group.getWidth());
                assertTrue("child exceeds parent's left edge", child.getLeft() >= 0);
                assertFits(child);
            }
        }
    }

    private static <T> T field(Object object, String name, Class<T> type) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return type.cast(field.get(object));
    }

    private static Object call(Object object, String name, Class<?>[] types, Object... args) throws Exception {
        Method method = MainActivity.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(object, args);
    }
}
