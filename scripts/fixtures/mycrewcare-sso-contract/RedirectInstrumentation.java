package lab.mcc;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewBuilder;
import com.crewcheck.app.CrewCheckMyCrewCareProfile;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Isolated real-Profile/browser mechanics, NOT SAML, CrewCheck login or operational import. */
@WebViewBuilder.Experimental
public final class RedirectInstrumentation extends Instrumentation {
    private static final String A = "synthetic-lab-account-A";
    private static final String B = "synthetic-lab-account-B";
    private static final String PAGE = "<html><head><link rel='icon' href='data:,'></head><body>synthetic</body></html>";
    private final CrewCheckMyCrewCareProfile profiles = new CrewCheckMyCrewCareProfile();
    private final List<WebView> views = new ArrayList<>();
    private LabActivity activity;
    private LoopbackFixture server;
    private LabTerminalGate suite;
    private String stage = "setup";
    private int checks;

    @Override public void onCreate(Bundle ignored) { super.onCreate(ignored); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        boolean complete = false;
        boolean cleaned = false;
        suite = new LabTerminalGate(now() + 120000);
        try {
            Intent intent = new Intent(getTargetContext(), LabActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = (LabActivity) startActivitySync(intent);
            ui(() -> activity.onCancellation(() -> suite.cancel()));
            AtomicReference<Boolean> supported = new AtomicReference<>(false);
            ui(() -> supported.set(profiles.isSupported()));
            require(supported.get(), "isolated-profile-unavailable"); // Never skip as PASS.
            clear(A); clear(B); // Known empty baseline, real callbacks.
            server = new LoopbackFixture();
            PackageInfo webview = WebView.getCurrentWebViewPackage();
            result.putString("webview", webview == null ? "unavailable" : webview.packageName + "/" + webview.versionName);
            result.putInt("androidApi", Build.VERSION.SDK_INT);
            result.putString("profileSourceSha256", BuildConfig.PROFILE_SOURCE_SHA256);

            stage = "302-browser-chain";
            WebView a = create(A);
            chain(a, 302, "", "A");
            require("\"synthetic-view-only\"".equals(script(a, "sessionStorage.getItem('fixture')")), "initial-session-storage");
            ui(() -> profiles.flush(A));
            destroy(a);

            stage = "profile-a-recreated";
            a = create(A);
            probe(a, "/recreated-a", "fixture=A", null);
            require("null".equals(script(a, "sessionStorage.getItem('fixture')")), "session-storage-was-not-view-local");
            // Cookie continuity is observed on HTTP, never copied/exported through CookieManager.

            stage = "profile-b-isolated";
            WebView b = create(B);
            probe(b, "/empty-b", "", "B");
            probe(b, "/cookie-b", "fixture=B", null);
            require("null".equals(script(b, "sessionStorage.getItem('fixture')")), "b-session-storage-leak");
            destroy(b);

            stage = "307-preserves-post";
            chain(a, 307, "fixture=A", null);
            stage = "308-preserves-post";
            chain(a, 308, "fixture=A", null);
            destroy(a);

            stage = "real-clear-a-preserves-b";
            clear(A);
            a = create(A);
            probe(a, "/cleared-a", "", null);
            require("null".equals(script(a, "sessionStorage.getItem('fixture')")), "cleared-a-session-storage");
            b = create(B);
            probe(b, "/preserved-b", "fixture=B", null);
            destroy(b);

            stage = "cancel-late-browser-and-cleanup";
            LabTerminalGate cancelled = new LabTerminalGate(now() + 10000);
            server.expect(exchange("GET", "/cancel-late", "", "", 200, null, null, PAGE, 200));
            Navigation cancelNavigation = begin(a, "/cancel-late", "/cancel-late", cancelled);
            cancelled.cancel();
            await(cancelNavigation);
            clear(A, cancelled); // Actual cleanup callback is late relative to cancellation.
            require(!cancelled.publish(now()) && cancelled.state() == LabTerminalGate.State.CANCELLED, "cancel-published");
            destroy(a);

            stage = "timeout-late-browser-and-cleanup";
            a = create(A);
            LabTerminalGate timedOut = new LabTerminalGate(now() + 30);
            server.expect(exchange("GET", "/timeout-late", "", "", 200, null, null, PAGE, 200));
            await(begin(a, "/timeout-late", "/timeout-late", timedOut));
            clear(A, timedOut);
            require(!timedOut.publish(now()) && timedOut.state() == LabTerminalGate.State.TIMED_OUT, "timeout-published");
            destroy(a);
            server.awaitDrained(5000);
            require(server.received() == 16, "unexpected-exchange-count");
            suite.browserComplete(now());
            require(!suite.publish(now()), "pass-before-final-cleanup");
            complete = true;
        } catch (Throwable failure) {
            suite.fail();
            result.putString("failure", failure.getClass().getSimpleName());
        } finally {
            // Best effort for EVERY view/profile; one failure must not skip the other profile.
            Throwable cleanupError = null;
            for (WebView view : new ArrayList<>(views)) {
                try { destroy(view); } catch (Throwable error) { cleanupError = error; }
            }
            if (activity != null) {
                try { clear(A); } catch (Throwable error) { cleanupError = error; }
                try { clear(B); } catch (Throwable error) { cleanupError = error; }
                cleaned = cleanupError == null;
            }
            if (cleanupError != null) {
                suite.fail();
                result.putString("cleanupFailure", cleanupError.getClass().getSimpleName());
            }
            try {
                if (server != null) {
                    server.close();
                    server.assertDrained(); // Includes errors/extra requests arriving during cleanup.
                    require(server.received() == 16, "final-exchange-count");
                }
            } catch (Throwable failure) { suite.fail(); result.putString("serverFailure", failure.getClass().getSimpleName()); }
        }
        suite.cleanupComplete(now(), cleaned);
        boolean passed = complete && suite.publish(now());
        result.putString("result", passed ? "PASS: synthetic real-Profile browser mechanics only" : "FAIL: no login/session claim");
        result.putString("stage", stage);
        result.putString("terminal", suite.state().name());
        result.putInt("checks", checks);
        if (activity != null) ui(() -> activity.finish());
        finish(passed ? -1 : 0, result);
    }

    private void chain(WebView view, int status, String initialCookie, String setCookie) throws Exception {
        String suffix = Integer.toString(status);
        String cookie = setCookie == null ? initialCookie : "fixture=" + setCookie;
        String form = "<html><head><link rel='icon' href='data:,'></head><body><form method='POST' action='/acs" + suffix
                + "'><input name='fixture' value='synthetic'></form><script>sessionStorage.setItem('fixture','synthetic-view-only');document.forms[0].submit()</script></body></html>";
        server.expect(exchange("GET", "/start" + suffix, "", initialCookie, 200, null, setCookie, form, 0));
        server.expect(exchange("POST", "/acs" + suffix, LoopbackFixture.FORM_BODY, cookie, status, "/return" + suffix, null, PAGE, 0));
        server.expect(exchange(status == 302 ? "GET" : "POST", "/return" + suffix,
                status == 302 ? "" : LoopbackFixture.FORM_BODY, cookie, 200, null, null, PAGE, 0));
        await(begin(view, "/start" + suffix, "/return" + suffix, null));
        server.awaitDrained(5000);
        checks++;
    }
    private void probe(WebView view, String path, String cookie, String setCookie) throws Exception {
        server.expect(exchange("GET", path, "", cookie, 200, null, setCookie, PAGE, 0));
        await(begin(view, path, path, null));
        server.awaitDrained(5000);
        checks++;
    }
    private static LoopbackFixture.Exchange exchange(String method, String path, String body, String cookie,
            int status, String location, String setCookie, String html, long delay) {
        return new LoopbackFixture.Exchange(method, path, body, cookie, status, location, setCookie, html, delay);
    }
    private WebView create(String account) {
        AtomicReference<WebView> result = new AtomicReference<>();
        ui(() -> {
            WebView view = profiles.create(activity, account);
            views.add(view); // Track before any subsequent setup can throw.
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setDomStorageEnabled(true);
            view.getSettings().setAllowFileAccess(false);
            view.getSettings().setAllowContentAccess(false);
            activity.attach(view); result.set(view);
        });
        return result.get();
    }
    private void destroy(WebView view) {
        ui(() -> {
            if (!views.contains(view)) return;
            Throwable error = null;
            try { view.stopLoading(); } catch (Throwable failure) { error = failure; }
            try { activity.detach(view); } catch (Throwable failure) { error = failure; }
            try { view.destroy(); } catch (Throwable failure) { error = failure; }
            views.remove(view);
            if (error != null) throw new AssertionError("view-destruction-failed", error);
        });
    }
    private Navigation begin(WebView view, String start, String end, LabTerminalGate gate) {
        Navigation navigation = new Navigation();
        final String target = server.origin() + end;
        ui(() -> {
            view.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView ignored, String url) {
                    if (!target.equals(url)) return;
                    if (gate != null) gate.browserComplete(now());
                    navigation.done.countDown();
                }
                @Override public void onReceivedError(WebView ignored, WebResourceRequest request, WebResourceError error) {
                    navigation.error.set(new AssertionError("browser-error"));
                    navigation.done.countDown();
                }
            });
            view.loadUrl(server.origin() + start); // Initial GET only; never called from a redirect/POST callback.
        });
        return navigation;
    }
    private void await(Navigation navigation) throws Exception {
        require(navigation.done.await(15000, TimeUnit.MILLISECONDS), "browser-timeout");
        if (navigation.error.get() != null) throw new AssertionError("browser-error", navigation.error.get());
        if (server.failure() != null) throw new AssertionError("fixture-error", server.failure());
    }
    private String script(WebView view, String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        ui(() -> view.evaluateJavascript(expression, result -> { value.set(result); done.countDown(); }));
        require(done.await(5, TimeUnit.SECONDS), "script-timeout");
        return value.get();
    }
    private void clear(String account) throws Exception { clear(account, null); }
    private void clear(String account, LabTerminalGate gate) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Boolean> success = new AtomicReference<>(false);
        AtomicInteger callbacks = new AtomicInteger();
        ui(() -> profiles.clear(activity, account, (ok, code) -> {
            callbacks.incrementAndGet(); success.set(ok);
            if (gate != null) gate.cleanupComplete(now(), ok);
            done.countDown();
        }));
        require(done.await(10, TimeUnit.SECONDS), "profile-cleanup-timeout");
        require(callbacks.get() == 1 && success.get(), "profile-cleanup-failed");
    }
    private void ui(Runnable action) {
        AtomicReference<Throwable> error = new AtomicReference<>();
        runOnMainSync(() -> { try { action.run(); } catch (Throwable failure) { error.set(failure); } });
        if (error.get() != null) throw new AssertionError("ui-operation-failed", error.get());
    }
    private void require(boolean condition, String code) {
        if (!condition) throw new AssertionError(code);
        checks++;
    }
    private static long now() { return SystemClock.elapsedRealtime(); }
    private static final class Navigation {
        final CountDownLatch done = new CountDownLatch(1);
        final AtomicReference<Throwable> error = new AtomicReference<>();
    }
}
