package com.crewcheck.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import java.io.ByteArrayInputStream;

/** Separate QA host. No production Activity inheritance, native bridges or external intents. */
public final class CheckpointQaActivity extends Activity {
    static final String ORIGIN = "http://127.0.0.1:17347";
    private WebView web;
    static boolean allowed(String value) {
        try {
            java.net.URI uri = new java.net.URI(value);
            return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())
                && uri.getPort() == 17347 && uri.getRawUserInfo() == null
                && (value.equals(ORIGIN) || value.startsWith(ORIGIN + "/"));
        } catch (Exception ignored) { return false; }
    }
    static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "QA blocked",
            java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // New QA package only: no service-worker requests may escape interception.
        ServiceWorkerController workers = ServiceWorkerController.getInstance();
        workers.getServiceWorkerWebSettings().setBlockNetworkLoads(true);
        workers.getServiceWorkerWebSettings().setAllowContentAccess(false);
        workers.getServiceWorkerWebSettings().setAllowFileAccess(false);
        workers.setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return denied(); }
        });
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !allowed(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return allowed(request.getUrl().toString()) ? null : denied();
            }
            @Override public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler,
                    android.net.http.SslError error) { handler.cancel(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        });
        setContentView(web);
        // Intent extras, saved URLs and production recovery are deliberately never consumed.
        web.loadUrl(ORIGIN + "/app?view=exports");
    }
    @Override protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
        super.onDestroy();
    }
}
