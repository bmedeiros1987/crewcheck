package com.crewcheck.watch;

import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** The header shows the alert count but is not a sub-48dp touch target; the list chip opens alerts. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "w192dp-h192dp-round-mdpi", shadows = WatchTextLayoutTest.NoDeviceAmbient.class)
public class WatchTouchTargetTest {
    @Test public void headerAlertBadgeIsNotASmallTouchTarget() throws Exception {
        try (ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible()) {
            MainActivity a = c.get();
            LinearLayout content = (LinearLayout) field(a, "content");
            WatchContextSnapshot snapshot = WatchContextSnapshot.demo(System.currentTimeMillis());
            assertTrue("demo carries alerts", (int) invoke(a, "alertCount", snapshot) > 0);
            content.removeAllViews();
            invoke(a, "renderHeader", snapshot);
            invoke(a, "addNavigation", snapshot);
            ScrollView scroll = (ScrollView) field(a, "scroll");
            int spec = View.MeasureSpec.makeMeasureSpec(192, View.MeasureSpec.EXACTLY);
            scroll.measure(spec, spec);
            scroll.layout(0, 0, 192, 192);
            List<View> clickable = new ArrayList<>();
            collect(content, clickable);
            boolean alertsChip = false;
            for (View v : clickable) {
                String label = v instanceof TextView ? ((TextView) v).getText().toString() : "";
                assertFalse("the count badge is not clickable: " + label, label.matches("\\d+"));
                if (label.startsWith("Alertas")) alertsChip = true;
            }
            assertTrue("alerts stay reachable through the list chip", alertsChip);
        }
    }

    static void collect(View v, List<View> out) {
        if (v.isClickable()) out.add(v);
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) collect(((ViewGroup) v).getChildAt(i), out);
    }
    static Object field(Object o, String n) throws Exception { Field f = o.getClass().getDeclaredField(n); f.setAccessible(true); return f.get(o); }
    static Object invoke(Object o, String n, Object arg) throws Exception {
        Method m = o.getClass().getDeclaredMethod(n, WatchContextSnapshot.class); m.setAccessible(true); return m.invoke(o, arg);
    }
}
