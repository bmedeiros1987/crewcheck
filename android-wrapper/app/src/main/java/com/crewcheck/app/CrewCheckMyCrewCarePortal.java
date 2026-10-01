package com.crewcheck.app;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.Locale;

/**
 * MyCrewCare connector.
 *
 * Security boundary:
 * - credentials/MFA are entered only in Microsoft/MyCrewCare pages;
 * - no JavascriptInterface is exposed to either external domain;
 * - extraction runs only after the top-level page reaches apicrewcare.com;
 * - only a small transportation snapshot is forwarded to CrewCheck.
 */
public final class CrewCheckMyCrewCarePortal {
    private static final String PREFS = "crewcheck_mycrewcare";
    private static final String KEY_CONNECTED = "connected";
    private static final String MY_TRAVEL_URL = "https://api2.apicrewcare.com/LATAM/mytravel.aspx";

    private final Activity activity;
    private final FrameLayout root;
    private final WebView mainWebView;

    private WebView portal;
    private View container;
    private TextView statusText;
    private boolean visible;
    private boolean extracting;

    public CrewCheckMyCrewCarePortal(Activity activity, FrameLayout root, WebView mainWebView) {
        this.activity = activity;
        this.root = root;
        this.mainWebView = mainWebView;
    }

    public boolean isConnected() {
        try {
            return activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .getBoolean(KEY_CONNECTED, false);
        } catch (Exception ignored) {
            return false;
        }
    }

    public String statusJson() {
        try {
            JSONObject payload = new JSONObject();
            payload.put("connected", isConnected());
            payload.put("status", isConnected() ? "connected" : "disconnected");
            return payload.toString();
        } catch (Exception ignored) {
            return "{\"connected\":false,\"status\":\"disconnected\"}";
        }
    }

    public void open() {
        activity.runOnUiThread(() -> createAndLoad(true));
    }

    public void syncIfConnected() {
        if (!isConnected()) return;
        activity.runOnUiThread(() -> createAndLoad(false));
    }

    public void destroy() {
        activity.runOnUiThread(this::destroyPortal);
    }

    public boolean isVisible() {
        return visible && container != null;
    }

    public void closeVisible() {
        if (!visible) return;
        activity.runOnUiThread(this::destroyPortal);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createAndLoad(boolean show) {
        destroyPortal();
        visible = show;
        extracting = false;

        portal = new WebView(activity);
        WebSettings settings = portal.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36");

        try {
            CookieManager manager = CookieManager.getInstance();
            manager.setAcceptCookie(true);
            manager.setAcceptThirdPartyCookies(portal, true);
        } catch (Exception ignored) {}

        portal.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return false;
                return !allowedHost(request.getUrl().getHost());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                handlePage(url);
            }
        });

        if (show) attachVisiblePortal();
        else attachHiddenPortal();

        portal.loadUrl(MY_TRAVEL_URL);
    }

    private boolean allowedHost(String host) {
        String value = host == null ? "" : host.toLowerCase(Locale.ROOT);
        return value.equals("api2.apicrewcare.com")
                || value.endsWith(".apicrewcare.com")
                || value.equals("login.microsoftonline.com")
                || value.endsWith(".microsoftonline.com")
                || value.equals("myapps.microsoft.com")
                || value.endsWith(".microsoft.com")
                || value.endsWith(".office.com")
                || value.endsWith(".msauth.net");
    }

    private boolean isMyCrewCareUrl(String url) {
        try {
            Uri uri = Uri.parse(url == null ? "" : url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            return host.equals("api2.apicrewcare.com") || host.endsWith(".apicrewcare.com");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void attachVisiblePortal() {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor("#050D1C"));
        box.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(9), dp(10), dp(9));
        bar.setBackgroundColor(Color.parseColor("#071D33"));

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(activity);
        title.setText("MyCrewCare");
        title.setTextColor(Color.WHITE);
        title.setTextSize(16f);
        title.setGravity(Gravity.CENTER_VERTICAL);
        copy.addView(title);

        statusText = new TextView(activity);
        statusText.setText("Entre normalmente. O CrewCheck não recebe sua senha.");
        statusText.setTextColor(Color.parseColor("#BBD8FF"));
        statusText.setTextSize(10f);
        copy.addView(statusText);

        bar.addView(copy, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button close = new Button(activity);
        close.setText("Fechar");
        close.setAllCaps(false);
        close.setOnClickListener(v -> destroyPortal());
        bar.addView(close, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        box.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        box.addView(portal, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        container = box;
        root.addView(box);
    }

    private void attachHiddenPortal() {
        portal.setAlpha(0f);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(2, 2);
        params.gravity = Gravity.BOTTOM | Gravity.END;
        container = portal;
        root.addView(portal, params);
    }

    private void handlePage(String url) {
        if (portal == null) return;

        if (!isMyCrewCareUrl(url)) {
            if (!visible) {
                setConnected(false);
                dispatchStatus(false);
                destroyPortal();
            } else if (statusText != null) {
                statusText.setText("Autenticação externa · conclua a autenticação e o MFA normalmente.");
            }
            return;
        }

        setConnected(true);
        dispatchStatus(true);
        dispatchEmptySnapshot();
        if (statusText != null) statusText.setText("Conectado · sincronizando transporte…");
        extractTransportation();
    }

    private void extractTransportation() {
        if (portal == null || extracting) return;
        extracting = true;

        final String js =
                "(function(){try{" +
                "var clean=function(v){return String(v||'').replace(/\\u00a0/g,' ').replace(/[\\t ]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim();};" +
                "var esc=function(v){return String(v||'').replace(/[-/\\\\^$*+?.()|[\\]{}]/g,'\\\\$&');};" +
                "var val=function(label,text){var r=new RegExp(esc(label)+'\\\\s*[:\\-]?\\\\s*([^\\\\n]+)','i');var m=clean(text).match(r);return m?clean(m[1]).split('  ')[0].trim():'';};" +
                "var normDir=function(t){return /Transportation\\s+To\\s+Airport/i.test(t)?'to_airport':(/Transportation\\s+To\\s+Hotel/i.test(t)?'to_hotel':'unknown');};" +
                "var parse=function(text){text=clean(text);var tm=text.match(/Pick[- ]?up[- ]?time\\s*[:\\-]?\\s*(\\d{1,2}:\\d{2})/i);var dt=text.match(/Pick[- ]?up[- ]?date\\s*[:\\-]?\\s*(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4})/i);var mins=text.match(/(?:Transit|Travel)[^\\n]{0,30}?(\\d{1,3})\\s*(?:min|minutes)/i);var ap=text.match(/(?:Airport|Station)\\s*[:\\-]?\\s*([A-Z]{3})\\b/i);return {direction:normDir(text),date:dt?dt[1]:'',time:tm?tm[1]:'',transitMinutes:mins?Number(mins[1]):null,pairingId:val('Pairing ID',text),airport:ap?ap[1]:'',hotel:val('Hotel',text)};};" +
                "var records=[];var seen={};" +
                "Array.prototype.slice.call(document.querySelectorAll('article,section,.card,.panel,.row,li,div')).forEach(function(el){var t=clean(el.innerText||'');if(t.length<35||t.length>4500||!/Transportation\\s+To\\s+(Airport|Hotel)/i.test(t)||!/Pick[- ]?up[- ]?time/i.test(t))return;var rec=parse(t);var k=[rec.direction,rec.date,rec.time,rec.pairingId].join('|');if(rec.time&&!seen[k]){seen[k]=1;records.push(rec);}});" +
                "if(!records.length){var body=clean(document.body&&document.body.innerText||'');var re=/Transportation\\s+To\\s+(?:Airport|Hotel)/ig;var m;while((m=re.exec(body))&&records.length<12){var rec=parse(body.slice(m.index,m.index+2200));var k=[rec.direction,rec.date,rec.time,rec.pairingId].join('|');if(rec.time&&!seen[k]){seen[k]=1;records.push(rec);}}}" +
                "return JSON.stringify({connected:true,syncedAt:new Date().toISOString(),records:records.slice(0,20)});" +
                "}catch(e){return JSON.stringify({connected:true,syncedAt:new Date().toISOString(),records:[],error:String(e&&e.message||e)});}})();";

        portal.evaluateJavascript(js, value -> {
            extracting = false;
            try {
                Object first = new JSONTokener(value == null ? "null" : value).nextValue();
                String raw = first instanceof String ? (String) first : String.valueOf(first);
                JSONObject payload = new JSONObject(raw);
                if (!payload.has("records")) payload.put("records", new JSONArray());
                dispatchSnapshot(payload);

                if (visible) {
                    Toast.makeText(activity, "MyCrewCare conectado.", Toast.LENGTH_SHORT).show();
                    portal.postDelayed(this::destroyPortal, 750L);
                } else {
                    portal.postDelayed(this::destroyPortal, 150L);
                }
            } catch (Exception error) {
                dispatchStatus(true);
                dispatchEmptySnapshot();
                if (!visible) destroyPortal();
            }
        });
    }

    private void setConnected(boolean connected) {
        try {
            activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putBoolean(KEY_CONNECTED, connected).apply();
        } catch (Exception ignored) {}
    }

    private void dispatchStatus(boolean connected) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("connected", connected);
            detail.put("status", connected ? "connected" : "disconnected");
            dispatch("crewcheck:mycrewcare-status", detail);
        } catch (Exception ignored) {}
    }

    private void dispatchEmptySnapshot() {
        try {
            JSONObject detail = new JSONObject();
            detail.put("connected", true);
            detail.put("syncedAt", new java.util.Date().toInstant().toString());
            detail.put("records", new JSONArray());
            dispatchSnapshot(detail);
        } catch (Exception ignored) {}
    }

    private void dispatchSnapshot(JSONObject detail) {
        dispatch("crewcheck:mycrewcare-update", detail);
    }

    private void dispatch(String eventName, JSONObject detail) {
        if (mainWebView == null) return;
        final String js =
                "(function(){try{var detail=" + detail.toString() + ";" +
                "window.dispatchEvent(new CustomEvent('" + eventName + "',{detail:detail}));" +
                "}catch(e){}})();";
        activity.runOnUiThread(() -> {
            try { mainWebView.evaluateJavascript(js, null); } catch (Exception ignored) {}
        });
    }

    private void destroyPortal() {
        try {
            if (container != null && container.getParent() == root) root.removeView(container);
            else if (portal != null && portal.getParent() == root) root.removeView(portal);
        } catch (Exception ignored) {}

        try {
            if (portal != null) {
                portal.stopLoading();
                portal.setWebViewClient(null);
                portal.destroy();
            }
        } catch (Exception ignored) {}

        portal = null;
        container = null;
        statusText = null;
        visible = false;
        extracting = false;
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
