package com.crewcheck.watch;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Path;
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
import java.nio.file.Files;
import java.nio.file.Paths;

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

    @Test public void roundHomeMenuUsesTheDisplayAndKeepsItsLastActionReachable() throws Exception {
        for (int size : new int[]{192, 227}) {
            RuntimeEnvironment.setQualifiers("w" + size + "dp-h" + size + "dp-round-mdpi");
            for (float scale : new float[]{1f, 1.5f, 2f}) {
                RuntimeEnvironment.setFontScale(scale);
                try (ActivityController<MainActivity> controller =
                             Robolectric.buildActivity(MainActivity.class).create()) {
                    MainActivity activity = controller.get();
                    ScrollView scroll = field(activity, "scroll", ScrollView.class);
                    LinearLayout content = field(activity, "content", LinearLayout.class);
                    measure(scroll, size);
                    WatchContextSnapshot demo = WatchContextSnapshot.demo(System.currentTimeMillis());
                    call(activity, "renderSnapshot", new Class[]{WatchContextSnapshot.class}, demo);
                    measure(scroll, size);
                    TextView[] actions = menuActions(content);
                    assertTrue(actions[1].getText().toString().startsWith("Alertas · "));
                    assertTrue(actions[3].getText().toString().startsWith("Escala · "));
                    int safeInset = WatchViewport.padding(size, size, true)[0];
                    assertFits(content);
                    for (TextView action : actions) {
                        assertTrue("the menu action is reachable and at least 48 dp tall",
                                action.isClickable() && action.getHeight() >= 48);
                        assertEquals("the enlarged label is visible", 0,
                                action.getLayout().getEllipsisCount(0));
                    }
                    String name = size + "dp-font-" + scale;
                    renderMenuFrames(scroll, content, actions, size, safeInset, "menu-" + name, true);

                    assertTrue("the last menu action opens Escala", actions[3].performClick());
                    call(activity, "renderSnapshot", new Class[]{WatchContextSnapshot.class}, demo);
                    measure(scroll, size);
                    scroll.scrollTo(0, 0);
                    assertEquals("Escala keeps the original viewport", safeInset, scroll.getPaddingLeft());
                    assertTrue(scroll.getClipToPadding());
                    assertTrue(scroll.isVerticalScrollBarEnabled());
                    assertFits(content);
                    saveMenuFrame(drawRoundView(scroll, size), "escala-" + name);

                    call(activity, "showScreen", new Class[]{int.class}, 0);
                    call(activity, "renderSnapshot", new Class[]{WatchContextSnapshot.class}, demo);
                    measure(scroll, size);
                    TextView[] previous = menuActions(content);
                    restorePreviousMenuGeometry(activity, scroll, content, previous, safeInset);
                    measure(scroll, size);
                    renderMenuFrames(scroll, content, previous, size, safeInset, "reference-" + name, false);
                }
            }
        }
    }

    @Test public void roundConnectionInstructionsUseTheCircleAndStayReadable() throws Exception {
        for (int size : new int[]{192, 227}) {
            RuntimeEnvironment.setQualifiers("w" + size + "dp-h" + size + "dp-round-mdpi");
            for (float scale : new float[]{1f, 1.5f, 2f}) {
                RuntimeEnvironment.setFontScale(scale);
                try (ActivityController<MainActivity> controller =
                             Robolectric.buildActivity(MainActivity.class).create()) {
                    MainActivity activity = controller.get();
                    ScrollView scroll = field(activity, "scroll", ScrollView.class);
                    LinearLayout content = field(activity, "content", LinearLayout.class);
                    call(activity, "renderSnapshot", new Class[]{WatchContextSnapshot.class}, (Object) null);
                    measure(scroll, size);
                    LinearLayout instructions = field(activity, "connectionInstructions", LinearLayout.class);
                    TextView heading = (TextView) instructions.getChildAt(1);
                    TextView detail = (TextView) instructions.getChildAt(2);
                    assertEquals("Conecte ao CrewCheck", heading.getText().toString());
                    assertTrue(detail.getText().toString().startsWith("Abra o app no celular."));
                    assertFits(content);
                    for (TextView text : new TextView[]{heading, detail}) {
                        Layout layout = text.getLayout();
                        for (int line = 0; line < layout.getLineCount(); line++) {
                            assertEquals("instruction line keeps every character", 0, layout.getEllipsisCount(line));
                            int lineTop = content.getTop() + instructions.getTop() + text.getTop()
                                    + text.getTotalPaddingTop() + layout.getLineTop(line);
                            int lineHeight = layout.getLineBottom(line) - layout.getLineTop(line);
                            scroll.scrollTo(0, lineTop + lineHeight / 2 - size / 2);
                            int visibleLineTop = lineTop - scroll.getScrollY();
                            assertTrue("the entire instruction line can pass through the readable band",
                                    visibleLineTop >= scroll.getPaddingTop()
                                            && visibleLineTop + lineHeight <= size - scroll.getPaddingBottom());
                        }
                        assertEquals(text.length(), layout.getLineEnd(layout.getLineCount() - 1));
                    }

                    String name = "sync-" + size + "dp-font-" + scale;
                    scroll.scrollTo(0, 0);
                    saveMenuFrame(drawRoundView(scroll, size), name + "-start");

                    int oldBottom = size - scroll.getPaddingBottom();
                    int headingTop = content.getTop() + instructions.getTop() + heading.getTop();
                    int headingBottom = headingTop + heading.getHeight();
                    scroll.scrollTo(0, Math.max(0, headingBottom - oldBottom - 16));
                    int visibleTop = Math.max(oldBottom, headingTop - scroll.getScrollY());
                    int visibleBottom = Math.min(size, headingBottom - scroll.getScrollY());
                    assertTitlePassesOldCutoff(activity, scroll, instructions, size, visibleTop, visibleBottom, name);

                    TextView sync = directText(content, "Sincronizar agora");
                    assertTrue(sync.isClickable());
                    scroll.scrollTo(0, content.getTop() + sync.getTop() + sync.getHeight() / 2 - size / 2);
                    assertActionInSafeBand(scroll, content, sync, size);
                    saveMenuFrame(drawRoundView(scroll, size), name + "-middle");

                    TextView last = menuActions(content)[3];
                    scroll.scrollTo(0, content.getTop() + last.getTop() + last.getHeight() / 2 - size / 2);
                    assertActionInSafeBand(scroll, content, last, size);
                    scroll.scrollTo(0, content.getHeight());
                    assertTrue(scroll.isVerticalScrollBarEnabled());
                    saveMenuFrame(drawRoundView(scroll, size), name + "-end");
                }
            }
        }
    }

    private static TextView directText(LinearLayout content, String label) {
        for (int i = 0; i < content.getChildCount(); i++) {
            if (content.getChildAt(i) instanceof TextView text && label.contentEquals(text.getText())) return text;
        }
        throw new AssertionError("Missing action: " + label);
    }

    private static void assertTitlePassesOldCutoff(MainActivity activity, ScrollView scroll,
                                                  LinearLayout instructions, int size,
                                                  int top, int bottom, String name) throws Exception {
        Bitmap candidate = drawRoundView(scroll, size);
        Field group = MainActivity.class.getDeclaredField("connectionInstructions");
        group.setAccessible(true);
        group.set(activity, null);
        Bitmap reference;
        try {
            reference = drawRoundView(scroll, size);
        } finally {
            group.set(activity, instructions);
        }
        try {
            int addedPixels = 0;
            for (int y = top; y < bottom; y++) {
                for (int x = 0; x < size; x++) {
                    if (candidate.getPixel(x, y) != reference.getPixel(x, y)) addedPixels++;
                }
            }
            assertTrue("the physical circle exposes the heading that the square previously cut", addedPixels > 0);
            writeMenuFrame(reference, name + "-edge-reference");
            writeMenuFrame(candidate, name + "-edge");
        } finally {
            reference.recycle();
            candidate.recycle();
        }
    }

    private static void assertActionInSafeBand(ScrollView scroll, LinearLayout content, TextView action, int size) {
        int top = content.getTop() + action.getTop() - scroll.getScrollY();
        assertTrue("the action can be scrolled fully into view",
                top >= scroll.getPaddingTop() && top + action.getHeight() <= size - scroll.getPaddingBottom());
    }

    private static TextView[] menuActions(LinearLayout content) {
        String[] labels = {"Agora", "Alertas", "CrewLife", "Escala"};
        TextView[] actions = new TextView[labels.length];
        for (int i = 0; i < content.getChildCount(); i++) {
            if (!(content.getChildAt(i) instanceof TextView text) || !text.isClickable()) continue;
            for (int label = 0; label < labels.length; label++) {
                String value = text.getText().toString();
                if (value.equals(labels[label]) || value.startsWith(labels[label] + " · ")) {
                    actions[label] = text;
                }
            }
        }
        for (TextView action : actions) assertNotNull("the action exists in the rendered menu", action);
        return actions;
    }

    /** Reconstruct the previous inset and button style on the same synthetic content. */
    private static void restorePreviousMenuGeometry(MainActivity activity, ScrollView scroll,
                                                     LinearLayout content, TextView[] actions,
                                                     int safeInset) throws Exception {
        scroll.setPadding(safeInset, scroll.getPaddingTop(), safeInset, scroll.getPaddingBottom());
        scroll.setClipToPadding(true);
        for (int i = 0; i < content.getChildCount(); i++) {
            View child = content.getChildAt(i);
            LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) child.getLayoutParams();
            params.leftMargin -= safeInset;
            params.rightMargin -= safeInset;
            child.setLayoutParams(params);
        }
        for (int i = 0; i < actions.length; i++) {
            TextView action = actions[i];
            TextView previous = (TextView) call(activity, "actionChip",
                    new Class[]{String.class, int.class, boolean.class},
                    action.getText().toString(), Color.rgb(34, 211, 238), i == 0);
            previous.setMaxLines(1);
            LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) action.getLayoutParams();
            params.leftMargin = 0;
            params.rightMargin = 0;
            int index = content.indexOfChild(action);
            content.removeViewAt(index);
            content.addView(previous, index, params);
            actions[i] = previous;
        }
    }

    private static void renderMenuFrames(ScrollView scroll, LinearLayout content, TextView[] actions,
                                         int size, int safeInset, String name, boolean expanded) throws Exception {
        scroll.scrollTo(0, 0);
        saveMenuFrame(drawRoundView(scroll, size), name + "-start");
        TextView first = actions[0];
        int center = content.getTop() + first.getTop() + first.getHeight() / 2;
        scroll.scrollTo(0, center - size / 2);
        Bitmap centered = drawRoundView(scroll, size);
        try {
            int y = center - scroll.getScrollY();
            assertEquals("the menu action still has its selected fill", Color.rgb(34, 211, 238),
                    centered.getPixel(safeInset + 4, y));
            assertEquals("the fill extends into the usable circle only in the candidate", expanded,
                    centered.getPixel(safeInset - 4, y) == Color.rgb(34, 211, 238));
            writeMenuFrame(centered, name + "-middle");
        } finally {
            centered.recycle();
        }
        TextView last = actions[3];
        scroll.scrollTo(0, content.getTop() + last.getTop() + last.getHeight() / 2 - size / 2);
        assertActionInSafeBand(scroll, content, last, size);
        scroll.scrollTo(0, content.getHeight());
        saveMenuFrame(drawRoundView(scroll, size), name + "-end");
    }

    private static Bitmap drawRoundView(ScrollView scroll, int size) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Path display = new Path();
        display.addCircle(size / 2f, size / 2f, size / 2f, Path.Direction.CW);
        canvas.clipPath(display);
        canvas.translate(0, -scroll.getScrollY());
        scroll.draw(canvas);
        return bitmap;
    }

    private static void saveMenuFrame(Bitmap bitmap, String name) throws Exception {
        try {
            writeMenuFrame(bitmap, name);
        } finally {
            bitmap.recycle();
        }
    }

    private static void writeMenuFrame(Bitmap bitmap, String name) throws Exception {
        String directory = System.getenv("CREWCHECK_WEAR_CAPTURE_DIR");
        if (directory == null || directory.isBlank()) return;
        var target = Files.createDirectories(Paths.get(directory)).resolve(name + ".png");
        try (var stream = Files.newOutputStream(target)) {
            assertTrue("PNG saved", bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream));
        }
    }

    @Test public void scrollIndicatorIsEnabledWithoutReservingContentWidth() throws Exception {
        for (int size : new int[]{192, 227}) {
            RuntimeEnvironment.setQualifiers("w" + size + "dp-h" + size + "dp-round-mdpi");
            for (float scale : new float[]{1f, 1.5f, 2f}) {
                RuntimeEnvironment.setFontScale(scale);
                try (ActivityController<MainActivity> controller =
                             Robolectric.buildActivity(MainActivity.class).create()) {
                    ScrollView scroll = field(controller.get(), "scroll", ScrollView.class);
                    measure(scroll, size);
                    assertTrue("scroll affordance remains available", scroll.isVerticalScrollBarEnabled());
                    assertEquals("indicator overlays rather than shrinking content",
                            View.SCROLLBARS_INSIDE_OVERLAY, scroll.getScrollBarStyle());
                    assertTrue("indicator fades when idle", scroll.isScrollbarFadingEnabled());
                }
            }
        }
    }

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
