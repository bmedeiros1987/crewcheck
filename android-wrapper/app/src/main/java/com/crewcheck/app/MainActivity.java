package com.crewcheck.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.app.PendingIntent;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.os.PowerManager;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.Window;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.PermissionRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

public class MainActivity extends Activity {
    // CrewCheck v10.8.49 — Reliable Location, Web permissions, Routes/Directions fallback e iFlight compacto.
    private static final int FILE_CHOOSER_REQUEST_CODE = 4242;
    private static final int NATIVE_PDF_PICKER_REQUEST_CODE = 4343;
    private static final int LOCATION_PERMISSION_REQUEST_CODE = 4545;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 4646;
    private static final String NOTIFICATION_CHANNEL_ID = "crewcheck_alerts";
    private static final int MAX_PDF_BYTES = 35 * 1024 * 1024;
    private static final String IFLIGHT_CREW_MAIN_URL = "https://iflightla.ibsplc.aero/iflight-crew/web/getMainPage";
    private static final String IFLIGHT_CWP_MAIN_URL = "https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage";

    private FrameLayout rootLayout;
    private WebView webView;
    private WebView portalWebView;
    private View portalContainer;
    private TextView portalStatusText;
    private TextView portalMaskStatusText;
    private View portalMaskView;
    private ValueCallback<Uri[]> filePathCallback;
    private String activeIFlightRequestId;
    private String activeIFlightConfigJson = "{}";
    private boolean closingPortalWithResult = false;
    private boolean portalSsoErrorDetected = false;
    private boolean iflightPdfReceived = false;
    private String lastIFlightUrl = IFLIGHT_CREW_MAIN_URL;
    private String pendingSharedPdfBase64;
    private String pendingSharedPdfName;
    private GeolocationPermissions.Callback pendingGeolocationCallback;
    private String pendingGeolocationOrigin;
    private String pendingNativeLocationCallbackId;
    private CrewCheckBillingBridge billingBridge;

    private boolean hasCrewCheckLocationPermission() {
        try {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                    || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } catch (Exception ex) {
            return false;
        }
    }

    private boolean hasCrewCheckNotificationPermission() {
        try {
            return Build.VERSION.SDK_INT < 33
                    || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        } catch (Exception ex) {
            return false;
        }
    }

    private void dispatchCrewCheckPermissionStatus() {
        try {
            if (webView == null) return;
            final String payload = crewCheckPermissionStatusJson();
            final String js = "(function(){try{var detail=" + payload + ";" +
                    "window.__crewcheckNativePermissionStatus=detail;" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:permissions-updated',{detail:detail}));" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:native-ready',{detail:detail}));" +
                    "}catch(e){}})();";
            runOnUiThread(() -> {
                try { if (webView != null) webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#071D33"));
        getWindow().setNavigationBarColor(Color.parseColor("#071D33"));

        rootLayout = new FrameLayout(this);
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootLayout);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setLayoutParams(new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        rootLayout.addView(webView);

        configureWebView(webView, false);
        webView.addJavascriptInterface(new CrewCheckIFlightBridge(), "AndroidCrewCheckIFlight");
        webView.addJavascriptInterface(new CrewCheckNativeBridge(), "AndroidCrewCheckNative");
        billingBridge = new CrewCheckBillingBridge(this, webView);
        webView.addJavascriptInterface(billingBridge, "AndroidCrewCheckBilling");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String target = request.getUrl().toString();
                    if (isCrewCheckWebUrl(target)) return false;
                    openExternalUrl(target);
                    return true;
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!isCrewCheckWebUrl(url)) return;
                injectCrewCheckBridge();
                dispatchPendingSharedPdf();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    try {
                        view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                        view.loadUrl("https://crewcheck.online?app=1");
                    } catch (Exception ignored) {}
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                handleGeolocationPermissionRequest(origin, callback);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/pdf");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "application/octet-stream"});
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

                Intent chooser = Intent.createChooser(intent, "Escolher PDF da escala");
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception ex) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        handleIncomingPdfIntent(getIntent());
        webView.loadUrl("https://crewcheck.online?app=1");
        ensureCrewCheckNotificationChannel();
        dispatchCrewCheckPermissionStatus();
        webView.postDelayed(() -> dispatchCrewCheckPermissionStatus(), 900);
        webView.postDelayed(() -> requestInitialCrewCheckPermissions(), 1600);
    }



    private void requestInitialCrewCheckPermissions() {
        try {
            if (!hasCrewCheckLocationPermission()) {
                requestCrewCheckLocationPermission();
                webView.postDelayed(() -> {
                    try { if (!hasCrewCheckNotificationPermission()) requestNotificationPermissionIfNeeded(); } catch (Exception ignored) {}
                }, 1800);
                return;
            }
            if (!hasCrewCheckNotificationPermission()) {
                requestNotificationPermissionIfNeeded();
            }
            dispatchCrewCheckPermissionStatus();
        } catch (Exception ignored) {}
    }

    private void handleGeolocationPermissionRequest(String origin, GeolocationPermissions.Callback callback) {
        if (callback == null) return;
        if (!isCrewCheckWebUrl(origin)) {
            callback.invoke(origin, false, false);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            callback.invoke(origin, true, false);
            return;
        }
        if (hasCrewCheckLocationPermission()) {
            callback.invoke(origin, true, false);
            dispatchCrewCheckPermissionStatus();
            return;
        }
        pendingGeolocationOrigin = origin;
        pendingGeolocationCallback = callback;
        requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION_REQUEST_CODE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST_CODE) {
            boolean granted = hasCrewCheckLocationPermission();
            if (!granted && grantResults != null) {
                for (int result : grantResults) {
                    if (result == PackageManager.PERMISSION_GRANTED) {
                        granted = true;
                        break;
                    }
                }
            }
            if (pendingGeolocationCallback != null) {
                pendingGeolocationCallback.invoke(pendingGeolocationOrigin, granted, false);
                pendingGeolocationCallback = null;
                pendingGeolocationOrigin = null;
            }
            String callbackId = pendingNativeLocationCallbackId;
            pendingNativeLocationCallbackId = null;
            Toast.makeText(this, granted ? "Localização liberada para o CrewCheck." : "Localização não liberada.", Toast.LENGTH_SHORT).show();
            dispatchCrewCheckPermissionStatus();
            if (callbackId != null && callbackId.trim().length() > 0) {
                if (granted) {
                    requestCrewCheckCurrentLocation(callbackId);
                } else {
                    try {
                        JSONObject denied = new JSONObject();
                        denied.put("ok", false);
                        denied.put("permission", false);
                        denied.put("error", "Permissão de localização negada no Android. Ative em Configurações > Apps > CrewCheck > Permissões.");
                        dispatchCrewCheckLocationResult(callbackId, denied);
                    } catch (Exception ignored) {}
                }
            }
            return;
        }
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
            boolean granted = hasCrewCheckNotificationPermission();
            if (!granted && grantResults != null) {
                for (int result : grantResults) {
                    if (result == PackageManager.PERMISSION_GRANTED) {
                        granted = true;
                        break;
                    }
                }
            }
            Toast.makeText(this, granted ? "Notificações liberadas para o CrewCheck." : "Notificações não liberadas.", Toast.LENGTH_SHORT).show();
            dispatchCrewCheckPermissionStatus();
        }
    }

    private void ensureCrewCheckNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL_ID, "Alertas CrewCheck", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Escala, saída inteligente, calendário e lembretes do CrewCheck.");
            manager.createNotificationChannel(channel);
        } catch (Exception ignored) {}
    }

    private void requestNotificationPermissionIfNeeded() {
        try {
            ensureCrewCheckNotificationChannel();
            if (Build.VERSION.SDK_INT < 33) {
                Toast.makeText(this, "Notificações liberadas para o CrewCheck.", Toast.LENGTH_SHORT).show();
                dispatchCrewCheckPermissionStatus();
                return;
            }
            if (hasCrewCheckNotificationPermission()) {
                Toast.makeText(this, "Notificações já liberadas para o CrewCheck.", Toast.LENGTH_SHORT).show();
                dispatchCrewCheckPermissionStatus();
                return;
            }
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST_CODE);
        } catch (Exception ignored) {}
    }

    private void showCrewCheckNotification(String title, String body) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationPermissionIfNeeded();
                return;
            }
            ensureCrewCheckNotificationChannel();
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                    : new Notification.Builder(this);
            builder.setContentTitle(title == null || title.trim().isEmpty() ? "CrewCheck" : title)
                    .setContentText(body == null ? "" : body)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body));
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        } catch (Exception ex) {
            Toast.makeText(this, body == null || body.trim().isEmpty() ? "CrewCheck" : body, Toast.LENGTH_LONG).show();
        }
    }



    private void dispatchCrewCheckLocationResult(String callbackId, JSONObject payload) {
        try {
            if (webView == null) return;
            if (payload == null) payload = new JSONObject();
            payload.put("callbackId", callbackId == null ? "" : callbackId);
            final String json = payload.toString();
            final String js = "(function(){try{var detail=" + json + ";" +
                    "window.__crewcheckLastNativeLocation=detail;" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:native-location-result',{detail:detail}));" +
                    "}catch(e){}})();";
            runOnUiThread(() -> {
                try { if (webView != null) webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    private JSONObject locationToPayload(Location location, String provider) {
        JSONObject payload = new JSONObject();
        try {
            if (location == null) {
                payload.put("ok", false);
                payload.put("error", "Localização nativa indisponível.");
                return payload;
            }
            payload.put("ok", true);
            payload.put("lat", location.getLatitude());
            payload.put("lng", location.getLongitude());
            payload.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            payload.put("provider", provider == null || provider.trim().isEmpty() ? location.getProvider() : provider);
            payload.put("time", location.getTime());
        } catch (Exception ignored) {}
        return payload;
    }

    private Location chooseBetterLocation(Location currentBest, Location candidate) {
        if (candidate == null) return currentBest;
        if (currentBest == null) return candidate;
        long currentTime = currentBest.getTime();
        long candidateTime = candidate.getTime();
        if (candidateTime > currentTime + 120_000L) return candidate;
        if (candidateTime < currentTime - 120_000L) return currentBest;
        float currentAccuracy = currentBest.hasAccuracy() ? currentBest.getAccuracy() : Float.MAX_VALUE;
        float candidateAccuracy = candidate.hasAccuracy() ? candidate.getAccuracy() : Float.MAX_VALUE;
        return candidateAccuracy <= currentAccuracy ? candidate : currentBest;
    }

    @SuppressLint("MissingPermission")
    private Location getBestKnownLocation(LocationManager manager) {
        Location best = null;
        if (manager == null || !hasCrewCheckLocationPermission()) return null;
        try { best = chooseBetterLocation(best, manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)); } catch (Exception ignored) {}
        try { best = chooseBetterLocation(best, manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)); } catch (Exception ignored) {}
        try { best = chooseBetterLocation(best, manager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)); } catch (Exception ignored) {}
        return best;
    }

    @SuppressLint("MissingPermission")
    private void requestCrewCheckCurrentLocation(final String callbackId) {
        try {
            if (!hasCrewCheckLocationPermission()) {
                pendingNativeLocationCallbackId = callbackId;
                requestCrewCheckLocationPermission();
                return;
            }
            final LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (manager == null) {
                JSONObject error = new JSONObject();
                error.put("ok", false);
                error.put("error", "Serviço de localização do Android indisponível.");
                dispatchCrewCheckLocationResult(callbackId, error);
                return;
            }
            final Location bestKnown = getBestKnownLocation(manager);
            if (bestKnown != null && System.currentTimeMillis() - bestKnown.getTime() < 75_000L && (!bestKnown.hasAccuracy() || bestKnown.getAccuracy() <= 180f)) {
                dispatchCrewCheckLocationResult(callbackId, locationToPayload(bestKnown, "android-last-known"));
                return;
            }
            final boolean[] delivered = new boolean[]{false};
            final LocationListener listener = new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    if (delivered[0]) return;
                    delivered[0] = true;
                    try { manager.removeUpdates(this); } catch (Exception ignored) {}
                    dispatchCrewCheckLocationResult(callbackId, locationToPayload(location, "android-live"));
                }
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            };
            String provider = null;
            try { if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) provider = LocationManager.GPS_PROVIDER; } catch (Exception ignored) {}
            if (provider == null) {
                try { if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) provider = LocationManager.NETWORK_PROVIDER; } catch (Exception ignored) {}
            }
            if (provider == null) provider = LocationManager.PASSIVE_PROVIDER;
            try {
                manager.requestSingleUpdate(provider, listener, Looper.getMainLooper());
            } catch (Exception ex) {
                if (bestKnown != null) {
                    dispatchCrewCheckLocationResult(callbackId, locationToPayload(bestKnown, "android-last-known-fallback"));
                } else {
                    JSONObject error = new JSONObject();
                    error.put("ok", false);
                    error.put("error", "GPS indisponível. Ative a localização do aparelho e tente novamente.");
                    dispatchCrewCheckLocationResult(callbackId, error);
                }
                return;
            }
            webView.postDelayed(() -> {
                if (delivered[0]) return;
                delivered[0] = true;
                try { manager.removeUpdates(listener); } catch (Exception ignored) {}
                Location fallback = getBestKnownLocation(manager);
                if (fallback != null) {
                    dispatchCrewCheckLocationResult(callbackId, locationToPayload(fallback, "android-timeout-last-known"));
                } else {
                    try {
                        JSONObject error = new JSONObject();
                        error.put("ok", false);
                        error.put("error", "Não consegui obter GPS real agora. Ative localização em alta precisão e tente novamente.");
                        dispatchCrewCheckLocationResult(callbackId, error);
                    } catch (Exception ignored) {}
                }
            }, 12_500L);
        } catch (Exception ex) {
            try {
                JSONObject error = new JSONObject();
                error.put("ok", false);
                error.put("error", "Falha ao puxar localização nativa: " + ex.getMessage());
                dispatchCrewCheckLocationResult(callbackId, error);
            } catch (Exception ignored) {}
        }
    }

    private void requestCrewCheckLocationPermission() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || hasCrewCheckLocationPermission()) {
                Toast.makeText(this, "Localização já liberada para o CrewCheck.", Toast.LENGTH_SHORT).show();
                dispatchCrewCheckPermissionStatus();
                return;
            }
            pendingGeolocationCallback = null;
            pendingGeolocationOrigin = null;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION_REQUEST_CODE);
            webView.postDelayed(() -> dispatchCrewCheckPermissionStatus(), 900);
        } catch (Exception ex) {
            Toast.makeText(this, "Abra as permissões do CrewCheck e libere Localização.", Toast.LENGTH_LONG).show();
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception ignored) {}
        }
    }

    private String crewCheckPermissionStatusJson() {
        try {
            boolean loc = hasCrewCheckLocationPermission();
            boolean notif = hasCrewCheckNotificationPermission();
            boolean unrestricted = isCrewCheckBatteryUnrestricted();
            return "{\"location\":" + loc + ",\"notifications\":" + notif + ",\"background\":" + unrestricted + ",\"batteryUnrestricted\":" + unrestricted + "}";
        } catch (Exception ex) {
            return "{\"location\":false,\"notifications\":false,\"background\":false,\"batteryUnrestricted\":false}";
        }
    }

    private void scheduleCrewCheckNotification(String title, String body, long epochMillis) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationPermissionIfNeeded();
                return;
            }
            ensureCrewCheckNotificationChannel();
            Intent intent = new Intent(this, CrewCheckNotificationReceiver.class);
            intent.putExtra("title", title == null || title.trim().isEmpty() ? "CrewCheck" : title);
            intent.putExtra("body", body == null ? "" : body);
            int requestCode = (int)(Math.abs((String.valueOf(title) + String.valueOf(body) + epochMillis).hashCode()) % 100000);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            android.app.AlarmManager alarm = (android.app.AlarmManager) getSystemService(Context.ALARM_SERVICE);
            long when = Math.max(System.currentTimeMillis() + 1000L, epochMillis);
            if (alarm == null) {
                showCrewCheckNotification(title, body);
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarm.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, when, pendingIntent);
            } else {
                alarm.set(android.app.AlarmManager.RTC_WAKEUP, when, pendingIntent);
            }
        } catch (Exception ex) {
            showCrewCheckNotification(title, body);
        }
    }

    private boolean isExternalSupportUrl(String url) {
        String lower = String.valueOf(url).toLowerCase(Locale.ROOT);
        return lower.startsWith("mailto:")
                || lower.startsWith("tel:")
                || lower.startsWith("whatsapp:")
                || lower.contains("wa.me/")
                || lower.contains("api.whatsapp.com/");
    }

    private boolean isCrewCheckWebUrl(String url) {
        try {
            Uri uri = Uri.parse(url == null ? "" : url.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            boolean debugBuild = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (debugBuild && ("localhost".equals(host) || "10.0.2.2".equals(host)) && "http".equals(scheme)) return true;
            if (!"https".equals(scheme)) return false;
            return "crewcheck.online".equals(host)
                    || "www.crewcheck.online".equals(host)
                    || "crewcheck.onrender.com".equals(host);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void openExternalUrl(String url) {
        if (url == null || url.trim().isEmpty()) return;
        try {
            Uri uri = Uri.parse(url.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("https".equals(scheme) || "http".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme) || "whatsapp".equals(scheme))) {
                Toast.makeText(this, "Link externo bloqueado por segurança.", Toast.LENGTH_LONG).show();
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException ex) {
            Toast.makeText(this, "Nenhum app encontrado para abrir este suporte.", Toast.LENGTH_LONG).show();
        } catch (Exception ex) {
            Toast.makeText(this, "Não foi possível abrir o suporte externo.", Toast.LENGTH_LONG).show();
        }
    }

    private void configureWebView(WebView target, boolean portalMode) {
        WebSettings settings = target.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(!portalMode);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(portalMode);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSaveFormData(false);
        if (portalMode) {
            try {
                // v10.8.26: login/MFA precisa ser legível e livre para digitação.
                // Mantemos viewport responsivo inicialmente; quando sair do login, a automação usa seletores/textos.
                settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36");
                settings.setTextZoom(82);
                settings.setLoadWithOverviewMode(true);
                settings.setUseWideViewPort(true);
                target.setInitialScale(58);
                target.setHorizontalScrollBarEnabled(true);
                target.setVerticalScrollBarEnabled(true);
                target.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
            } catch (Exception ignored) {}
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(portalMode ? WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(target, portalMode);
        }
    }

    private void injectCrewCheckBridge() {
        if (webView == null) return;
        String js = "(function(){" +
                "if(window.__crewcheckNativeBridgeInstalled)return;" +
                "window.__crewcheckNativeBridgeInstalled=true;" +
                "window.__crewcheckIflightCallbacks=window.__crewcheckIflightCallbacks||{};" +
                "window.CrewCheckIFlight={openPortalAndImport:function(url,options){" +
                "return new Promise(function(resolve){" +
                "var id='iflight_'+Date.now()+'_'+Math.random().toString(36).slice(2);" +
                "window.__crewcheckIflightCallbacks[id]=function(payload){try{if(typeof payload==='string')payload=JSON.parse(payload);}catch(e){};delete window.__crewcheckIflightCallbacks[id];resolve(payload);};" +
                "try{AndroidCrewCheckIFlight.openPortalAndImport(String(url),JSON.stringify(options||{}),id);}catch(e){resolve({ok:false,error:String(e&&e.message||e)});}" +
                "});" +
                "}};" +
                "window.CrewCheckNative={openExternal:function(url){try{return AndroidCrewCheckNative.openExternal(String(url));}catch(e){return false;}},requestLocation:function(){try{return AndroidCrewCheckNative.requestLocation();}catch(e){return false;}},requestCurrentLocation:function(callbackId){try{return AndroidCrewCheckNative.requestCurrentLocation(String(callbackId||''));}catch(e){return false;}},requestNotifications:function(){try{return AndroidCrewCheckNative.requestNotifications();}catch(e){return false;}},requestBackgroundMode:function(){try{return AndroidCrewCheckNative.requestBackgroundMode();}catch(e){return false;}},openPowerSettings:function(){try{return AndroidCrewCheckNative.openPowerSettings();}catch(e){return false;}},permissionStatus:function(){try{return JSON.parse(AndroidCrewCheckNative.permissionStatus());}catch(e){return {location:false,notifications:false};}},notify:function(title,body){try{return AndroidCrewCheckNative.notify(String(title||'CrewCheck'),String(body||''));}catch(e){return false;}},scheduleNotification:function(title,body,epochMillis){try{return AndroidCrewCheckNative.scheduleNotification(String(title||'CrewCheck'),String(body||''),String(epochMillis||Date.now()));}catch(e){return false;}}};" +
                "window.CrewCheckPremium=window.CrewCheckNative;" +
                "try{window.dispatchEvent(new CustomEvent('crewcheck:native-ready',{detail:window.CrewCheckNative.permissionStatus()}));}catch(e){}" +
                "})();";
        try {
            webView.evaluateJavascript(js, null);
        } catch (Exception ignored) {}
    }

    public class CrewCheckIFlightBridge {
        @JavascriptInterface
        public void openPortalAndImport(final String url, final String configJson, final String requestId) {
            runOnUiThread(() -> openIFlightPortal(url, configJson, requestId));
        }
    }


    private boolean isCrewCheckBatteryUnrestricted() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            return powerManager == null || powerManager.isIgnoringBatteryOptimizations(getPackageName());
        } catch (Exception ex) {
            return false;
        }
    }

    private void requestCrewCheckBackgroundMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !isCrewCheckBatteryUnrestricted()) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                Toast.makeText(this, "Permita o CrewCheck em segundo plano para melhorar os alertas.", Toast.LENGTH_LONG).show();
            } else {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                Toast.makeText(this, "Notificações e segundo plano já estão liberados ou podem ser conferidos nesta tela.", Toast.LENGTH_LONG).show();
            }
            dispatchCrewCheckPermissionStatus();
        } catch (Exception ex) {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception ignored) {}
        }
    }

    public class CrewCheckNativeBridge {
        @JavascriptInterface
        public boolean openExternal(final String url) {
            runOnUiThread(() -> openExternalUrl(url));
            return true;
        }

        @JavascriptInterface
        public boolean openGoogleDrivePdfPicker() {
            runOnUiThread(() -> openNativePdfPicker(true));
            return true;
        }

        @JavascriptInterface
        public boolean openPdfPicker() {
            runOnUiThread(() -> openNativePdfPicker(false));
            return true;
        }

        @JavascriptInterface
        public boolean requestLocation() {
            runOnUiThread(() -> requestCrewCheckLocationPermission());
            return true;
        }

        @JavascriptInterface
        public boolean requestCurrentLocation(final String callbackId) {
            runOnUiThread(() -> requestCrewCheckCurrentLocation(callbackId));
            return true;
        }

        @JavascriptInterface
        public boolean requestNotifications() {
            runOnUiThread(() -> requestNotificationPermissionIfNeeded());
            return hasCrewCheckNotificationPermission();
        }

        @JavascriptInterface
        public boolean requestBackgroundMode() {
            runOnUiThread(() -> requestCrewCheckBackgroundMode());
            return true;
        }

        @JavascriptInterface
        public boolean openPowerSettings() {
            runOnUiThread(() -> requestCrewCheckBackgroundMode());
            return true;
        }

        @JavascriptInterface
        public String permissionStatus() {
            return crewCheckPermissionStatusJson();
        }

        @JavascriptInterface
        public boolean scheduleNotification(final String title, final String body, final String epochMillis) {
            runOnUiThread(() -> {
                long when;
                try { when = Long.parseLong(epochMillis); } catch (Exception ex) { when = System.currentTimeMillis() + 1000L; }
                scheduleCrewCheckNotification(title, body, when);
            });
            return true;
        }

        @JavascriptInterface
        public boolean notify(final String title, final String body) {
            runOnUiThread(() -> showCrewCheckNotification(title, body));
            return true;
        }
    }

    public class CrewCheckIFlightPortalBridge {
        @JavascriptInterface
        public void nativeTapMenu() {
            runOnUiThread(() -> pulseIFlightMenuSoft());
        }

        @JavascriptInterface
        public void forceReport() {
            runOnUiThread(() -> forceIFlightReportFlow());
        }

        @JavascriptInterface
        public void receivePdfBase64(final String filename, final String dataBase64) {
            returnPdfBase64FromPortal(filename, dataBase64);
        }


        @JavascriptInterface
        public void receiveCalendarText(final String filename, final String text) {
            returnCalendarTextFromPortal(filename, text);
        }

        @JavascriptInterface
        public void reportPdfCapture(final String message) {
            updatePortalStatus(message == null ? "Captura PDF acionada no iFlight." : message);
        }

        @JavascriptInterface
        public void status(final String message) {
            updatePortalStatus(message);
        }

        @JavascriptInterface
        public void maskOn(final String message) {
            updatePortalStatus(message == null || message.trim().isEmpty() ? "CrewCheck sincronizando iFlight em modo mascarado." : message);
            setPortalMaskVisible(true);
        }

        @JavascriptInterface
        public void maskOff() {
            setPortalMaskVisible(false);
        }
    }


    private String normalizeIFlightPortalUrl(String url) {
        String value = url == null || url.trim().isEmpty() ? IFLIGHT_CREW_MAIN_URL : url.trim();
        // v11.0.4: preservar portal escolhido pelo admin. Algumas contas autorizadas
        // podem cair no portal Crew; outras validam melhor no CWP. Não convertemos
        // CWP para Crew para evitar 403 indevido.
        if (value.contains("/iflight-cwp/")) return value;
        if (!value.contains("iflightla.ibsplc.aero")) return IFLIGHT_CREW_MAIN_URL;
        return value;
    }

    private boolean isAuthOrLoginUrl(String pageUrl) {
        String u = pageUrl == null ? "" : pageUrl.toLowerCase();
        return u.contains("accounts.google") || u.contains("/signin") || u.contains("login") || u.contains("oauth") || u.contains("saml") || u.contains("microsoftonline") || u.contains("auth");
    }

    private void tunePortalForLoginOrApp(WebView view, String pageUrl) {
        if (view == null) return;
        try {
            boolean auth = isAuthOrLoginUrl(pageUrl);
            WebSettings settings = view.getSettings();
            if (auth) {
                settings.setTextZoom(112);
                settings.setLoadWithOverviewMode(false);
                settings.setUseWideViewPort(false);
                view.setInitialScale(0);
                setPortalMaskVisible(false);
                updatePortalStatus("Login/MFA oficial liberado. Digite seus dados normalmente; o CrewCheck pausa a automação e não preenche credenciais.");
            } else {
                settings.setTextZoom(78);
                settings.setLoadWithOverviewMode(true);
                settings.setUseWideViewPort(true);
                view.setInitialScale(52);
            }
        } catch (Exception ignored) {}
    }

    private void stylePortalButton(Button button, String label) {
        try {
            button.setText(label);
            button.setAllCaps(false);
            button.setTextSize(13f);
            button.setMinWidth(0);
            button.setMinimumWidth(0);
            button.setMinHeight(dp(42));
            button.setPadding(dp(12), 0, dp(12), 0);
        } catch (Exception ignored) {}
    }

    @SuppressLint({"SetJavaScriptEnabled"})
    private void openIFlightPortal(String url, String configJson, String requestId) {
        closePortalOnly();
        closingPortalWithResult = false;
        activeIFlightRequestId = requestId;
        activeIFlightConfigJson = sanitizeJsonConfig(configJson);
        lastIFlightUrl = normalizeIFlightPortalUrl(url);
        portalSsoErrorDetected = false;
        iflightPdfReceived = false;

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setBackgroundColor(Color.parseColor("#030914"));
        container.setLayoutParams(new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(10), dp(8), dp(10), dp(8));
        toolbar.setBackgroundColor(Color.parseColor("#071D33"));

        LinearLayout titleBox = new LinearLayout(this);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        titleBox.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText("CrewCheck · Portal iFlight");
        title.setTextColor(Color.WHITE);
        title.setTextSize(15f);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setSingleLine(true);
        titleBox.addView(title, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        portalStatusText = new TextView(this);
        portalStatusText.setText("Admin AutoPull · login/MFA somente no portal oficial");
        portalStatusText.setTextColor(Color.parseColor("#BAE6FD"));
        portalStatusText.setTextSize(10f);
        portalStatusText.setSingleLine(false);
        titleBox.addView(portalStatusText, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        toolbar.addView(titleBox, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button menuButton = new Button(this);
        stylePortalButton(menuButton, "Portal");
        menuButton.setOnClickListener(v -> pulseIFlightMenu());
        toolbar.addView(menuButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button cwpButton = new Button(this);
        stylePortalButton(cwpButton, "CWP");
        cwpButton.setOnClickListener(v -> {
            if (portalWebView != null) {
                updatePortalStatus("Abrindo portal CWP alternativo. Se houver sessão corporativa autorizada, o CrewCheck tentará continuar o AutoPull.");
                lastIFlightUrl = IFLIGHT_CWP_MAIN_URL;
                portalWebView.loadUrl(IFLIGHT_CWP_MAIN_URL);
            }
        });
        toolbar.addView(cwpButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button automate = new Button(this);
        stylePortalButton(automate, "AutoPull");
        automate.setOnClickListener(v -> {
            if (portalWebView != null) {
                updatePortalStatus("Calendar Sweep admin ativado. Se a sessão estiver válida, vou abrir o Roster Calendar, varrer eventos e capturar detalhes/tripulação quando visíveis; se pedir login/MFA, conclua no portal oficial.");
                setPortalMaskVisible(true);
                injectIFlightAutomation(portalWebView);
                pulseIFlightMenuSoft();
                Toast.makeText(this, "AutoPull Admin reativado. Sessão autorizada será reutilizada quando possível.", Toast.LENGTH_SHORT).show();
            }
        });
        toolbar.addView(automate, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button reportButton = new Button(this);
        stylePortalButton(reportButton, "Baixar PDF");
        reportButton.setOnClickListener(v -> {
            if (portalWebView != null) {
                updatePortalStatus("Abrindo Roster Calendar e capturando programação/detalhes visíveis na sessão autorizada.");
                setPortalMaskVisible(true);
                scheduleForcedIFlightDownload();
            }
        });
        toolbar.addView(reportButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button rosterButton = new Button(this);
        stylePortalButton(rosterButton, "Roster");
        rosterButton.setOnClickListener(v -> {
            if (portalWebView != null) {
                updatePortalStatus("Atalho Roster em execução com tela mascarada.");
                setPortalMaskVisible(true);
                injectIFlightAutomation(portalWebView);
                portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckClickRoster)window.__crewcheckClickRoster(); else if(window.__crewcheckOpenMenu)window.__crewcheckOpenMenu(true);}catch(e){}})();", null);
            }
        });
        toolbar.addView(rosterButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button runButton = new Button(this);
        stylePortalButton(runButton, "Run");
        runButton.setOnClickListener(v -> {
            if (portalWebView != null) {
                updatePortalStatus("Atalho Run em execução com tela mascarada.");
                setPortalMaskVisible(true);
                injectIFlightAutomation(portalWebView);
                portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckRunNow)window.__crewcheckRunNow(); else if(window.__crewcheckForceReport)window.__crewcheckForceReport();}catch(e){}})();", null);
            }
        });
        toolbar.addView(runButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button diagButton = new Button(this);
        stylePortalButton(diagButton, "Ajuda");
        diagButton.setOnClickListener(v -> {
            if (portalWebView != null) {
                updatePortalStatus("Ajuda: se o portal pedir login/MFA, conclua o login oficial. Depois o CrewCheck continua sozinho e tenta capturar o PDF.");
                portalWebView.evaluateJavascript("(function(){try{var els=Array.prototype.slice.call(document.querySelectorAll(\"button,a,span,div,input,select,label\")).filter(function(e){var r=e.getBoundingClientRect();return r.width>6&&r.height>6;}).slice(0,120).map(function(e){return ((e.innerText||e.value||e.title||e.id||e.name||e.className||\"\")+\"\").replace(/\\s+/g,\" \").trim();}).filter(Boolean).slice(0,35).join(\" | \");var txt=((document.body&&document.body.innerText)||\"\").replace(/\\s+/g,\" \").slice(0,180); if(window.AndroidCrewCheckPortal)AndroidCrewCheckPortal.status(\"Diag · URL=\"+location.href.slice(0,70)+\" · TEXTO=\"+(txt||\"[sem texto]\")+\" · BOTOES=\"+(els||\"[sem labels]\"));}catch(e){if(window.AndroidCrewCheckPortal)AndroidCrewCheckPortal.status(\"Diag falhou: \"+e.message);}})();", null);
            }
        });
        toolbar.addView(diagButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button reload = new Button(this);
        stylePortalButton(reload, "↻");
        reload.setOnClickListener(v -> {
            if (portalWebView != null) portalWebView.reload();
        });
        toolbar.addView(reload, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button browser = new Button(this);
        stylePortalButton(browser, "Chrome");
        browser.setOnClickListener(v -> openIFlightInExternalBrowser(lastIFlightUrl));
        toolbar.addView(browser, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button close = new Button(this);
        stylePortalButton(close, "Fechar");
        close.setOnClickListener(v -> finishIFlightWithError("Portal iFlight fechado pelo usuário antes do download do PDF."));
        toolbar.addView(close, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        portalWebView = new WebView(this);
        portalWebView.setBackgroundColor(Color.WHITE);
        configureWebView(portalWebView, true);
        portalWebView.addJavascriptInterface(new CrewCheckIFlightPortalBridge(), "AndroidCrewCheckPortal");

        portalWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String pageUrl, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, pageUrl, favicon);
                lastIFlightUrl = pageUrl == null ? lastIFlightUrl : pageUrl;
                updatePortalStatus("Carregando iFlight. Se a sessão estiver válida, sigo sozinho; se pedir login/MFA, finalize no portal oficial.");
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null && isLikelyPdfUrl(request.getUrl().toString(), "", "")) {
                    fetchPdfAndReturn(request.getUrl().toString(), view.getSettings().getUserAgentString(), "", "application/pdf");
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    if (request != null && request.getUrl() != null) {
                        String requested = request.getUrl().toString();
                        if (isLikelyPdfUrl(requested, "", "")) {
                            fetchPdfAndReturn(requested, view.getSettings().getUserAgentString(), "", "application/pdf");
                            return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                        }
                    }
                } catch (Exception ignored) {}
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                try {
                    if (request != null && request.isForMainFrame() && errorResponse != null && errorResponse.getStatusCode() == 403) {
                        String blockedUrl = request.getUrl() == null ? lastIFlightUrl : request.getUrl().toString();
                        if (blockedUrl != null && blockedUrl.contains("/iflight-crew/") && portalWebView != null) {
                            updatePortalStatus("iFlight Crew retornou 403. Tentando portal alternativo CWP com a mesma sessão autorizada...");
                            lastIFlightUrl = IFLIGHT_CWP_MAIN_URL;
                            portalWebView.postDelayed(() -> {
                                try { if (portalWebView != null) portalWebView.loadUrl(IFLIGHT_CWP_MAIN_URL); } catch (Exception ignored) {}
                            }, 900);
                        } else {
                            updatePortalStatus("iFlight retornou 403. Use conta corporativa LATAM autorizada; o CrewCheck não tenta burlar permissão.");
                            showIFlightSsoCompatibilityDialog();
                        }
                    }
                } catch (Exception ignored) {}
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                super.onPageFinished(view, pageUrl);
                try { CookieManager.getInstance().flush(); } catch (Exception ignored) {}
                tunePortalForLoginOrApp(view, pageUrl);
                checkForIFlightSsoError(view, pageUrl);
                if (isAuthOrLoginUrl(pageUrl)) {
                    // Não injeta cliques/datas enquanto o usuário digita login, senha ou MFA.
                    return;
                }
                injectIFlightAutomation(view);
                view.postDelayed(() -> { if (portalWebView != null) injectIFlightAutomation(portalWebView); }, 1200);
                view.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 2600);
                view.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 5200);
            }
        });
        portalWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // O iFlight pode pedir permissão de push/notificação.
                // Por LGPD e para evitar travamento visual, o CrewCheck nega
                // a permissão na WebView interna sem afetar o login/MFA.
                try {
                    request.deny();
                } catch (Exception ignored) {}
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                try {
                    WebView popup = new WebView(MainActivity.this);
                    configureWebView(popup, true);
                    popup.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                            if (request != null && request.getUrl() != null && portalWebView != null) {
                                String targetUrl = request.getUrl().toString();
                                if (isLikelyPdfUrl(targetUrl, "", "")) {
                                    fetchPdfAndReturn(targetUrl, popupView.getSettings().getUserAgentString(), "", "application/pdf");
                                } else {
                                    portalWebView.loadUrl(targetUrl);
                                }
                            }
                            return true;
                        }
                    });
                    popup.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimeType, contentLength) -> fetchPdfAndReturn(downloadUrl, userAgent, contentDisposition, mimeType));
                    WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                    transport.setWebView(popup);
                    resultMsg.sendToTarget();
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }
        });
        portalWebView.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (isLikelyPdfUrl(downloadUrl, contentDisposition, mimeType)) {
                fetchPdfAndReturn(downloadUrl, userAgent, contentDisposition, mimeType);
            } else if (downloadUrl != null && downloadUrl.startsWith("blob:")) {
                captureBlobUrlFromPage(downloadUrl);
            } else {
                fetchPdfAndReturn(downloadUrl, userAgent, contentDisposition, mimeType);
            }
        });

        container.addView(toolbar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView guidance = new TextView(this);
        guidance.setText("Faça login/MFA no portal oficial. Depois o CrewCheck tenta abrir o Roster Calendar, varrer o mês, abrir detalhes de eventos e importar programação/tripulação automaticamente. Se Crew der 403, use CWP.");
        guidance.setTextColor(Color.parseColor("#D8F3FF"));
        guidance.setTextSize(11f);
        guidance.setGravity(Gravity.CENTER_VERTICAL);
        guidance.setPadding(dp(14), dp(9), dp(14), dp(9));
        guidance.setBackgroundColor(Color.parseColor("#0B2A45"));
        container.addView(guidance, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        FrameLayout portalFrame = new FrameLayout(this);
        portalFrame.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        portalFrame.addView(portalWebView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout mask = new LinearLayout(this);
        mask.setOrientation(LinearLayout.VERTICAL);
        mask.setGravity(Gravity.CENTER);
        mask.setPadding(dp(24), dp(24), dp(24), dp(24));
        mask.setBackgroundColor(Color.parseColor("#F2051020"));
        TextView maskTitle = new TextView(this);
        maskTitle.setText("CrewCheck AutoPull Admin");
        maskTitle.setTextColor(Color.WHITE);
        maskTitle.setTextSize(22f);
        maskTitle.setGravity(Gravity.CENTER);
        maskTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        portalMaskStatusText = new TextView(this);
        portalMaskStatusText.setText("Após o login/MFA oficial, esta máscara protege a navegação técnica enquanto o CrewCheck varre o Roster Calendar e captura detalhes/tripulação visíveis.");
        portalMaskStatusText.setTextColor(Color.parseColor("#BAE6FD"));
        portalMaskStatusText.setTextSize(13f);
        portalMaskStatusText.setGravity(Gravity.CENTER);
        portalMaskStatusText.setPadding(0, dp(12), 0, dp(16));
        Button showPortal = new Button(this);
        showPortal.setText("Mostrar portal oficial");
        showPortal.setAllCaps(false);
        showPortal.setOnClickListener(v -> setPortalMaskVisible(false));
        mask.addView(maskTitle, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        mask.addView(portalMaskStatusText, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        mask.addView(showPortal, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        portalMaskView = mask;
        portalFrame.addView(mask, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        container.addView(portalFrame);
        portalContainer = container;
        rootLayout.addView(container);
        portalWebView.loadUrl(url);
        setPortalMaskVisible(false);
        portalWebView.postDelayed(() -> { if (portalWebView != null) injectIFlightAutomation(portalWebView); }, 2500);
        portalWebView.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 6500);
    }


    private void updatePortalStatus(final String message) {
        runOnUiThread(() -> {
            try {
                if (portalStatusText != null) portalStatusText.setText(message == null ? "" : message);
                if (portalMaskStatusText != null) portalMaskStatusText.setText(message == null ? "" : message);
            } catch (Exception ignored) {}
        });
    }

    private void setPortalMaskVisible(final boolean visible) {
        runOnUiThread(() -> {
            try {
                if (portalMaskView != null) portalMaskView.setVisibility(visible ? View.VISIBLE : View.GONE);
            } catch (Exception ignored) {}
        });
    }

    private void pulseIFlightMenu() {
        updatePortalStatus("Tentando abrir o menu do iFlight. Login/MFA continuam manuais.");
        if (portalWebView != null) {
            injectIFlightAutomation(portalWebView);
            portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckOpenMenu)window.__crewcheckOpenMenu(true); if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null);
            pulseIFlightMenuSoft();
        }
    }

    private void pulseIFlightMenuSoft() {
        if (portalWebView == null) return;
        portalWebView.postDelayed(() -> tapPortalPercent(0.21f, 0.055f), 350);
        portalWebView.postDelayed(() -> {
            if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null);
        }, 1300);
    }

    private void forceIFlightReportFlow() {
        if (portalWebView == null) return;
        injectIFlightAutomation(portalWebView);
        portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckForceReport)window.__crewcheckForceReport(); if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null);
        pulseIFlightMenuSoft();
    }

    private void scheduleForcedIFlightDownload() {
        if (portalWebView == null) return;
        injectIFlightAutomation(portalWebView);
        forceIFlightReportFlow();
        portalWebView.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 3600);
        portalWebView.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 7600);
        portalWebView.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 12500);
        portalWebView.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckAutoStep)window.__crewcheckAutoStep();}catch(e){}})();", null); }, 18500);
        portalWebView.postDelayed(() -> { if (portalWebView != null) portalWebView.evaluateJavascript("(function(){try{if(window.__crewcheckForceReport)window.__crewcheckForceReport();}catch(e){}})();", null); }, 26000);
    }

    private void tapPortalPercent(float xPercent, float yPercent) {
        if (portalWebView == null) return;
        try {
            int width = portalWebView.getWidth();
            int height = portalWebView.getHeight();
            if (width <= 0 || height <= 0) return;
            float x = Math.max(1, Math.min(width - 2, width * xPercent));
            float y = Math.max(1, Math.min(height - 2, height * yPercent));
            long now = android.os.SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
            MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, x, y, 0);
            portalWebView.dispatchTouchEvent(down);
            portalWebView.dispatchTouchEvent(up);
            down.recycle();
            up.recycle();
        } catch (Exception ignored) {}
    }

    private String sanitizeJsonConfig(String configJson) {
        if (configJson == null || configJson.trim().isEmpty()) return "{}";
        try {
            return new JSONObject(configJson).toString();
        } catch (Exception ignored) {
            return "{}";
        }
    }


    private void checkForIFlightSsoError(WebView view, String pageUrl) {
        if (portalSsoErrorDetected || view == null) return;
        try {
            view.evaluateJavascript("(function(){return (document.body&&document.body.innerText)||'';})()", value -> {
                try {
                    Object parsed = new JSONTokener(value == null ? "\"\"" : value).nextValue();
                    String text = String.valueOf(parsed == null ? "" : parsed);
                    String merged = ((pageUrl == null ? "" : pageUrl) + " " + text).toLowerCase(Locale.US);
                    if (merged.contains("app_not_configured_for_user") || merged.contains("service is not configured for this user") || merged.contains("that’s an error") || merged.contains("that's an error")) {
                        portalSsoErrorDetected = true;
                        showIFlightSsoCompatibilityDialog();
                    }
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    private void showIFlightSsoCompatibilityDialog() {
        runOnUiThread(() -> {
            try {
                new AlertDialog.Builder(this)
                        .setTitle("iFlight bloqueou esta sessão")
                        .setMessage("O erro 403 app_not_configured_for_user vem da autenticação Google/SAML do iFlight. Pode ser conta Google incorreta, usuário sem permissão no app corporativo ou bloqueio da WebView. Primeiro tente com a conta corporativa no Chrome. Depois baixe o PDF e abra/compartilhe com o CrewCheck para importar sem salvar credenciais.")
                        .setPositiveButton("Abrir no Chrome", (dialog, which) -> openIFlightInExternalBrowser(lastIFlightUrl))
                        .setNegativeButton("Continuar aqui", null)
                        .show();
            } catch (Exception ignored) {}
        });
    }

    private void openIFlightInExternalBrowser(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url == null || url.trim().isEmpty() ? lastIFlightUrl : url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
            Toast.makeText(this, "Use o e-mail corporativo LATAM no Chrome. Ao baixar o PDF, use Compartilhar/Abrir com CrewCheck para importar.", Toast.LENGTH_LONG).show();
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Não encontrei navegador instalado para abrir o iFlight.", Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {}
    }

    private void openNativePdfPicker(boolean preferGoogleDrive) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/pdf");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "application/octet-stream"});
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

            if (preferGoogleDrive) {
                try {
                    Intent driveIntent = new Intent(intent);
                    driveIntent.setPackage("com.google.android.apps.docs");
                    if (driveIntent.resolveActivity(getPackageManager()) != null) {
                        startActivityForResult(driveIntent, NATIVE_PDF_PICKER_REQUEST_CODE);
                        Toast.makeText(this, "Abrindo Google Drive para escolher o PDF da escala...", Toast.LENGTH_LONG).show();
                        return;
                    }
                } catch (Exception ignored) {}
            }

            Intent chooser = Intent.createChooser(intent, preferGoogleDrive ? "Google Drive / Arquivos - escolher PDF" : "Escolher PDF da escala");
            startActivityForResult(chooser, NATIVE_PDF_PICKER_REQUEST_CODE);
        } catch (Exception error) {
            try {
                Intent webDrive = new Intent(Intent.ACTION_VIEW, Uri.parse("https://drive.google.com/drive/my-drive?hl=pt-br"));
                webDrive.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(webDrive);
            } catch (Exception ignored) {
                Toast.makeText(this, "Não consegui abrir o Google Drive ou o seletor de arquivos.", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void handleIncomingPdfIntent(Intent intent) {
        if (intent == null) return;
        try {
            String action = intent.getAction();
            Uri uri = null;
            if (Intent.ACTION_SEND.equals(action)) {
                Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (stream instanceof Uri) uri = (Uri) stream;
            } else if (Intent.ACTION_VIEW.equals(action)) {
                uri = intent.getData();
            }
            if (uri == null) return;
            readIncomingPdfUri(uri);
        } catch (Exception error) {
            Toast.makeText(this, "Não consegui receber o PDF compartilhado.", Toast.LENGTH_LONG).show();
        }
    }

    private void readIncomingPdfUri(Uri uri) throws Exception {
        String filename = "iFlight_RosterReport.pdf";
        String last = uri.getLastPathSegment();
        if (last != null && last.toLowerCase(Locale.US).contains("pdf")) filename = last.substring(Math.max(0, last.lastIndexOf('/') + 1));
        InputStream input = getContentResolver().openInputStream(uri);
        if (input == null) throw new Exception("PDF sem conteúdo.");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > MAX_PDF_BYTES) throw new Exception("PDF maior que 35 MB.");
            output.write(buffer, 0, read);
        }
        input.close();
        byte[] bytes = output.toByteArray();
        if (bytes.length < 4 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F') {
            throw new Exception("Arquivo recebido não parece ser PDF.");
        }
        pendingSharedPdfName = filename;
        pendingSharedPdfBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
        dispatchPendingSharedPdf();
    }

    private void returnPdfBase64FromPortal(final String filename, final String dataBase64) {
        if (dataBase64 == null || dataBase64.trim().isEmpty()) return;
        synchronized (this) {
            if (iflightPdfReceived) return;
            iflightPdfReceived = true;
        }
        updatePortalStatus("PDF capturado dentro do iFlight. Importando no CrewCheck...");
        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);
                if (bytes.length < 4 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F') {
                    synchronized (MainActivity.this) { iflightPdfReceived = false; }
                    finishIFlightWithError("Recebi um arquivo do iFlight, mas ele não parece ser PDF válido. Tente gerar novamente em PDF/LT ou importe manualmente.");
                    return;
                }
                if (bytes.length > MAX_PDF_BYTES) {
                    synchronized (MainActivity.this) { iflightPdfReceived = false; }
                    finishIFlightWithError("PDF maior que 35 MB. Baixe manualmente e importe pelo seletor.");
                    return;
                }
                String safeName = filename == null || filename.trim().isEmpty() ? "iFlight_RosterReport.pdf" : filename.trim();
                if (!safeName.toLowerCase(Locale.US).endsWith(".pdf")) safeName = safeName + ".pdf";
                JSONObject payload = new JSONObject();
                payload.put("ok", true);
                payload.put("filename", safeName);
                payload.put("sourceFileName", safeName);
                payload.put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                finishIFlightWithPayload(payload);
            } catch (Exception error) {
                synchronized (MainActivity.this) { iflightPdfReceived = false; }
                finishIFlightWithError(error.getMessage() == null ? "Falha ao receber PDF interno do iFlight." : error.getMessage());
            }
        }).start();
    }


    private void returnCalendarTextFromPortal(final String filename, final String text) {
        if (text == null || text.trim().length() < 80) return;
        synchronized (this) {
            if (iflightPdfReceived) return;
            iflightPdfReceived = true;
        }
        updatePortalStatus("Roster Calendar capturado dentro do iFlight. Importando no CrewCheck...");
        try {
            String safeName = filename == null || filename.trim().isEmpty() ? "iFlight_RosterCalendar.txt" : filename.trim();
            JSONObject payload = new JSONObject();
            payload.put("ok", true);
            payload.put("filename", safeName);
            payload.put("sourceFileName", safeName);
            payload.put("sourceFormat", "iflight-calendar-dom");
            payload.put("calendarText", text.length() > 650000 ? text.substring(0, 650000) : text);
            finishIFlightWithPayload(payload);
        } catch (Exception error) {
            synchronized (MainActivity.this) { iflightPdfReceived = false; }
            finishIFlightWithError(error.getMessage() == null ? "Falha ao receber calendário do iFlight." : error.getMessage());
        }
    }

    private void dispatchPendingSharedPdf() {
        if (webView == null || pendingSharedPdfBase64 == null) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("ok", true);
            payload.put("filename", pendingSharedPdfName == null ? "iFlight_RosterReport.pdf" : pendingSharedPdfName);
            payload.put("sourceFileName", pendingSharedPdfName == null ? "iFlight_RosterReport.pdf" : pendingSharedPdfName);
            payload.put("dataBase64", pendingSharedPdfBase64);
            String js = "(function(){var payload=" + payload.toString() + ";window.__crewcheckPendingNativePdf=payload;window.dispatchEvent(new CustomEvent('crewcheck:native-pdf',{detail:payload}));})();";
            webView.evaluateJavascript(js, null);
            pendingSharedPdfBase64 = null;
            pendingSharedPdfName = null;
            Toast.makeText(this, "Dados recebidos pelo CrewCheck. Importando escala...", Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {}
    }

    private void injectIFlightAutomation(WebView view) {
        if (view == null || activeIFlightConfigJson == null) return;
        String js = """
(function(config){
try{
  var topBar=document.getElementById('__crewcheck_iflight_topbar');
  var banner=null;
  function css(el, value){ try{ el.style.cssText=value; }catch(e){} }
  function ensureShell(){
    cleanupIFlightNoise();
    try{ var old=document.getElementById('__crewcheck_iflight_banner'); if(old&&old.parentNode) old.parentNode.removeChild(old); }catch(e){}
    if(document.body){
      document.body.style.overflowX='auto';
      if(!document.body.style.backgroundColor) document.body.style.backgroundColor='#f8fafc';
    }
  }
  function cleanupIFlightNoise(){
    try{
      var nodes=Array.prototype.slice.call(document.querySelectorAll('div,span,p,section,aside'));
      nodes.forEach(function(n){
        var t=String((n.innerText||n.textContent||'')).toLowerCase();
        if(t.indexOf('push notifications cannot be established')>=0 || t.indexOf('please contact system administrator')>=0){
          var e=n; for(var d=0;e&&d<3;d++,e=e.parentElement){ if(e&&e.style){ e.style.display='none'; e.style.visibility='hidden'; } }
        }
      });
    }catch(e){}
  }
  function show(msg){
    ensureShell();
    try{ if(window.AndroidCrewCheckPortal) AndroidCrewCheckPortal.status('CrewCheck · '+msg); }catch(e){}
  }
  function maskOn(msg){
    try{ if(config && config.silentPremiumPull && window.AndroidCrewCheckPortal) AndroidCrewCheckPortal.maskOn('CrewCheck · '+(msg||'sincronizando escala em modo mascarado...')); }catch(e){}
  }
  function maskOff(){ try{ if(window.AndroidCrewCheckPortal) AndroidCrewCheckPortal.maskOff(); }catch(e){} }
  window.capturePdfBlob=function capturePdfBlob(blob, filename){
    try{
      if(!blob || !blob.size) return false;
      var type=String(blob.type||'').toLowerCase();
      var name=String(filename||'iFlight_RosterReport.pdf');
      if(type.indexOf('pdf')<0 && name.toLowerCase().indexOf('.pdf')<0 && name.toLowerCase().indexOf('roster')<0) return false;
      show('PDF interno detectado. Convertendo para importar...');
      if(window.AndroidCrewCheckPortal){ try{ AndroidCrewCheckPortal.reportPdfCapture('PDF/blob detectado dentro do iFlight. Importando...'); }catch(e){} }
      var reader=new FileReader();
      reader.onloadend=function(){
        try{
          var result=String(reader.result||'');
          var base64=result.indexOf(',')>=0?result.split(',').pop():result;
          if(base64 && window.AndroidCrewCheckPortal){ AndroidCrewCheckPortal.receivePdfBase64(name, base64); }
        }catch(e){ show('PDF detectado, mas não consegui enviar ao CrewCheck. Use Importar PDF manualmente.'); }
      };
      reader.onerror=function(){ show('Falha ao ler PDF interno. Use Importar PDF manualmente.'); };
      reader.readAsDataURL(blob);
      return true;
    }catch(e){ return false; }
  };
  function installPdfCapture(){
    if(window.__crewcheckPdfCaptureInstalled) return;
    window.__crewcheckPdfCaptureInstalled=true;
    try{
      var originalCreateObjectURL=URL.createObjectURL;
      URL.createObjectURL=function(obj){
        try{ if(obj instanceof Blob) window.capturePdfBlob(obj,'iFlight_RosterReport.pdf'); }catch(e){}
        return originalCreateObjectURL.apply(this, arguments);
      };
    }catch(e){}
    try{
      var originalFetch=window.fetch;
      if(originalFetch){
        window.fetch=function(){
          return originalFetch.apply(this, arguments).then(function(response){
            try{
              var ct=(response.headers&&response.headers.get&&response.headers.get('content-type'))||'';
              var url=response.url||'';
              if(/pdf|rosterreport|download|report/i.test(ct+' '+url)){
                response.clone().blob().then(function(blob){ window.capturePdfBlob(blob,'iFlight_RosterReport.pdf'); }).catch(function(){});
              } else {
                response.clone().arrayBuffer().then(function(buf){
                  try{ var u=new Uint8Array(buf||[]); if(u.length>4 && u[0]===37&&u[1]===80&&u[2]===68&&u[3]===70) window.capturePdfBlob(new Blob([buf],{type:'application/pdf'}),'iFlight_RosterReport.pdf'); }catch(e){}
                }).catch(function(){});
              }
            }catch(e){}
            return response;
          });
        };
      }
    }catch(e){}
    try{
      var XHR=window.XMLHttpRequest;
      var originalOpen=XHR&&XHR.prototype&&XHR.prototype.open;
      var originalSend=XHR&&XHR.prototype&&XHR.prototype.send;
      if(originalOpen&&originalSend){
        XHR.prototype.open=function(method,url){ this.__crewcheckUrl=String(url||''); return originalOpen.apply(this, arguments); };
        XHR.prototype.send=function(){
          try{
            this.addEventListener('load',function(){
              try{
                var ct=String(this.getResponseHeader&&this.getResponseHeader('content-type')||'');
                var u=String(this.__crewcheckUrl||'');
                var resp=this.response;
                if(/pdf|rosterreport|download|report/i.test(ct+' '+u)){
                  if(resp instanceof Blob) window.capturePdfBlob(resp,'iFlight_RosterReport.pdf');
                  else if(resp instanceof ArrayBuffer) window.capturePdfBlob(new Blob([resp],{type:'application/pdf'}),'iFlight_RosterReport.pdf');
                  else if(typeof resp==='string' && resp.slice(0,4)==='%PDF') window.capturePdfBlob(new Blob([resp],{type:'application/pdf'}),'iFlight_RosterReport.pdf');
                  else if(typeof this.responseText==='string' && this.responseText.slice(0,4)==='%PDF') window.capturePdfBlob(new Blob([this.responseText],{type:'application/pdf'}),'iFlight_RosterReport.pdf');
                } else if(typeof this.responseText==='string' && this.responseText.slice(0,4)==='%PDF') {
                  window.capturePdfBlob(new Blob([this.responseText],{type:'application/pdf'}),'iFlight_RosterReport.pdf');
                }
              }catch(e){}
            });
          }catch(e){}
          return originalSend.apply(this, arguments);
        };
      }
    }catch(e){}
    try{
      var originalOpenWindow=window.open;
      window.open=function(url,name,features){
        try{ if(String(url||'').indexOf('blob:')===0) show('PDF em blob detectado. Se não importar sozinho, toque em PDF/Run novamente.'); }catch(e){}
        return originalOpenWindow ? originalOpenWindow.apply(this, arguments) : null;
      };
    }catch(e){}
  }
  var meta=document.querySelector('meta[name=viewport]');
  if(!meta){ meta=document.createElement('meta'); meta.name='viewport'; (document.head||document.documentElement).appendChild(meta); }
  if(meta) meta.content='width=1180, initial-scale=0.72, minimum-scale=0.35, maximum-scale=2.5, user-scalable=yes';
  window.Notification=window.Notification||{};
  try{ Object.defineProperty(window.Notification,'permission',{get:function(){return 'denied';}}); window.Notification.requestPermission=function(cb){ if(cb) cb('denied'); return Promise.resolve('denied'); }; }catch(e){}
  installPdfCapture();
  ensureShell();
  show('você está dentro do CrewCheck. Use e-mail corporativo apenas no SSO oficial do iFlight.');
  if(!config||!config.autoClicks)return;

  window.__crewcheckAutoRosterState=window.__crewcheckAutoRosterState||{attempts:0,roster:false,calendar:false,calendarScreen:false,report:false,run:false,menuAttempts:0,calendarAttempts:0,reportAttempts:0,lt:false,lastText:'',lastAction:'',phase:'start'};
  var state=window.__crewcheckAutoRosterState;
  if(window.__crewcheckAutoRosterInterval) clearInterval(window.__crewcheckAutoRosterInterval);

  function docs(){
    var out=[document];
    try{ Array.prototype.slice.call(window.frames||[]).forEach(function(fr){ try{ if(fr&&fr.document&&out.indexOf(fr.document)<0) out.push(fr.document); }catch(e){} }); }catch(e){}
    try{ Array.prototype.slice.call(document.querySelectorAll('iframe,frame')).forEach(function(f){ try{ if(f.contentDocument&&out.indexOf(f.contentDocument)<0) out.push(f.contentDocument); }catch(e){} }); }catch(e){}
    return out;
  }
  function winOf(el){ try{return (el&&el.ownerDocument&&el.ownerDocument.defaultView)||window;}catch(e){return window;} }
  function visible(el){
    if(!el) return false;
    try{
      var r=el.getBoundingClientRect();
      var w=winOf(el);
      var s=w.getComputedStyle? w.getComputedStyle(el) : getComputedStyle(el);
      return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0'&&r.bottom>=0&&r.right>=0;
    }catch(e){ return false; }
  }
  function txt(el){
    return String((el&& (el.innerText||el.textContent||el.value||el.title||el.getAttribute('aria-label')||el.getAttribute('alt')||el.getAttribute('href'))) || '').replace(/\\s+/g,' ').trim();
  }
  function attrs(el){
    if(!el) return '';
    try{return String((el.id||'')+' '+(el.name||'')+' '+(el.value||'')+' '+(el.title||'')+' '+(el.className||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.getAttribute('data-id')||'')+' '+(el.getAttribute('data-ng-click')||'')+' '+(el.getAttribute('ng-click')||'')+' '+(el.getAttribute('href')||''));}catch(e){return '';}
  }
  function all(){ var out=[]; docs().forEach(function(d){ try{ out=out.concat(Array.prototype.slice.call(d.querySelectorAll('a,button,input[type=button],input[type=submit],input[type=radio],label,span,div,td,li,[role=button],[onclick],svg,i'))); }catch(e){} }); return out; }
  function clickable(el){ try{ return el&&el.closest&&el.closest('a,button,input[type=button],input[type=submit],[role=button],[onclick],li,td'); }catch(e){ return el; } }
  function firePointer(el,x,y){
    try{
      var w=winOf(el);
      ['mouseover','mouseenter','mousemove','pointerdown','touchstart','mousedown','pointerup','touchend','mouseup','click'].forEach(function(n){
        var ev;
        if(n.indexOf('touch')===0 && w.TouchEvent){ ev=new w.TouchEvent(n,{bubbles:true,cancelable:true}); }
        else if(n.indexOf('pointer')===0 && w.PointerEvent){ ev=new w.PointerEvent(n,{bubbles:true,cancelable:true,clientX:x||0,clientY:y||0,pointerType:'touch'}); }
        else { ev=new w.MouseEvent(n,{bubbles:true,cancelable:true,clientX:x||0,clientY:y||0,view:w}); }
        el.dispatchEvent(ev);
      });
      return true;
    }catch(e){ try{el.click();return true;}catch(err){} }
    return false;
  }
  function safeClick(el){
    if(!el) return false;
    var target=clickable(el)||el;
    state.clickedAt=state.clickedAt||{};
    var clickKey=(normText(txt(target))+'|'+normText(attrs(target))).slice(0,140);
    var now=Date.now();
    if(clickKey && state.clickedAt[clickKey] && now-state.clickedAt[clickKey] < 6500) return false;
    if(clickKey) state.clickedAt[clickKey]=now;
    try{target.scrollIntoView({block:'center',inline:'center'});}catch(e){}
    try{target.focus&&target.focus();}catch(e){}
    var r; try{r=target.getBoundingClientRect();}catch(e){r={left:0,top:0,width:1,height:1};}
    var ok=firePointer(target,(r.left||0)+(r.width||1)/2,(r.top||0)+(r.height||1)/2);
    try{ target.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',code:'Enter'})); target.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'})); }catch(e){}
    return ok;
  }
  function tapAt(x,y){ try{ var el=document.elementFromPoint(x,y); if(!el) return false; state.lastAction='tap '+Math.round(x)+','+Math.round(y)+' em '+txt(el).slice(0,44); return safeClick(el); }catch(e){ return false; } }
  function textMatch(t,pat,exact){ t=String(t||'').toLowerCase(); pat=String(pat||'').toLowerCase(); if(!t||!pat) return false; if(exact) return t===pat || t.replace(/[^a-z0-9]+/g,' ').trim()===pat; return t.indexOf(pat)>=0; }
  function isDangerText(t){ return /send|logout|sign out|sair|create account|delete|remove/i.test(String(t||'')); }
  function clickText(patterns, exact){
    var list=all().filter(visible).sort(function(a,b){ return txt(a).length-txt(b).length; });
    for(var p=0;p<patterns.length;p++){
      var pat=String(patterns[p]);
      for(var i=0;i<list.length;i++){
        var el=list[i]; var t=txt(el); if(!t) continue;
        if(textMatch(t,pat,exact)&&!isDangerText(t)){ state.lastAction='click '+pat+' em '+t.slice(0,60); return safeClick(el); }
      }
    }
    return false;
  }
  function clickSelector(selectors){
    var ds=docs();
    for(var k=0;k<ds.length;k++){
      var d=ds[k];
      for(var i=0;i<selectors.length;i++){
        var list=[]; try{ list=Array.prototype.slice.call(d.querySelectorAll(selectors[i])); }catch(e){ list=[]; }
        for(var j=0;j<list.length;j++){ if(visible(list[j])){ state.lastAction='selector '+selectors[i]; return safeClick(list[j]); } }
      }
    }
    return false;
  }
  function clickHrefOrText(words){
    var list=all().filter(visible).sort(function(a,b){ return txt(a).length-txt(b).length; });
    for(var w=0; w<words.length; w++){
      var pat=String(words[w]).toLowerCase();
      for(var i=0;i<list.length;i++){
        var el=list[i]; var v=(txt(el)+' '+attrs(el)).toLowerCase();
        if(v.indexOf(pat)>=0&&!isDangerText(v)){ state.lastAction='atalho '+pat; return safeClick(el); }
      }
    }
    return false;
  }
  function openHamburger(force){
    state.menuAttempts++;
    var clicked=clickSelector(['.navbar-toggle','.menu-toggle','.hamburger','[class*="hamburger"]','[class*="menu-toggle"]','[class*="navbar-toggle"]','button[aria-label*="menu" i]','button[title*="menu" i]','a[title*="menu" i]','.fa-bars','.glyphicon-menu-hamburger','[class*="fa-bars"]','[class*="bars"]','[class*="icon-menu"]']);
    if(!clicked){
      var iw=Math.max(360,window.innerWidth||1180), ih=Math.max(640,window.innerHeight||1600);
      var points=[[128,28],[145,38],[150,44],[155,50],[136,56],[112,42],[86,34],[160,54],[145,70],[145,88],[165,96],[105,72],[190,70],[150,115],[145,130],[220,88],[42,36],[54,52],[92,52],[118,52],[iw*.12,ih*.05],[iw*.13,ih*.065],[iw*.16,ih*.075],[iw*.20,ih*.055],[iw*.09,ih*.075]];
      for(var i=0;i<points.length&&!clicked;i++) clicked=tapAt(points[i][0],points[i][1]);
    }
    if(!clicked && window.AndroidCrewCheckPortal && state.menuAttempts%2===0){ try{ AndroidCrewCheckPortal.nativeTapMenu(); clicked=true; state.lastAction='nativeTapMenu'; }catch(e){} }
    if(clicked) show(force?'menu solicitado manualmente.':'abrindo menu do iFlight para localizar Roster...');
    return clicked;
  }
  function hasLoginOrMfa(){
    var body=((document.body&&document.body.innerText)||'').toLowerCase();
    var href=String(location.href||'').toLowerCase();
    var title=String(document.title||'').toLowerCase();
    var visibleInputs=Array.prototype.slice.call(document.querySelectorAll('input')).filter(function(input){ try{ if(input.type==='hidden') return false; return visible(input); }catch(e){ return false; } });
    var pwdOrOtp=visibleInputs.some(function(input){
      var v=String((input.type||'')+' '+(input.name||'')+' '+(input.id||'')+' '+(input.placeholder||'')+' '+(input.autocomplete||'')).toLowerCase();
      return v.indexOf('password')>=0||v.indexOf('senha')>=0||v.indexOf('passcode')>=0||v.indexOf('otp')>=0||v.indexOf('one-time')>=0||v.indexOf('verification')>=0||v.indexOf('authenticator')>=0;
    });
    var isGoogleOrSso=/accounts\\.google|signin|saml|oauth|login|auth/i.test(href+' '+title);
    var ssoText=/sign in|use your google account|forgot email|not your computer|senha|verifica[cç][aã]o|verification|2-step|two-step|mfa|authenticator|digite o c[oó]digo/.test(body);
    return pwdOrOtp || (isGoogleOrSso && ssoText);
  }
  function setVal(el,val){ if(!el||!val)return false; try{el.scrollIntoView({block:'center'});}catch(e){} el.focus&&el.focus(); var desc=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value'); if(desc&&desc.set)desc.set.call(el,val); else el.value=val; ['input','change','keyup','blur'].forEach(function(n){el.dispatchEvent(new Event(n,{bubbles:true}));}); return true; }
  function labelInput(label){ var nodes=[]; docs().forEach(function(d){ try{ nodes=nodes.concat(Array.prototype.slice.call(d.querySelectorAll('label,span,td,div'))); }catch(e){} }); for(var i=0;i<nodes.length;i++){ var n=nodes[i]; if(!visible(n))continue; var t=txt(n).toLowerCase(); if(t.indexOf(label.toLowerCase())<0)continue; var p=n.parentElement; for(var d=0;p&&d<6;d++,p=p.parentElement){ var input=p.querySelector('input:not([type=hidden])'); if(input&&visible(input))return input; } var next=n.nextElementSibling; while(next){ if(next.matches&&next.matches('input'))return next; var q=next.querySelector&&next.querySelector('input:not([type=hidden])'); if(q&&visible(q))return q; next=next.nextElementSibling; } } return null; }
  function fillDates(){ if(hasLoginOrMfa() || !reportFormVisible()) return false; var changed=false; var inputs=[]; docs().forEach(function(d){ try{ inputs=inputs.concat(Array.prototype.slice.call(d.querySelectorAll('input:not([type=hidden]):not([type=password])')).filter(visible)); }catch(e){} }); function attrHas(input,word){ var v=String((input.name||'')+' '+(input.id||'')+' '+(input.placeholder||'')+' '+(input.title||'')).toLowerCase(); return v.indexOf(word)>=0; } var from=labelInput('From Date')||inputs.find(function(i){return attrHas(i,'from');}); var to=labelInput('To Date')||inputs.find(function(i){return attrHas(i,'to');}); if(!from&&inputs.length>=1)from=inputs[0]; if(!to&&inputs.length>=2)to=inputs[1]; if(from&&from.value!==config.fromDate)changed=setVal(from,config.fromDate)||changed; if(to&&to.value!==config.toDate)changed=setVal(to,config.toDate)||changed; try{ if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); }catch(e){} return changed; }
  function selectPdf(){ var changed=false; var selects=[]; docs().forEach(function(d){ try{ selects=selects.concat(Array.prototype.slice.call(d.querySelectorAll('select'))); }catch(e){} }); selects.forEach(function(sel){ if(!visible(sel))return; for(var i=0;i<sel.options.length;i++){ var o=sel.options[i]; var v=String(o.text+' '+o.value).toLowerCase(); if(v.indexOf('pdf')>=0){ if(sel.selectedIndex!==i){ sel.selectedIndex=i; sel.dispatchEvent(new Event('change',{bubbles:true})); changed=true; } break; } } }); if(!changed) changed=clickText(['pdf'], true); return changed; }
  function ensureLT(){ var changed=false; var selects=[]; docs().forEach(function(d){ try{ selects=selects.concat(Array.prototype.slice.call(d.querySelectorAll('select'))); }catch(e){} }); selects.forEach(function(sel){ if(!visible(sel))return; for(var i=0;i<sel.options.length;i++){ var o=sel.options[i]; var raw=String(o.text+' '+o.value).trim(); if(/^(lt|local time)$/i.test(raw)||/\\bLT\\b/.test(raw)){ if(sel.selectedIndex!==i){ sel.selectedIndex=i; sel.dispatchEvent(new Event('change',{bubbles:true})); changed=true; } state.lt=true; break; } } }); var list=all(); for(var i=0;i<list.length;i++){ var el=list[i]; if(!visible(el))continue; var t=txt(el); var a=attrs(el); var isLt=/^(LT|Local Time)$/i.test(t)||/^(LT|Local Time)$/i.test(a)||(/\\bLT\\b/i.test(a)&&/(radio|button|toggle|time|zone|local)/i.test(a)); if(!isLt)continue; var active=/active|selected|checked|on/i.test(String(el.className||''))||el.getAttribute('aria-pressed')==='true'||el.checked===true; if(!active){ safeClick(el); changed=true; } state.lt=true; break; } return changed; }
  function setLegend(){ var boxes=[]; docs().forEach(function(d){ try{ boxes=boxes.concat(Array.prototype.slice.call(d.querySelectorAll('input[type=checkbox]'))); }catch(e){} }); for(var i=0;i<boxes.length;i++){ var box=boxes[i]; if(box&&visible(box)&&!!config.includeLegend!==box.checked){ safeClick(box); return true; } } return false; }
  function bodyText(){ var out=''; docs().forEach(function(d){ try{ out+=' '+((d.body&&d.body.innerText)||''); }catch(e){} }); return out; }

  function monthNumberFromName(name){
    var map={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,fev:2,abr:4,mai:5,ago:8,set:9,out:10,dez:12};
    return map[String(name||'').slice(0,3).toLowerCase()]||0;
  }
  function pad2(n){ n=Number(n)||0; return String(n).padStart(2,'0'); }
  function rosterCalendarPeriod(){
    var b=bodyText();
    var year=Number(config.periodYear)||new Date().getFullYear();
    var month=Number(config.periodMonth)||new Date().getMonth()+1;
    var m=b.match(/\\b([A-Za-z]{3})\\s+(\\d{4})\\s*-\\s*([A-Za-z]{3})\\s+(\\d{4})\\b/i);
    if(m){ var mm=monthNumberFromName(m[1]); if(mm){ month=mm; year=Number(m[2])||year; } }
    var range=b.match(/\\b\\d{1,2}-([A-Za-z]{3})-(\\d{4})\\s*-\\s*\\d{1,2}-([A-Za-z]{3})-(\\d{4})\\b/i);
    if(range){ var rm=monthNumberFromName(range[1]); if(rm){ month=rm; year=Number(range[2])||year; } }
    return {month:month, year:year};
  }
  function rosterCalendarStructuredJson(){
    try{
      var period=rosterCalendarPeriod();
      var out=[];
      docs().forEach(function(d){
        var els=[];
        try{ els=Array.prototype.slice.call(d.querySelectorAll('td,th,div,span,a,button,label')); }catch(e){ return; }
        els=els.filter(visible);
        var pageTop=0;
        try{ pageTop=(d.body&&d.body.getBoundingClientRect&&d.body.getBoundingClientRect().top)||0; }catch(e){}
        var markers=[];
        els.forEach(function(el){
          var t=txt(el);
          if(!/^\\d{1,2}$/.test(t)) return;
          var day=Number(t); if(day<1||day>31) return;
          var r=el.getBoundingClientRect();
          if(!r || r.width>95 || r.height>45 || r.top<120) return;
          markers.push({day:day,x:r.left+r.width/2,y:r.top+r.height/2,top:r.top,left:r.left,right:r.right,bottom:r.bottom});
        });
        markers.sort(function(a,b){ return a.y-b.y || a.x-b.x; });
        var dedup=[];
        markers.forEach(function(m){
          var exists=dedup.some(function(o){return o.day===m.day && Math.abs(o.x-m.x)<18 && Math.abs(o.y-m.y)<18;});
          if(!exists) dedup.push(m);
        });
        markers=dedup;
        if(markers.length<5) return;
        var rows=[];
        markers.forEach(function(m){
          var row=rows.find(function(r){return Math.abs(r.y-m.y)<42;});
          if(!row){ row={y:m.y,items:[]}; rows.push(row); }
          row.items.push(m);
          row.y=(row.y*(row.items.length-1)+m.y)/row.items.length;
        });
        rows.sort(function(a,b){return a.y-b.y;});
        rows.forEach(function(row){ row.items.sort(function(a,b){return a.x-b.x;}); });
        function dateForRect(rect){
          var cx=rect.left+rect.width/2, cy=rect.top+Math.min(rect.height/2,18);
          var best=null, bestScore=1e9;
          rows.forEach(function(row,ri){
            var nextY=(rows[ri+1]&&rows[ri+1].y)||1e9;
            var prevY=(rows[ri-1]&&rows[ri-1].y)||-1e9;
            var inRow=cy>=row.y-18 && cy<nextY-6;
            if(!inRow && Math.abs(cy-row.y)>85) return;
            row.items.forEach(function(item,ii){
              var prev=row.items[ii-1]; var next=row.items[ii+1];
              var left=prev ? (prev.x+item.x)/2 : -1e9;
              var right=next ? (next.x+item.x)/2 : 1e9;
              var insideX=cx>=left && cx<right;
              var score=Math.abs(cx-item.x)+(insideX?0:80)+Math.abs(cy-row.y)*.65;
              if(score<bestScore){ bestScore=score; best=item; }
            });
          });
          if(!best) return null;
          return period.year+'-'+pad2(period.month)+'-'+pad2(best.day);
        }
        var eventCandidates=[];
        els.forEach(function(el){
          var t=txt(el).replace(/\\s+/g,' ').trim();
          if(!t || t.length<2 || t.length>180) return;
          if(!/(\\bLA\\s*\\d{3,4}\\b|\\bLA\\d{3,4}\\b|\\bASB\\b|\\bHSBE?\\b|\\bDO\\b|\\bDR\\b|\\bMT\\b|\\bCBF\\b|\\bEMER\\b|\\bCRM\\b|\\bC\\d{2,3}F\\b|\\d{1,2}:\\d{2})/i.test(t)) return;
          if(/Roster Calendar|Statistics|Current|Welcome|Copyright|Home|Profile|Airport|Alert History|Swap|Roster Report/i.test(t)) return;
          var r=el.getBoundingClientRect();
          if(!r || r.top<120 || r.width<12 || r.height<8) return;
          var style=''; try{ var cs=winOf(el).getComputedStyle(el); style=(cs.backgroundColor||'')+' '+(cs.color||'')+' '+(cs.borderColor||'')+' '+(el.className||''); }catch(e){}
          eventCandidates.push({text:t,rect:{left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom},style:style});
        });
        var seen={};
        eventCandidates.forEach(function(ev){
          var date=dateForRect(ev.rect);
          if(!date) return;
          var key=date+'|'+ev.text;
          if(seen[key]) return; seen[key]=true;
          out.push({date:date,text:ev.text,style:ev.style.slice(0,180),x:Math.round(ev.rect.left),y:Math.round(ev.rect.top),w:Math.round(ev.rect.width),h:Math.round(ev.rect.height)});
        });
      });
      out.sort(function(a,b){ return String(a.date).localeCompare(String(b.date)) || a.y-b.y || a.x-b.x; });
      if(out.length<3) return '';
      return JSON.stringify({source:'iflight-web-calendar-dom-v10846',period:rosterCalendarPeriod(),events:out.slice(0,220)});
    }catch(e){ return ''; }
  }
  function detailPanelText(){
    var chunks=[];
    try{
      docs().forEach(function(d){
        var sels='[role=dialog],.modal,.popover,.tooltip,.x-tip,.x-window,.x-panel,.detail,.details,.crew,.tripulation,.tripulacao,.crew-list,.crewList';
        Array.prototype.slice.call(d.querySelectorAll(sels)).forEach(function(el){
          if(!visible(el)) return;
          var t=(txt(el)+' '+attrs(el)).replace(/\s+/g,' ').trim();
          if(t && t.length>20) chunks.push(t);
        });
      });
    }catch(e){}
    return chunks.join('\n');
  }
  function calendarEventElements(){
    var list=[];
    try{
      list=all().filter(visible).filter(function(el){
        var t=(txt(el)+' '+attrs(el)).replace(/\s+/g,' ').trim();
        if(!t || t.length<2 || t.length>260) return false;
        if(/Roster Calendar|Statistics|Current|Welcome|Copyright|Home|Profile|Airport|Alert History|Swap|Roster Report/i.test(t)) return false;
        return /(LA *[0-9]{3,4}|LA[0-9]{3,4}|ASB|HSB|HSBE|DO|DR|MT|CBF|EMER|CRM|C[0-9]{2,3}F|[0-9]{1,2}:[0-9]{2})/i.test(t);
      }).slice(0,60);
    }catch(e){}
    return list;
  }
  function startCalendarDetailSweep(){
    if(state.detailSweepStarted) return false;
    var items=calendarEventElements();
    if(!items.length) return false;
    state.detailSweepStarted=true;
    window.__crewcheckDetailTexts=window.__crewcheckDetailTexts||[];
    var i=0;
    show('Roster Calendar aberto. Abrindo detalhes dos eventos para capturar tripulação...');
    function closePanels(){
      try{ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true})); }catch(e){}
      try{ Array.prototype.slice.call(document.querySelectorAll('button,a,span,div')).filter(visible).some(function(el){ var t=normText(txt(el)); if(t==='close'||t==='fechar'||t==='ok'){ return safeClick(el); } return false; }); }catch(e){}
    }
    function stepDetail(){
      if(i>=items.length){ setTimeout(function(){ sendRosterCalendarText(true); },700); return; }
      var el=items[i++];
      try{ tapNear(el,[[.50,.50,0,0],[.20,.50,0,0],[.80,.50,0,0]]) || safeClick(el); }catch(e){}
      setTimeout(function(){
        try{
          var d=detailPanelText();
          if(d && d.length>25) window.__crewcheckDetailTexts.push(d);
          closePanels();
        }catch(e){}
        setTimeout(stepDetail,180);
      },420);
    }
    stepDetail();
    return true;
  }
  function rosterCalendarText(){
    var chunks=[];
    try{ if(window.__crewcheckDetailTexts && window.__crewcheckDetailTexts.length) chunks.push('__CREWCHECK_IFLIGHT_DETAIL_TEXT__\n'+window.__crewcheckDetailTexts.join('\n---\n')); }catch(e){}
    var structured=rosterCalendarStructuredJson();
    if(structured){ chunks.push('__CREWCHECK_IFLIGHT_CALENDAR_JSON__\n'+structured+'\n__CREWCHECK_IFLIGHT_CALENDAR_TEXT__'); }
    docs().forEach(function(d){
      try{
        var txt=(d.body&&d.body.innerText)||'';
        if(txt) chunks.push(txt);
        var rows=Array.prototype.slice.call(d.querySelectorAll('table tr,.x-grid-row,.grid-row,.calendar-row,.roster-row,[role=row],.fc-event,.event,.appointment'));
        rows.slice(0,900).forEach(function(r){ var t=String(r.innerText||r.textContent||'').replace(/\\s+/g,' ').trim(); if(t) chunks.push(t); });
      }catch(e){}
    });
    return chunks.join('\n').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  }
  function calendarTextUseful(t){
    t=String(t||'');
    var hasFlight=/\\bLA\\s*\\d{3,4}\\b/i.test(t);
    var hasRoster=/Roster|Calendar|Current|Statistics|Escala|Tripula|AIMS|ASB|HSB|DO|CRM|CBF|EMER/i.test(t);
    var hasDate=/\\b\\d{1,2}[\\/.-]\\d{1,2}(?:[\\/.-]\\d{2,4})?\\b|\\b\\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b/i.test(t);
    return t.length>120 && (hasFlight || /\\b(ASB|HSB|HSBE|CBF|EMER|C\\d{2,3}F|DO|DR)\\b/i.test(t)) && (hasRoster || hasDate);
  }
  function sendRosterCalendarText(force){
    if(state.calendarReturned) return false;
    if(!force && config && config.format==='calendar_first' && config.collectCrewList && config.openEventDetails && !state.detailSweepStarted && calendarVisible()){ if(startCalendarDetailSweep()) return true; }
    var t=rosterCalendarText();
    if(!calendarTextUseful(t)) return false;
    state.calendarReturned=true;
    show('Roster Calendar lido diretamente dentro do iFlight. Importando sem PDF...');
    try{ if(window.AndroidCrewCheckPortal) AndroidCrewCheckPortal.receiveCalendarText('iFlight_RosterCalendar.txt', t.slice(0,650000)); }catch(e){ state.calendarReturned=false; }
    return true;
  }
  window.__crewcheckCaptureCalendarText=sendRosterCalendarText;
  function debugStatus(reason){ try{ var sample=bodyText().replace(/\\s+/g,' ').trim().slice(0,260); var msg=(reason||'diagnóstico')+' · fase='+(state.phase||'-')+' · url='+String(location.pathname||location.href).slice(0,90)+' · ação='+(state.lastAction||'-')+' · texto='+(sample||'[sem texto detectável]'); if(window.AndroidCrewCheckPortal) AndroidCrewCheckPortal.status(msg); }catch(e){} }
  function formReady(){ var body=bodyText().toLowerCase(); var hasRun=body.indexOf('run')>=0 || all().some(function(e){return /^run$/i.test(txt(e));}); var hasPdf=body.indexOf('pdf')>=0 || docs().some(function(d){ try{return d.querySelector('select');}catch(e){return false;} }); return hasRun && hasPdf; }
  function normText(v){ return String(v||'').replace(/\\s+/g,' ').replace(/[^a-z0-9 ]+/gi,' ').trim().toLowerCase(); }
  function menuVisibleRaw(){
    var b=normText(bodyText());
    if(!b) return false;
    var strong=/\\bhome\\b.*\\bprofile\\b.*\\bswap\\b.*\\broster\\b/.test(b)||/\\bprofile\\b.*\\bswap\\b.*\\broster\\b.*\\bmy travel\\b/.test(b)||/\\balert history\\b.*\\bairport\\b.*\\badmin\\b/.test(b);
    if(strong) return true;
    var matches=0;
    ['home','profile','swap','roster','my travel','training','airport','alert history'].forEach(function(w){ if(b.indexOf(w)>=0) matches++; });
    return matches>=4;
  }
  function reportFormVisible(){ var body=bodyText(); if(/From Date|To Date|Select Format|Include Legend/i.test(body)) return true; if(formReady() && /Roster Report/i.test(body) && !menuVisibleRaw()) return true; return false; }
  function visibleRoster(){ return reportFormVisible(); }
  function calendarVisible(){ var b=bodyText(); return !reportFormVisible() && (/Roster Calendar/i.test(b) || (/Current|Statistics/i.test(b)&&/DOM|SEG|TER|QUA|QUI|SEX|SAB|SUN|MON|TUE|WED|THU|FRI|SAT/i.test(b)) || (/Roster/i.test(b)&&/Calendar/i.test(b)&&/Report/i.test(b))); }
  function menuVisible(){ return menuVisibleRaw() && !reportFormVisible(); }
  function tapNear(el,spots){ if(!el) return false; try{ var r=el.getBoundingClientRect(); for(var i=0;i<spots.length;i++){ var x=(r.left||0)+(r.width||1)*spots[i][0]+(spots[i][2]||0); var y=(r.top||0)+(r.height||1)*spots[i][1]+(spots[i][3]||0); var d=el.ownerDocument||document; var target=d.elementFromPoint? d.elementFromPoint(x,y) : null; if(target && firePointer(target,x,y)) return true; if(firePointer(el,x,y)) return true; } }catch(e){} return safeClick(el); }
  function clickExactItem(labels){
    var list=all().filter(visible).sort(function(a,b){return txt(a).length-txt(b).length;});
    for(var l=0;l<labels.length;l++){
      var label=normText(labels[l]);
      for(var i=0;i<list.length;i++){
        var el=list[i]; var t=normText(txt(el));
        if(t===label || t.replace(/ +/g,'')===label.replace(/ +/g,'')){ state.lastAction='item exato '+labels[l]; return tapNear(el,[[.50,.50,0,0],[.18,.50,0,0],[.82,.50,0,0]]); }
      }
    }
    return false;
  }
  function findExact(labels){
    var list=all().filter(visible).sort(function(a,b){return txt(a).length-txt(b).length;});
    for(var l=0;l<labels.length;l++){
      var label=normText(labels[l]);
      for(var i=0;i<list.length;i++){
        var el=list[i]; var t=normText(txt(el));
        if(t===label || t.replace(/ +/g,'')===label.replace(/ +/g,'')) return el;
      }
    }
    return null;
  }
  function expandRosterMenu(){
    var el=findExact(['Roster']);
    if(el){
      state.lastAction='expandir Roster';
      if(tapNear(el,[[.10,.50,-24,0],[.50,.50,0,0],[.90,.50,18,0],[.98,.50,32,0]])) return true;
      var p=el.parentElement;
      for(var d=0;p&&d<5;d++,p=p.parentElement){ if(visible(p) && tapNear(p,[[.08,.50,0,0],[.25,.50,0,0],[.50,.50,0,0],[.92,.50,0,0]])) return true; }
    }
    return clickHrefOrText(['menuRoster','menu-roster','roster']);
  }
  function clickRosterMenu(){ return clickExactItem(['Roster']) || expandRosterMenu(); }
  function clickCalendarOnly(){ return clickExactItem(['Roster Calendar','RosterCalendar']) || clickHrefOrText(['rostercalendar','roster-calendar','roster calendar']); }
  function clickReportMenuItem(){ return clickExactItem(['Roster Report','RosterReport']) || clickHrefOrText(['rosterreport','roster-report','roster report']); }
  function clickCalendarReportButton(){
    state.reportAttempts++;
    try{ docs().forEach(function(d){ try{ d.defaultView.scrollTo(0, d.body ? d.body.scrollHeight : 9999); }catch(e){} }); }catch(e){}
    var list=all().filter(visible).sort(function(a,b){ return txt(a).length-txt(b).length; });
    for(var i=0;i<list.length;i++){
      var el=list[i]; var t=normText(txt(el)); var a=normText(attrs(el));
      if((t==='roster report' || t==='rosterreport' || a.indexOf('rosterreport')>=0 || a.indexOf('roster report')>=0) && !isDangerText(t+' '+a)){
        state.lastAction='botão Roster Report no calendário';
        var target=clickable(el)||el;
        return tapNear(target,[[.50,.50,0,0],[.20,.50,0,0],[.80,.50,0,0],[.50,.50,20,0]]);
      }
    }
    var iw=Math.max(360,window.innerWidth||1180), ih=Math.max(640,window.innerHeight||1600);
    var points=[[iw-70,ih-54],[iw-100,ih-54],[iw-72,ih-88],[iw*.86,ih*.84],[iw*.80,ih*.80],[iw*.90,ih*.78],[iw*.78,ih*.78],[iw*.83,ih*.78],[iw*.76,ih*.84]];
    for(var p=0;p<points.length;p++){ if(tapAt(points[p][0],points[p][1])) return true; }
    return false;
  }
  function clickRunButton(){
    try{ if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); }catch(e){}
    if(clickExactItem(['Run','RUN']) || clickText(['Run'], true) || clickHrefOrText(['runReport','run-report','run'])) return true;
    var list=all().filter(visible);
    for(var i=0;i<list.length;i++){ var el=list[i]; var v=normText(txt(el)+' '+attrs(el)); if(/^run$/.test(v)||/\\brun\\b/.test(v)){ state.lastAction='Run fallback'; return safeClick(el); } }
    var iw=Math.max(360,window.innerWidth||1180), ih=Math.max(640,window.innerHeight||1600);
    var pts=[[iw*.46,190],[iw*.48,205],[iw*.42,190],[iw*.55,190],[270,160],[295,160],[310,190]];
    for(var p=0;p<pts.length;p++){ if(tapAt(pts[p][0],pts[p][1])) return true; }
    return false;
  }
  window.__crewcheckOpenMenu=function(force){ return openHamburger(!!force); };
  window.__crewcheckClickRoster=function(){
    if(hasLoginOrMfa()){ maskOff(); show('login/MFA detectado. Automação pausada para você digitar sem interferência.'); return; }
    cleanupIFlightNoise();
    openHamburger(true);
    setTimeout(function(){ expandRosterMenu() || clickRosterMenu(); },500);
    setTimeout(function(){ clickCalendarOnly() || clickReportMenuItem(); },1300);
    setTimeout(function(){ if(calendarVisible()) clickCalendarReportButton(); },2500);
  };
  window.__crewcheckClickReport=function(){
    if(hasLoginOrMfa()){ maskOff(); show('login/MFA detectado. Automação pausada para você digitar sem interferência.'); return; }
    cleanupIFlightNoise();
    if(reportFormVisible()){ fillDates(); selectPdf(); ensureLT(); setLegend(); return; }
    if(calendarVisible()){ clickCalendarReportButton(); return; }
    clickReportMenuItem() || clickCalendarOnly();
  };
  window.__crewcheckRunNow=function(){
    if(hasLoginOrMfa()){ maskOff(); show('login/MFA detectado. Automação pausada para você digitar sem interferência.'); return; }
    cleanupIFlightNoise();
    fillDates(); selectPdf(); ensureLT(); setLegend();
    setTimeout(function(){ ensureLT(); if(formReady()) clickRunButton(); else { clickCalendarReportButton() || clickReportMenuItem(); setTimeout(function(){ fillDates(); selectPdf(); ensureLT(); setLegend(); clickRunButton(); },1500); } },900);
  };
  window.__crewcheckForceReport=function(){
    if(hasLoginOrMfa()){ state.phase='login'; maskOff(); show('login/MFA detectado. Automação pausada para você digitar sem interferência. Depois do login, toque em Auto ou PDF.'); return; }
    state.run=false; state.attempts=0; state.calendarAttempts=0; state.reportAttempts=0; state.phase='force';
    cleanupIFlightNoise();
    if(reportFormVisible()){
      fillDates(); selectPdf(); ensureLT(); setLegend();
      setTimeout(function(){ ensureLT(); selectPdf(); if(formReady()) clickRunButton(); else debugStatus('formulário não pronto antes do Run'); },900);
      setTimeout(function(){ ensureLT(); selectPdf(); clickRunButton(); },2200);
      return;
    }
    if(calendarVisible()){
      setTimeout(function(){ clickCalendarReportButton(); },450);
      setTimeout(function(){ fillDates(); selectPdf(); ensureLT(); setLegend(); },1800);
      setTimeout(function(){ ensureLT(); if(formReady()) clickRunButton(); else debugStatus('calendário sem formulário após Roster Report'); },3000);
      return;
    }
    openHamburger(true);
    setTimeout(function(){ clickCalendarOnly() || expandRosterMenu(); },750);
    setTimeout(function(){ clickCalendarOnly(); },1650);
    setTimeout(function(){ if(calendarVisible()) clickCalendarReportButton(); else clickReportMenuItem(); },3100);
    setTimeout(function(){ fillDates(); selectPdf(); ensureLT(); setLegend(); },4500);
    setTimeout(function(){ ensureLT(); selectPdf(); if(formReady()) clickRunButton(); else debugStatus('formulário não pronto antes do Run'); },5200);
    setTimeout(function(){ ensureLT(); selectPdf(); clickRunButton(); },7200);
  };

  function step(){
    ensureShell();
    cleanupIFlightNoise();
    state.attempts++;
    if(hasLoginOrMfa()){ state.phase='login'; maskOff(); show('login/MFA oficial detectado. Automação pausada para você digitar sem interferência. Depois do login, eu continuo sozinho.'); return; }
    maskOn('sincronizando escala automaticamente. Você pode tocar em Mostrar portal oficial se precisar intervir.');
    if(state.run){ state.phase='pdf'; show('PDF solicitado. Aguardando download, blob, nova janela ou interceptação automática...'); return; }

    var reportOpen=visibleRoster();
    var onCalendar=calendarVisible();
    var menuOpen=menuVisible();

    if(reportOpen){
      state.phase='form'; state.report=true;
      var did=!!(fillDates()|selectPdf()|ensureLT()|setLegend());
      if(did){ show('formulário Roster Report: datas, formato PDF, LT e legenda ajustados.'); return; }
      ensureLT();
      if(formReady() && clickRunButton()){ state.run=true; show('LT/PDF confirmados. Run acionado. Captura automática do PDF em andamento...'); return; }
      show('formulário Roster Report aberto. Preparando PDF/LT e procurando Run...');
      return;
    }

    if(onCalendar && !menuOpen){
      state.phase='calendar'; state.calendar=true; state.calendarScreen=true; state.calendarAttempts++;
      if(config && config.format==='calendar_first'){
        if(sendRosterCalendarText()) return;
        if(state.calendarAttempts%3===0) debugStatus('Roster Calendar visível, aguardando dados suficientes para importar');
        show('Roster Calendar aberto. Varrendo mês e detalhes; se a tela estiver incompleta, abra manualmente os detalhes dos voos/tripulação.');
        return;
      }
      if(clickCalendarReportButton()){ state.report=true; show('Roster Calendar carregado. Calendário não estava completo; acionando Roster Report/PDF como fallback...'); return; }
      if(state.calendarAttempts%3===0) debugStatus('Roster Calendar visível, botão Roster Report ainda não clicável');
      show('Roster Calendar aberto. Procurando o botão Roster Report dentro da tela...');
      return;
    }

    if(menuOpen){
      state.phase='menu';
      if(clickCalendarOnly()){ state.calendar=true; state.calendarAttempts=0; show('Roster Calendar selecionado no menu. Aguardando a tela carregar...'); return; }
      if(expandRosterMenu() || clickRosterMenu()){ state.roster=true; show('submenu Roster expandido. Agora vou entrar em Roster Calendar...'); return; }
      if(state.attempts>10 && clickReportMenuItem()){ state.report=true; show('Roster Report encontrado no menu como fallback. Ajustando PDF/LT...'); return; }
      openHamburger(false);
      debugStatus('menu aberto, mas Roster Calendar não clicável');
      return;
    }

    state.phase='home';
    if(state.calendar && !onCalendar && state.calendarAttempts<8){ state.calendarAttempts++; show('aguardando carregamento do Roster Calendar...'); return; }
    openHamburger(false);
    if(state.menuAttempts%4===0){ show('tela inicial/cinza detectada. Tentando abrir o menu hambúrguer. Se não abrir, toque manualmente no menu do iFlight; eu continuo monitorando PDF/Run.'); debugStatus('cinza/menu não detectado'); }
  }
  window.__crewcheckAutoStep=step;
  window.__crewcheckAutoRosterInterval=setInterval(step,3200);
  setTimeout(step,450);
}catch(e){ console.log('CrewCheck iFlight automation',e); }
})(
""" + activeIFlightConfigJson + """
);
""";
        try {
            view.evaluateJavascript(js, null);
        } catch (Exception ignored) {}
    }

    private void captureBlobUrlFromPage(final String blobUrl) {
        if (portalWebView == null || blobUrl == null || blobUrl.trim().isEmpty()) {
            finishIFlightWithError("O iFlight gerou PDF interno, mas a URL blob veio vazia. Use Importar PDF manualmente.");
            return;
        }
        updatePortalStatus("PDF/blob detectado. Tentando capturar dentro da página do iFlight...");
        runOnUiThread(() -> {
            try {
                String safeUrl = escapeJs(blobUrl);
                String js = "(function(){try{var u='" + safeUrl + "'; if(window.capturePdfBlob){fetch(u).then(function(r){return r.blob();}).then(function(b){window.capturePdfBlob(b,'iFlight_RosterReport.pdf');}).catch(function(){if(window.AndroidCrewCheckPortal)AndroidCrewCheckPortal.status('PDF/blob detectado, mas o portal não liberou leitura. Use Importar PDF manualmente.');});}else{if(window.AndroidCrewCheckPortal)AndroidCrewCheckPortal.status('Detector PDF ainda não carregou. Toque em PDF/Run novamente.');}}catch(e){}})();";
                portalWebView.evaluateJavascript(js, null);
            } catch (Exception error) {
                finishIFlightWithError("O iFlight gerou um PDF interno/blob que a WebView não conseguiu ler. Use Importar PDF manualmente.");
            }
        });
    }

    private boolean isLikelyPdfUrl(String url, String contentDisposition, String mimeType) {
        String value = String.format(Locale.US, "%s %s %s", url == null ? "" : url, contentDisposition == null ? "" : contentDisposition, mimeType == null ? "" : mimeType).toLowerCase(Locale.US);
        return value.contains("application/pdf") || value.contains(".pdf") || value.contains("format=pdf") || value.contains("pdf") || value.contains("rosterreport");
    }

    private void fetchPdfAndReturn(final String downloadUrl, final String userAgent, final String contentDisposition, final String mimeType) {
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            finishIFlightWithError("URL de download vazia no iFlight.");
            return;
        }
        if (downloadUrl.startsWith("blob:")) {
            captureBlobUrlFromPage(downloadUrl);
            return;
        }
        runOnUiThread(() -> {
            if (portalWebView != null) {
                try {
                    portalWebView.evaluateJavascript("(function(){var b=document.getElementById('__crewcheck_iflight_banner');if(b)b.textContent='CrewCheck: PDF detectado. Baixando e importando...';})();", null);
                } catch (Exception ignored) {}
            }
        });
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(25000);
                connection.setReadTimeout(45000);
                if (userAgent != null && !userAgent.trim().isEmpty()) connection.setRequestProperty("User-Agent", userAgent);
                connection.setRequestProperty("Accept", "application/pdf,application/octet-stream,*/*;q=0.8");
                connection.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7");
                connection.setRequestProperty("Referer", lastIFlightUrl == null || lastIFlightUrl.trim().isEmpty() ? IFLIGHT_CREW_MAIN_URL : lastIFlightUrl);
                connection.setRequestProperty("Origin", "https://iflightla.ibsplc.aero");
                String cookies = CookieManager.getInstance().getCookie(downloadUrl);
                if ((cookies == null || cookies.trim().isEmpty()) && lastIFlightUrl != null) cookies = CookieManager.getInstance().getCookie(lastIFlightUrl);
                if ((cookies == null || cookies.trim().isEmpty())) cookies = CookieManager.getInstance().getCookie("https://iflightla.ibsplc.aero");
                if (cookies != null && !cookies.trim().isEmpty()) connection.setRequestProperty("Cookie", cookies);

                int code = connection.getResponseCode();
                if (code == 401 || code == 403) throw new Exception("O iFlight recusou o download (HTTP " + code + "). Faça login/MFA com conta corporativa autorizada dentro do portal e gere o PDF novamente.");
                InputStream input = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (input == null) throw new Exception("Resposta sem conteúdo do iFlight (HTTP " + code + ").");
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_PDF_BYTES) throw new Exception("PDF maior que 35 MB. Baixe manualmente e importe pelo seletor.");
                    output.write(buffer, 0, read);
                }
                input.close();
                byte[] bytes = output.toByteArray();
                if (bytes.length < 4 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F') {
                    String responseType = connection.getContentType();
                    throw new Exception("O download capturado não parece ser PDF" + (responseType != null ? " (" + responseType + ")" : "") + ". Gere novamente em formato PDF no iFlight.");
                }
                String filename = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType);
                if (filename == null || !filename.toLowerCase(Locale.US).endsWith(".pdf")) filename = "iFlight_RosterReport.pdf";
                JSONObject payload = new JSONObject();
                payload.put("ok", true);
                payload.put("filename", filename);
                payload.put("sourceFileName", filename);
                payload.put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                finishIFlightWithPayload(payload);
            } catch (Exception error) {
                finishIFlightWithError(error.getMessage() == null ? "Falha ao baixar PDF do iFlight." : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void finishIFlightWithError(String message) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("ok", false);
            payload.put("error", message == null ? "Importação iFlight interrompida." : message);
            finishIFlightWithPayload(payload);
        } catch (Exception ignored) {}
    }

    private void finishIFlightWithPayload(final JSONObject payload) {
        runOnUiThread(() -> {
            closingPortalWithResult = true;
            String requestId = activeIFlightRequestId;
            closePortalOnly();
            if (webView != null && requestId != null) {
                String js = "(function(){var cb=window.__crewcheckIflightCallbacks&&window.__crewcheckIflightCallbacks['" + escapeJs(requestId) + "'];if(cb)cb(" + payload.toString() + ");})();";
                try { webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
            }
            activeIFlightRequestId = null;
            activeIFlightConfigJson = "{}";
            closingPortalWithResult = false;
        });
    }

    private String escapeJs(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "");
    }

    private void closePortalOnly() {
        if (portalWebView != null) {
            try { portalWebView.stopLoading(); } catch (Exception ignored) {}
            try { portalWebView.loadUrl("about:blank"); } catch (Exception ignored) {}
            try { portalWebView.clearHistory(); } catch (Exception ignored) {}
            try { portalWebView.clearCache(true); } catch (Exception ignored) {}
            try { portalWebView.clearFormData(); } catch (Exception ignored) {}
            try { portalWebView.destroy(); } catch (Exception ignored) {}
            portalWebView = null;
        }
        if (portalContainer != null && rootLayout != null) {
            try { rootLayout.removeView(portalContainer); } catch (Exception ignored) {}
            portalContainer = null;
            portalMaskView = null;
            portalMaskStatusText = null;
        }
        try {
            // v10.8.26 AutoPull Admin: não limpamos cookies/sessão do iFlight ao fechar.
            // Isso permite que o usuário faça login/MFA apenas quando o portal exigir.
            // Senha e MFA nunca são capturados pelo CrewCheck; somente a sessão autorizada do WebView é preservada localmente.
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {}
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingPdfIntent(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) return;
            Uri[] result = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) {
                    try {
                        final int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        getContentResolver().takePersistableUriPermission(uri, takeFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {}
                    result = new Uri[]{uri};
                }
            }
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            return;
        }
        if (requestCode == NATIVE_PDF_PICKER_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                try {
                    final int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    getContentResolver().takePersistableUriPermission(uri, takeFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
                try {
                    readIncomingPdfUri(uri);
                    Toast.makeText(this, "PDF recebido do Drive/Arquivos. Importando escala...", Toast.LENGTH_LONG).show();
                } catch (Exception error) {
                    Toast.makeText(this, error.getMessage() == null ? "Não consegui ler o PDF selecionado." : error.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            return;
        }
    }

    @Override
    public void onBackPressed() {
        if (portalWebView != null) {
            if (portalWebView.canGoBack()) portalWebView.goBack();
            else finishIFlightWithError("Portal iFlight fechado pelo usuário antes do download do PDF.");
            return;
        }
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        closePortalOnly();
        if (billingBridge != null) {
            billingBridge.destroy();
            billingBridge = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
