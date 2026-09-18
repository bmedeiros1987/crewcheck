package com.crewcheck.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;

/** Packaged shared player, same-origin HTTPS gateway, no native credential bridge. */
public final class MainActivity extends Activity {
    private static final String HOST = "crewcheck.online";
    private static final String PREFIX = "/tv-native/";
    private WebView player;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        player = new WebView(this);
        player.setBackgroundColor(0xff061522);
        player.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        WebSettings settings = player.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(player, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        player.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !("https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1 && uri.getPath() != null && uri.getPath().startsWith(PREFIX));
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost()) || uri.getPort() != -1) {
                    // The player gets editorial data only through the first-party gateway.
                    return failure(403, "Forbidden");
                }
                String path = uri.getPath();
                if (path == null || !path.startsWith(PREFIX)) return null;
                String relative = path.substring(PREFIX.length());
                if (relative.isEmpty()) relative = "index.html";
                if (relative.contains("..") || relative.contains("\\")) return failure(403, "Forbidden");
                String mime = relative.endsWith(".html") ? "text/html" : relative.endsWith(".js") ? "application/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".svg") ? "image/svg+xml" : relative.endsWith(".png") ? "image/png" : "application/octet-stream";
                try {
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), getAssets().open("player/" + relative));
                } catch (IOException missing) { return failure(404, "Not Found"); }
            }
        });
        setContentView(player);
        player.requestFocus();
        player.loadUrl("https://" + HOST + PREFIX + "index.html");
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
    }
    private static WebResourceResponse failure(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) handleBack();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
    private void handleBack() {
        player.evaluateJavascript("Boolean(window.crewcheckTvBack && window.crewcheckTvBack())", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() { player.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (player != null) player.onResume(); }
    @Override protected void onDestroy() { if (player != null) { player.stopLoading(); player.destroy(); } super.onDestroy(); }
}
