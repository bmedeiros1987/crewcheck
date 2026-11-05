package lab.mcc;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.FrameLayout;

/** Only the isolated instrumentation can launch this non-exported activity. */
public final class LabActivity extends Activity {
    private FrameLayout container;
    private Runnable cancelled = () -> {};
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        container = new FrameLayout(this);
        setContentView(container);
    }
    void attach(WebView view) { container.addView(view); }
    void detach(WebView view) { container.removeView(view); }
    void onCancellation(Runnable callback) { cancelled = callback; }
    @Override public void onBackPressed() { cancelled.run(); super.onBackPressed(); }
    @Override protected void onStop() { cancelled.run(); super.onStop(); }
}
