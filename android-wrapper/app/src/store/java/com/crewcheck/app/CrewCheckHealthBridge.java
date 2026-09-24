package com.crewcheck.app;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/** Compatibility facade for existing hosted clients. Never requests or reads health data. */
public final class CrewCheckHealthBridge {
    public CrewCheckHealthBridge(Activity activity, WebView webView) {}
    public boolean install() { return false; }
    @JavascriptInterface public String ping() { return "crewcheck-life-manual-only"; }
    @JavascriptInterface public boolean postMessage(String raw) { return false; }
    public boolean requestPermissionsFromHost() { return false; }
    public boolean openSettingsFromHost() { return false; }
    public void refreshFromHost() {}
    public boolean handleActivityResult(int requestCode, int resultCode, Intent data) { return false; }
    public void destroy() {}
}
