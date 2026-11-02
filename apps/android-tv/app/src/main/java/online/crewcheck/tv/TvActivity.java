package online.crewcheck.tv;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebViewClient;
import android.view.KeyEvent;
import androidx.webkit.WebViewAssetLoader;

public final class TvActivity extends Activity {
    private WebView web;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        // TV density can expose only 960x540 CSS pixels on a 1080p display.
        // Fit the bundled 1280-wide TV canvas instead of clipping its content.
        web.getSettings().setUseWideViewPort(true);
        web.getSettings().setLoadWithOverviewMode(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !"appassets.androidplatform.net".equals(r.getUrl().getHost());
            }
        });
        setContentView(web);
        web.loadUrl("https://appassets.androidplatform.net/assets/tv/index.html");
        web.requestFocus();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) web.evaluateJavascript(
                "(function(){var care=document.querySelector('.screen-care-cover');if(!care&&(document.querySelector('nav .active')?.textContent==='Agora'||!document.querySelector('nav')))return 'exit';document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));return 'handled';})()",
                result -> { if ("\"exit\"".equals(result)) finish(); });
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if(web != null) web.onResume(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
