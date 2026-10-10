package com.crewcheck.app;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Narrow reconciliation of #872's isolated portal. Deliberately NOT wired into
 * MainActivity until authenticated identity, per-profile cookies and real-device
 * SSO/MFA/extraction are verified. A separate WebView alone does not isolate cookies.
 * No JavascriptInterface, credential collection, global preferences or cookie writes.
 */
public final class CrewCheckMyCrewCarePortal {
    public static final boolean RELEASE_ENABLED = false;
    private static final String MY_TRAVEL_URL = "https://api2.apicrewcare.com/LATAM/mytravel.aspx";
    private final Activity activity;
    private final FrameLayout root;
    private final WebView mainWebView;
    private final AuthenticationVerifier verifier;
    private WebView portal;
    private View container;
    private JSONObject request;
    private long generation;
    private long pageGeneration;
    private long deadline;
    private boolean extracting;
    private boolean connected;
    private boolean automatic;
    private String extractionScript;

    /** Must verify the provider's authenticated subject, not merely its hostname.
     * Identity proof and transportScript must run as ONE consistent DOM/session
     * snapshot; a separate asynchronous identity check is insufficient.
     * No implementation is shipped: selectors/identity proof need provider evidence.
     */
    public interface AuthenticationVerifier {
        void verifyAndExtract(WebView view, String transportScript, ProofCallback callback);
        boolean hasIsolatedProfile();
        WebView createIsolatedPortal(Activity activity);
        // Must identify active transport records only; not historical/cancelled cards.
        String transportationCardSelector();
    }
    public interface ProofCallback { void complete(String subject, boolean authenticated, boolean confirmedEmpty, String transportJson); }

    public CrewCheckMyCrewCarePortal(Activity activity, FrameLayout root, WebView mainWebView) {
        this(activity, root, mainWebView, null);
    }
    public CrewCheckMyCrewCarePortal(Activity activity, FrameLayout root, WebView mainWebView, AuthenticationVerifier verifier) {
        this.activity = activity;
        this.root = root;
        this.mainWebView = mainWebView;
        this.verifier = verifier;
    }

    /** Called only with a v2 request from the current session controller. */
    public boolean open(String requestJson, boolean automaticConsent) {
        if (!RELEASE_ENABLED || verifier == null || !verifier.hasIsolatedProfile() || !automaticConsent
                || verifier.transportationCardSelector() == null || verifier.transportationCardSelector().trim().isEmpty()) return false;
        try {
            final JSONObject next = new JSONObject(requestJson);
            JSONObject context = next.getJSONObject("context");
            for (String key : new String[] {"accountId", "rosterId", "rosterRevision", "providerSubject"}) {
                if (context.optString(key).trim().isEmpty()) return false;
            }
            if (next.optString("requestId").trim().isEmpty()) return false;
            activity.runOnUiThread(() -> {
                disconnectInternal();
                request = next;
                automatic = true;
                createAndLoad();
            });
            return true;
        } catch (Exception ignored) { return false; }
    }

    // The obsolete parameterless #872 methods fail closed if old wiring reappears.
    public void open() { }
    public void syncIfConnected() { }
    public boolean isConnected() { return connected && automatic && request != null; }
    public String statusJson() { return "{\"connected\":false,\"status\":\"disconnected\",\"requiresV2Proof\":true}"; }
    public boolean isVisible() { return container != null; }
    public void closeVisible() { cancelByUser(); }
    public void destroy() { disconnect(); }
    public void disconnect() { activity.runOnUiThread(this::disconnectInternal); }

    private void cancelByUser() {
        activity.runOnUiThread(() -> {
            try {
                if (request != null) {
                    JSONObject payload = new JSONObject();
                    payload.put("schemaVersion", 2);
                    payload.put("requestId", request.getString("requestId"));
                    payload.put("context", request.getJSONObject("context"));
                    payload.put("cancelled", true);
                    dispatch(payload, generation);
                }
            } catch (Exception ignored) { }
            disconnectInternal();
        });
    }

    private void disconnectInternal() {
        generation++;
        connected = false;
        automatic = false;
        request = null;
        destroyPortal();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createAndLoad() {
        try {
            extractionScript = "(" + readExtractionScript() + ")(" + JSONObject.quote(verifier.transportationCardSelector()) + ");";
            portal = verifier.createIsolatedPortal(activity);
            if (portal == null || portal == mainWebView) throw new IllegalStateException("isolated-profile-required");
            WebSettings settings = portal.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            final WebView current = portal;
            final long token = generation;
            current.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest resource) {
                    if (resource == null || resource.getUrl() == null || !allowedNavigation(resource.getUrl().toString())) {
                        fail(token, "blocked-navigation"); return true;
                    }
                    return false;
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (!allowedNavigation(url)) { fail(token, "blocked-navigation"); return true; }
                    return false;
                }
                @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    if (!active(current, token)) return;
                    pageGeneration++;
                    connected = false;
                    extracting = false;
                    if (!allowedNavigation(url)) fail(token, "blocked-navigation");
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if (!active(current, token)) return;
                    if (isTravelUrl(url)) {
                        deadline = android.os.SystemClock.elapsedRealtime() + 10_000L;
                        poll(current, token);
                    } else { connected = false; }
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest resource, WebResourceError error) {
                    if (resource == null || resource.isForMainFrame()) fail(token, "session-error");
                }
                @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    handler.cancel(); fail(token, "session-error");
                }
            });
            attachVisiblePortal();
            current.loadUrl(MY_TRAVEL_URL);
        } catch (Exception ignored) { fail(generation, "session-error"); }
    }

    static boolean allowedNavigation(String value) {
        try {
            Uri uri = Uri.parse(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            return host.equals("api2.apicrewcare.com") || host.equals("login.microsoftonline.com") || host.equals("myapps.microsoft.com");
        } catch (Exception ignored) { return false; }
    }
    static boolean isTravelUrl(String value) {
        try {
            Uri uri = Uri.parse(value);
            return allowedNavigation(value) && "api2.apicrewcare.com".equalsIgnoreCase(uri.getHost())
                    && "/LATAM/mytravel.aspx".equalsIgnoreCase(uri.getPath());
        } catch (Exception ignored) { return false; }
    }

    private boolean active(WebView current, long token) {
        return portal == current && generation == token && request != null && automatic;
    }
    private void poll(WebView current, long token) {
        if (!active(current, token) || extracting) return;
        if (!isTravelUrl(current.getUrl())) { fail(token, "session-error"); return; }
        if (android.os.SystemClock.elapsedRealtime() > deadline) { fail(token, "extraction-timeout"); return; }
        extracting = true;
        final long page = pageGeneration;
        verifier.verifyAndExtract(current, extractionScript, (subject, authenticated, confirmedEmpty, transportJson) -> activity.runOnUiThread(() -> {
            if (!active(current, token) || page != pageGeneration) return;
            extracting = false;
            if (android.os.SystemClock.elapsedRealtime() > deadline) { fail(token, "extraction-timeout"); return; }
            String expected = request.optJSONObject("context").optString("providerSubject");
            if (!authenticated || !expected.equals(subject) || !isTravelUrl(current.getUrl())) {
                fail(token, "unverified-session"); return;
            }
            try {
                JSONObject extracted = new JSONObject(transportJson);
                if (extracted.has("error")) throw new IllegalArgumentException();
                JSONArray records = extracted.getJSONArray("records");
                if (records.length() == 0 && !confirmedEmpty) { current.postDelayed(() -> { if (page == pageGeneration) poll(current, token); }, 400L); return; }
                JSONObject payload = new JSONObject();
                payload.put("schemaVersion", 2);
                payload.put("requestId", request.getString("requestId"));
                payload.put("context", request.getJSONObject("context"));
                payload.put("authenticated", true);
                payload.put("providerSubject", subject);
                payload.put("url", MY_TRAVEL_URL);
                payload.put("syncedAt", java.time.Instant.ofEpochMilli(System.currentTimeMillis()).toString());
                payload.put("records", records);
                payload.put("emptyConfirmed", confirmedEmpty);
                connected = true;
                dispatch(payload, token);
                destroyPortal();
            } catch (Exception ignored) { fail(token, "extraction-error"); }
        }));
    }

    private void fail(long token, String reason) {
        if (token != generation) return;
        connected = false;
        try {
            JSONObject payload = new JSONObject();
            payload.put("schemaVersion", 2);
            payload.put("requestId", request == null ? "" : request.optString("requestId"));
            payload.put("context", request == null ? new JSONObject() : request.optJSONObject("context"));
            payload.put("authenticated", false);
            payload.put("error", reason);
            payload.put("records", new JSONArray());
            dispatch(payload, token);
        } catch (Exception ignored) { }
        destroyPortal();
    }
    private void dispatch(JSONObject detail, long token) {
        if (mainWebView == null) return;
        // Dedicated v2 event: an obsolete #872 listener must never accept this payload.
        final String js = "window.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-v2',{detail:" + detail.toString() + "}));";
        activity.runOnUiThread(() -> {
            if (token != generation || request == null || !automatic) return;
            try { mainWebView.evaluateJavascript(js, null); } catch (Exception ignored) { }
        });
    }
    // Provisional validation container only; approved app UI is a release gate.
    private void attachVisiblePortal() {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor("#050D1C"));
        TextView title = new TextView(activity);
        title.setText("MyCrewCare · autenticação externa");
        title.setTextColor(Color.WHITE);
        box.addView(title);
        Button close = new Button(activity);
        close.setText("Cancelar e desconectar");
        close.setOnClickListener(view -> cancelByUser());
        box.addView(close);
        box.addView(portal, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        container = box;
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }
    private String readExtractionScript() throws Exception {
        try (InputStream input = activity.getAssets().open("mycrewcare-transport-v2.js"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    private void destroyPortal() {
        try { if (container != null && container.getParent() == root) root.removeView(container); } catch (Exception ignored) { }
        try {
            if (portal != null) {
                portal.stopLoading();
                portal.setWebViewClient(null);
                portal.destroy();
            }
        } catch (Exception ignored) { }
        portal = null;
        container = null;
        extracting = false;
    }
}
