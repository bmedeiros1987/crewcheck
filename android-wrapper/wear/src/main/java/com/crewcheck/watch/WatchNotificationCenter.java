package com.crewcheck.watch;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.Locale;

/**
 * Notificações locais do CrewWatch.
 *
 * O celular continua sendo a fonte de verdade. O relógio apenas transforma a
 * projeção canônica já recebida em alertas de glance e deduplica por contexto.
 */
public final class WatchNotificationCenter {
    private static final String PREFS = "crewcheck_watch_notifications";
    private static final String ENABLED = "enabled";
    private static final String LAST_FINGERPRINT = "last_fingerprint";
    private static final String OPS_CHANNEL = "crewcheck_watch_ops";
    private static final int OPS_NOTIFICATION_ID = 4101;

    private WatchNotificationCenter() {}

    public static boolean isEnabled(Context context) {
        return preferences(context).getBoolean(ENABLED, true);
    }

    public static void setEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean(ENABLED, enabled).apply();
        if (!enabled) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) manager.cancel(OPS_NOTIFICATION_ID);
        }
    }

    public static void postForSnapshot(Context context, WatchContextSnapshot snapshot) {
        if (context == null || snapshot == null || !isEnabled(context)) return;
        // Um DataItem pode chegar horas depois, quando o relógio reconecta: sem isto ele
        // vibrava "Hora de sair" para uma saída que já passou.
        if (snapshot.isStale(System.currentTimeMillis())) return;
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;

        Notice notice = noticeFor(snapshot);
        if (notice == null) return;

        String fingerprint = fingerprint(snapshot, notice);
        SharedPreferences prefs = preferences(context);
        if (fingerprint.equals(prefs.getString(LAST_FINGERPRINT, ""))) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        ensureChannel(manager);

        Intent launch = new Intent(context, MainActivity.class)
                .putExtra("crewcheck_screen", "notifications")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                4101,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(context, OPS_CHANNEL)
                .setSmallIcon(R.drawable.ic_crewcheck_complication)
                .setContentTitle(notice.title)
                .setContentText(notice.body)
                .setStyle(new Notification.BigTextStyle().bigText(notice.body))
                .setCategory(Notification.CATEGORY_EVENT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .build();

        manager.notify(OPS_NOTIFICATION_ID, notification);
        prefs.edit().putString(LAST_FINGERPRINT, fingerprint).apply();
    }

    private static void ensureChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel existing = manager.getNotificationChannel(OPS_CHANNEL);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
                OPS_CHANNEL,
                "CrewCheck operacional",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Hora de sair, alteração de escala, embarque, conexão e pernoite.");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private static Notice noticeFor(WatchContextSnapshot s) {
        if (s.changed || "CHANGED".equals(s.state)) {
            return new Notice(
                    "Escala atualizada",
                    firstNonBlank(s.detail, s.headline, "Abra o CrewCheck para conferir o que mudou.")
            );
        }

        return switch (s.state) {
            case "LEAVE_SOON" -> new Notice(
                    "Hora de sair",
                    join(" · ",
                            s.leaveTime.isBlank() ? s.headline : "Saia às " + s.leaveTime,
                            s.trafficDetail,
                            presentation(s))
            );
            case "BOARDING" -> new Notice(
                    s.remoteStand ? "Embarque remoto" : "Embarque",
                    join(" · ",
                            s.currentFlight,
                            s.remoteStand ? "Remota" : s.gateLabel(),
                            s.boardingTime.isBlank() ? "" : "embarque " + s.boardingTime)
            );
            case "CONNECTION" -> new Notice(
                    "Conexão",
                    join(" · ",
                            s.connection,
                            s.nextFlight,
                            s.gateLabel(),
                            s.boardingTime.isBlank() ? "" : "embarque " + s.boardingTime)
            );
            case "OVERNIGHT" -> new Notice(
                    "Pernoite " + firstNonBlank(s.overnight, ""),
                    join(" · ", "Hotel confirmado", s.hotelPickup, presentation(s))
            );
            default -> null;
        };
    }

    private static String fingerprint(WatchContextSnapshot s, Notice notice) {
        return String.join("|",
                s.state,
                s.headline,
                s.primaryTime,
                s.leaveTime,
                s.currentFlight,
                s.nextFlight,
                s.gate,
                s.boardingTime,
                s.overnight,
                Boolean.toString(s.changed),
                notice.title,
                notice.body
        ).toUpperCase(Locale.ROOT);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String presentation(WatchContextSnapshot s) {
        if (s.presentationTime.isBlank() && s.presentationPlace.isBlank()) return "";
        return join(" · ",
                s.presentationPlace,
                s.presentationTime.isBlank() ? "" : "apresentação " + s.presentationTime);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private static String join(String separator, String... values) {
        StringBuilder out = new StringBuilder();
        for (String value : values) {
            if (value == null || value.isBlank()) continue;
            if (out.length() > 0) out.append(separator);
            out.append(value);
        }
        return out.toString();
    }

    private static final class Notice {
        final String title;
        final String body;

        Notice(String title, String body) {
            this.title = title == null ? "" : title;
            this.body = body == null ? "" : body;
        }
    }
}
