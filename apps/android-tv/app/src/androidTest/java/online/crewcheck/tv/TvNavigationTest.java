package online.crewcheck.tv;

import android.app.Instrumentation;
import androidx.test.rule.ActivityTestRule;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs against the installed demo APK in an Android TV emulator. */
@RunWith(AndroidJUnit4.class)
public final class TvNavigationTest {
    @Rule public ActivityTestRule<TvActivity> activityRule = new ActivityTestRule<>(TvActivity.class);
    private TvActivity getActivity() { return activityRule.getActivity(); }
    private Instrumentation getInstrumentation() { return InstrumentationRegistry.getInstrumentation(); }

    private String evaluate(String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        TvActivity activity = getActivity();
        getInstrumentation().runOnMainSync(() -> {
            ViewGroup content = activity.findViewById(android.R.id.content);
            ((WebView) content.getChildAt(0)).evaluateJavascript(script, value -> {
                result.set(value);
                done.countDown();
            });
        });
        assertTrue("WebView did not answer", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitText(String text) throws Exception {
        for (int attempt = 0; attempt < 60; attempt++) {
            if (evaluate("document.body.innerText").contains(text)) return;
            Thread.sleep(250);
        }
        fail("Missing visible text: " + text + "; body=" + evaluate("document.body.innerText"));
    }

    private void assertLayoutFits() throws Exception {
        String geometry = "JSON.stringify({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollHeight,footer:document.querySelector('footer')?.getBoundingClientRect().top})";
        String fits = "(() => {const f=document.querySelector('footer').getBoundingClientRect();const c=document.querySelector('.live,.calendar').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+2 && document.documentElement.scrollHeight<=innerHeight+2 && c.bottom<=f.top+2 && f.bottom<=innerHeight+2;})()";
        assertEquals("TV layout clipped or overlapping: " + evaluate(geometry), "true", evaluate(fits));
        String liveFits = "(() => {const h=document.querySelector('.hero-bottom');return !h || h.getBoundingClientRect().bottom<=document.querySelector('footer').getBoundingClientRect().top;})()";
        assertEquals("Hero actions overlap ticker", "true", evaluate(liveFits));
    }

    @Test public void testDemoRemoteNavigationAndBack() throws Exception {
        awaitText("DEMONSTRA");
        awaitText("PRÓXIMA JORNADA");
        assertLayoutFits();
        // Native remote events, not DOM clicks: Agora -> Semana -> Mês.
        getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_RIGHT);
        getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_RIGHT);
        getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
        for (int attempt = 0; attempt < 40; attempt++) {
            if (evaluate("document.querySelector('nav .active')?.textContent").contains("Mês")) break;
            Thread.sleep(250);
        }
        assertTrue("D-pad must open month", evaluate("document.querySelector('nav .active')?.textContent").contains("Mês"));
        assertLayoutFits();
        getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
        awaitText("PRÓXIMA JORNADA");
        assertTrue("Back must return to Agora", evaluate("document.querySelector('nav .active')?.textContent").contains("Agora"));
        assertFalse("Back from month must not close app", getActivity().isFinishing());
    }
}
