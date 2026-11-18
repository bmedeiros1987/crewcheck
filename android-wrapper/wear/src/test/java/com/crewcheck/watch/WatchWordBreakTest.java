package com.crewcheck.watch;

import android.text.Layout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** No word is split mid-word on the smallest round screen with enlarged fonts (review:
 * "Sincroniza/r" at 192dp, fontScale 1.3). Buttons and titles: never, up to fontScale 1.5,
 * keeping the user's font whenever the word fits. Running text: checked up to 1.3; at 1.5 a
 * long word in a sentence may still wrap, as on main, rather than shrinking body text. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "w192dp-h192dp-round-mdpi", shadows = WatchTextLayoutTest.NoDeviceAmbient.class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
public class WatchWordBreakTest {
    @Test public void staleAndEmptyScreensNeverSplitAWord() throws Exception {
        for (float scale : new float[]{1f, 1.3f, 1.5f}) {
            RuntimeEnvironment.setFontScale(scale);
            try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible()) {
                MainActivity a = c.get();
                ScrollView scroll = (ScrollView) field(a, "scroll");
                LinearLayout content = (LinearLayout) field(a, "content");
                long now = System.currentTimeMillis();
                JSONObject json = WatchContextSnapshot.demo(now).toJson()
                        .put("generatedAtEpochMs", now - 3_600_000L).put("validUntilEpochMs", now - 60_000L);
                WatchContextSnapshot stale = WatchContextSnapshot.fromJson(json.toString());
                for (String screen : new String[]{"stale", "empty"}) {
                    content.removeAllViews();
                    measure(scroll);
                    call(a, "renderHeader", new Class[]{WatchContextSnapshot.class}, stale);
                    if (screen.equals("stale")) call(a, "renderLiveState", new Class[]{WatchContextSnapshot.class, long.class}, stale, now);
                    else call(a, "renderEmptyState", new Class[]{});
                    call(a, "addNavigation", new Class[]{WatchContextSnapshot.class}, stale);
                    call(a, "renderFooter", new Class[]{});
                    measure(scroll);
                    List<TextView> texts = new ArrayList<>();
                    collect(content, texts);
                    TextView sync = null;
                    float density = a.getResources().getDisplayMetrics().scaledDensity;
                    for (TextView t : texts) {
                        boolean buttonOrTitle = t.getBackground() != null || t.getTextSize() >= 16f * density;
                        if (scale > 1.3f && !buttonOrTitle) continue;
                        String split = midWordBreak(t);
                        assertNull("fontScale " + scale + " " + screen + ": \"" + t.getText() + "\" split as " + split, split);
                        if (t.getText().toString().startsWith("Sincronizar") && t.getBackground() != null && sync == null) sync = t;
                    }
                    assertNotNull(sync);
                    if (scale <= 1.3f) {
                        float expected = 13f * scale * a.getResources().getDisplayMetrics().density;
                        assertEquals("font kept at fontScale " + scale, expected, sync.getTextSize(), 0.6f);
                    }
                }
            }
        }
    }

    static String midWordBreak(TextView t) {
        Layout layout = t.getLayout();
        if (layout == null) return null;
        CharSequence text = layout.getText();
        for (int line = 0; line < layout.getLineCount() - 1; line++) {
            int end = layout.getLineEnd(line);
            if (end > 0 && end < text.length() && Character.isLetter(text.charAt(end - 1)) && Character.isLetter(text.charAt(end))) {
                return text.subSequence(layout.getLineStart(line), end) + "/" + text.subSequence(end, layout.getLineEnd(line + 1));
            }
        }
        return null;
    }

    static void collect(View v, List<TextView> out) {
        if (v instanceof TextView && v.getVisibility() == View.VISIBLE) out.add((TextView) v);
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) collect(((ViewGroup) v).getChildAt(i), out);
    }
    static void measure(ScrollView scroll) {
        int spec = View.MeasureSpec.makeMeasureSpec(192, View.MeasureSpec.EXACTLY);
        for (int i = 0; i < 2; i++) { scroll.measure(spec, spec); scroll.layout(0, 0, 192, 192); }
    }
    static Object field(Object o, String n) throws Exception { Field f = o.getClass().getDeclaredField(n); f.setAccessible(true); return f.get(o); }
    static Object call(Object o, String n, Class<?>[] types, Object... args) throws Exception {
        Method m = o.getClass().getDeclaredMethod(n, types); m.setAccessible(true); return m.invoke(o, args);
    }
}
