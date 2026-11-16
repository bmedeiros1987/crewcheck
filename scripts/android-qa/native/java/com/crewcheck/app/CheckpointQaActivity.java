package com.crewcheck.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import java.io.ByteArrayInputStream;

/** Separate QA host. No production Activity inheritance, native bridges or external intents. */
public final class CheckpointQaActivity extends Activity {
    static final String ORIGIN = "http://127.0.0.1:17347";
    private WebView web;
    private long pageGeneration, openGeneration;
    private byte[] pendingSave;
    private ValueCallback<android.net.Uri[]> pendingOpen;
    private static final int SAVE = 701, OPEN = 702, MAX_BYTES = 16 * 1024 * 1024;
    private void clearPending() { pendingSave = null; }

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
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                pageGeneration++; clearPending();
                if (pendingOpen != null) { pendingOpen.onReceiveValue(null); pendingOpen = null; }
            }
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
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<android.net.Uri[]> callback,
                    FileChooserParams params) {
                if (pendingOpen != null || !allowed(view.getUrl()) || params.getMode() != FileChooserParams.MODE_OPEN) {
                    callback.onReceiveValue(null); return true;
                }
                pendingOpen = callback; openGeneration = pageGeneration;
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                try { startActivityForResult(intent, OPEN); }
                catch (Exception ignored) { pendingOpen = null; callback.onReceiveValue(null); }
                return true;
            }
        });
        // Origin-scoped message channel, unlike an unrestricted JavascriptInterface.
        if (!androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.WEB_MESSAGE_LISTENER)) {
            web.destroy(); web = null; finish(); return;
        }
        androidx.webkit.WebViewCompat.addWebMessageListener(web, "QaCheckpointFile",
            java.util.Collections.singleton(ORIGIN), (view, message, sourceOrigin, isMainFrame, reply) -> {
                if (!isMainFrame || !ORIGIN.equals(sourceOrigin.toString()) || pendingSave != null) return;
                String encoded = message.getData();
                if (encoded == null || encoded.length() > ((MAX_BYTES + 2) / 3) * 4) return;
                try {
                    byte[] bytes = android.util.Base64.decode(encoded, android.util.Base64.NO_WRAP);
                    if (bytes.length == 0 || bytes.length > MAX_BYTES) return;
                    new org.json.JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                    pendingSave = bytes;
                    android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(android.content.Intent.EXTRA_TITLE, "crewcheck-qa-roster-checkpoint.json");
                    startActivityForResult(intent, SAVE);
                } catch (Exception ignored) { clearPending(); }
            });
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (pendingSave != null || !"application/json".equals(mime)
                || url == null || !url.matches("blob:http://127\\.0\\.0\\.1:17347/[a-fA-F0-9-]{36}")
                || !allowed(web.getUrl())) return;
            String literal = org.json.JSONObject.quote(url);
            // Read only this same-origin Blob; never fetch a provider or a content/file URL.
            web.evaluateJavascript("(async()=>{try{const b=await (await fetch(" + literal
                + ")).blob();if(b.size<1||b.size>16777216)return;const r=new FileReader();r.onload=()=>QaCheckpointFile.postMessage(String(r.result).split(',')[1]);r.readAsDataURL(b);}catch{}})()", null);
        });
        setContentView(web);
        // Intent extras, saved URLs and production recovery are deliberately never consumed.
        web.loadUrl(ORIGIN + "/app?view=exports");
    }
    @Override protected void onActivityResult(int request, int result, android.content.Intent data) {
        super.onActivityResult(request, result, data);
        android.net.Uri uri = data == null ? null : data.getData();
        boolean accepted = result == RESULT_OK && uri != null && "content".equals(uri.getScheme());
        if (request == SAVE) {
            byte[] bytes = pendingSave; clearPending();
            if (accepted && bytes != null) {
                try (java.io.OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new java.io.IOException();
                    output.write(bytes);
                } catch (Exception ignored) {
                    android.widget.Toast.makeText(this, "Falha ao salvar arquivo de teste", android.widget.Toast.LENGTH_LONG).show();
                }
            }
        } else if (request == OPEN && pendingOpen != null) {
            ValueCallback<android.net.Uri[]> callback = pendingOpen; pendingOpen = null;
            boolean samePage = web != null && allowed(web.getUrl()) && openGeneration == pageGeneration;
            callback.onReceiveValue(accepted && samePage ? new android.net.Uri[]{uri} : null);
        }
    }
    @Override protected void onDestroy() {
        clearPending();
        if (pendingOpen != null) { pendingOpen.onReceiveValue(null); pendingOpen = null; }
        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
        super.onDestroy();
    }
}
