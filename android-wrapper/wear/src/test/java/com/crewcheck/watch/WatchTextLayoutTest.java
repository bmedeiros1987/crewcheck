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
        RuntimeEnvironment.setFontScale(1.5f);
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity = controller.get();
            ScrollView scroll = field(activity, "scroll", ScrollView.class);
            LinearLayout content = field(activity, "content", LinearLayout.class);
            measure(scroll, 192);
            content.removeAllViews();
            JSONObject json = WatchContextSnapshot.demo(System.currentTimeMillis()).toJson();
            json.put("state", "CHANGED").put("headline", LONG_TEXT);
            call(activity, "renderAmbient", new Class[]{WatchContextSnapshot.class, long.class},
                    WatchContextSnapshot.fromJson(json.toString()), System.currentTimeMillis());
            measure(scroll, 192);
            assertFits(content);
            int available = scroll.getHeight() - scroll.getPaddingTop() - scroll.getPaddingBottom();
            View last = content.getChildAt(content.getChildCount() - 1);
            assertTrue("ambient data fits without scrolling", last.getBottom() <= available);
            TextView clock = field(activity, "ambientClockView", TextView.class);
            assertEquals(1, clock.getLineCount());
            assertEquals(0, clock.getLayout().getEllipsisCount(0));
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
