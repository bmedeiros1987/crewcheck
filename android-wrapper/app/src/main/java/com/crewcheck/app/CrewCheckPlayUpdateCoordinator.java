package com.crewcheck.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebView;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

import org.json.JSONObject;

/**
 * Phone-owned Google Play update availability bridge.
 *
 * This deliberately does not start or complete an in-app update. CrewCheck can be
 * operational when the check runs, so availability is surfaced without forcing a
 * Play consent flow, reload, Activity restart, cache clear, logout or roster reset.
 * The user can choose when to leave the current session and update from Google Play.
 */
final class CrewCheckPlayUpdateCoordinator {
    private static final String PREFS = "crewcheck_play_update_notice";
    private static final String KEY_VERSION = "last_version";
    private static final String KEY_NOTIFIED_AT = "last_notified_at";
    private static final String CHANNEL_ID = "crewcheck_updates";
    private static final int NOTIFICATION_ID = 1440907;
    private static final long NOTICE_INTERVAL_MS = 24L * 60L * 60L * 1000L;

    private final Activity activity;
    private final WebView webView;
    private final AppUpdateManager appUpdateManager;
    private boolean checking;
    private boolean destroyed;
    private String lastState;
    private int lastAvailableVersion;
    private Integer lastStalenessDays;
    private int lastPriority;
    private long lastCheckedAt;

    CrewCheckPlayUpdateCoordinator(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.appUpdateManager = AppUpdateManagerFactory.create(activity.getApplicationContext());
    }

    void checkForUpdate() {
        if (destroyed || checking) return;
        checking = true;
        try {
            appUpdateManager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> {
                        checking = false;
                        if (destroyed) return;
                        handleUpdateInfo(info);
                    })
                    .addOnFailureListener(error -> {
                        checking = false;
                        if (!destroyed) publishStatus("unavailable", 0, null, 0);
                    });
        } catch (Exception ignored) {
            checking = false;
            publishStatus("unavailable", 0, null, 0);
        }
    }

    void onPageReady() {
        if (destroyed) return;
        if (lastState != null) dispatchStatus();
        checkForUpdate();
    }

    void destroy() {
        destroyed = true;
    }

    private void handleUpdateInfo(AppUpdateInfo info) {
        if (info == null) {
            publishStatus("unavailable", 0, null, 0);
            return;
        }

        if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) {
            publishStatus("current", 0, null, info.updatePriority());
            return;
        }

        final int availableVersion = info.availableVersionCode();
        final Integer stalenessDays = info.clientVersionStalenessDays();
        final int priority = info.updatePriority();
        publishStatus("available", availableVersion, stalenessDays, priority);
        maybeNotify(availableVersion, stalenessDays, priority);
    }

    private void maybeNotify(int availableVersion, Integer stalenessDays, int priority) {
        try {
            SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            int previousVersion = prefs.getInt(KEY_VERSION, -1);
            long previousAt = prefs.getLong(KEY_NOTIFIED_AT, 0L);
            long now = System.currentTimeMillis();
            if (previousVersion == availableVersion && now - previousAt < NOTICE_INTERVAL_MS) return;

            // Persist only after the platform can actually surface the notice. Web users
            // still receive the event above even when Android notification permission is off.
            if (Build.VERSION.SDK_INT >= 33
                    && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return;
            }

            NotificationManager manager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Atualizações CrewCheck",
                        NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription("Avisos de nova versão do CrewCheck disponível no Google Play.");
                manager.createNotificationChannel(channel);
            }

            Intent playIntent = new Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + activity.getPackageName())
            );
            playIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    activity,
                    NOTIFICATION_ID,
                    playIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            String detail = stalenessDays != null && stalenessDays > 0
                    ? "Nova versão disponível há " + stalenessDays + (stalenessDays == 1 ? " dia." : " dias.")
                    : "Uma nova versão está disponível no Google Play.";
            if (priority >= 4) detail += " Atualização importante.";

            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(activity, CHANNEL_ID)
                    : new Notification.Builder(activity);
            builder.setContentTitle("Atualização do CrewCheck disponível")
                    .setContentText(detail)
                    .setStyle(new Notification.BigTextStyle().bigText(detail + " Toque para abrir o Google Play quando for conveniente."))
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true);
            manager.notify(NOTIFICATION_ID, builder.build());

            prefs.edit()
                    .putInt(KEY_VERSION, availableVersion)
                    .putLong(KEY_NOTIFIED_AT, now)
                    .apply();
        } catch (Exception ignored) {
            // Play/update notification failures never affect CrewCheck boot or the active roster.
        }
    }

    private void publishStatus(String state, int availableVersion, Integer stalenessDays, int priority) {
        lastState = state;
        lastAvailableVersion = availableVersion;
        lastStalenessDays = stalenessDays;
        lastPriority = priority;
        lastCheckedAt = System.currentTimeMillis();
        dispatchStatus();
    }

    private void dispatchStatus() {
        try {
            if (webView == null || destroyed || lastState == null) return;
            JSONObject detail = new JSONObject();
            detail.put("state", lastState);
            detail.put("availableVersionCode", lastAvailableVersion > 0 ? lastAvailableVersion : JSONObject.NULL);
            detail.put("stalenessDays", lastStalenessDays == null ? JSONObject.NULL : lastStalenessDays);
            detail.put("priority", lastPriority);
            detail.put("checkedAt", lastCheckedAt);
            final String payload = detail.toString();
            final String js = "(function(){try{var detail=" + payload + ";" +
                    "window.__crewcheckNativeUpdateStatus=detail;" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:native-update-status',{detail:detail}));" +
                    "}catch(e){}})();";
            activity.runOnUiThread(() -> {
                try {
                    if (!destroyed && webView != null) webView.evaluateJavascript(js, null);
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }
}
