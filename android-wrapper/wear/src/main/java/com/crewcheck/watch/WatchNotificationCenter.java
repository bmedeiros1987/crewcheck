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
import android.service.notification.StatusBarNotification;
import android.util.Base64;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashMap;
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
    private static final String LEGACY_FINGERPRINT = "last_fingerprint";
    private static final String LAST_ACTION = "last_notice_action_digest";
    private static final String LAST_NOTICE = "last_notice_digest";
    private static final String LAST_CONTENT = "last_notice_content_digest";
    private static final String DELIVERY_RECEIPTS = "recent_notice_receipts";
    private static final int MAX_DELIVERY_RECEIPTS = 32;
    private static final String OPS_CHANNEL = "crewcheck_watch_ops";
    private static final int OPS_NOTIFICATION_ID = 4101;

    private WatchNotificationCenter() {}

    public static boolean isEnabled(Context context) {
        return preferences(context).getBoolean(ENABLED, true);
    }

    public static synchronized void setEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean(ENABLED, enabled).apply();
        if (!enabled) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) manager.cancel(OPS_NOTIFICATION_ID);
        }
    }

    public static void postForSnapshot(Context context, WatchContextSnapshot snapshot) {
        postForSnapshot(context, snapshot, System.currentTimeMillis());
    }

    // One sampled wall-clock instant; package visibility allows deterministic boundary tests.
    static synchronized void postForSnapshot(Context context, WatchContextSnapshot snapshot, long nowEpochMs) {
        if (context == null || snapshot == null || !isEnabled(context)) return;
        // Delayed/offline deliveries cannot turn an expired projection into a new alert.
        // Use the same inclusive validity boundary as the watch display.
        if (snapshot.isStale(nowEpochMs)) return;
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;

        Notice notice = noticeFor(snapshot);
        if (notice == null) return;

        SharedPreferences prefs = preferences(context);
        String occurrence = snapshot.contextId.isBlank() ? "" : digest(snapshot.contextId);
        boolean boardingNotice = isBoardingNotice(snapshot);
        String gate = boardingNotice ? confirmedGate(snapshot) : "";
        String actionDigest = digest(occurrence + "\n" + alertFingerprint(snapshot, notice));
        String noticeDigest = boardingNotice ? digest(actionDigest + "\n" + gate) : actionDigest;
        String contentDigest = digest(notice.title + "\n" + notice.body);
        // Generation orders revisions within a known occurrence and identifies
        // replays. It does not turn a countdown refresh into a new alert.
        String delivery = digest(snapshot.generatedAtEpochMs + ":" + noticeDigest + ":" + contentDigest);
        LinkedHashMap<String, Receipt> receipts = readReceipts(prefs, nowEpochMs);
        if (receipts.containsKey(delivery)) return;
        if (!occurrence.isEmpty()) {
            for (Receipt receipt : receipts.values()) {
                if (occurrence.equals(receipt.occurrence) && snapshot.generatedAtEpochMs < receipt.generatedAt) return;
            }
        }

        Receipt receipt = new Receipt(occurrence, snapshot.generatedAtEpochMs, snapshot.validUntilEpochMs);
        String legacy = prefs.getString(LEGACY_FINGERPRINT, "");
        boolean legacyMatch = !legacy.isEmpty() && legacy.equals(legacyFingerprint(snapshot, notice));
        // Withdrawing confirmation removes the gate from the card without
        // presenting an unconfirmed gate as a new operational event.
        boolean missingGate = boardingNotice && gate.isBlank() && actionDigest.equals(prefs.getString(LAST_ACTION, ""));
        boolean sameNotice = legacyMatch || missingGate || noticeDigest.equals(prefs.getString(LAST_NOTICE, ""));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (sameNotice && (legacyMatch || contentDigest.equals(prefs.getString(LAST_CONTENT, ""))
                || !hasActiveNotice(manager))) {
            rememberDelivery(prefs, receipts, delivery, receipt, actionDigest, noticeDigest, contentDigest);
            return;
        }
        ensureChannel(manager);

        Intent launch = new Intent(context, MainActivity.class)
                .putExtra("crewcheck_screen", "notifications")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                OPS_NOTIFICATION_ID,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, OPS_CHANNEL)
                .setSmallIcon(R.drawable.ic_crewcheck_complication)
                .setContentTitle(notice.title)
                .setContentText(notice.body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(notice.body))
                .setCategory(Notification.CATEGORY_EVENT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(sameNotice)
                .setSilent(sameNotice)
                .setShowWhen(true)
                .build();

        // The single operational slot stays in place. A distinct notice can
        // alert on update according to the existing Android channel settings.
        manager.notify(OPS_NOTIFICATION_ID, notification);
        rememberDelivery(prefs, receipts, delivery, receipt, actionDigest, noticeDigest, contentDigest);
    }

    private static boolean hasActiveNotice(NotificationManager manager) {
        for (StatusBarNotification active : manager.getActiveNotifications()) {
            if (active.getId() == OPS_NOTIFICATION_ID && active.getTag() == null) return true;
        }
        return false;
    }

    private static LinkedHashMap<String, Receipt> readReceipts(SharedPreferences prefs, long nowEpochMs) {
        LinkedHashMap<String, Receipt> receipts = new LinkedHashMap<>();
        try {
            JSONArray saved = new JSONArray(prefs.getString(DELIVERY_RECEIPTS, "[]"));
            for (int i = Math.max(0, saved.length() - MAX_DELIVERY_RECEIPTS); i < saved.length(); i++) {
                JSONArray entry = saved.optJSONArray(i);
                if (entry == null) continue;
                String key = entry.optString(0);
                long expiresAt = entry.optLong(3);
                if (!key.isEmpty() && expiresAt >= nowEpochMs) {
                    receipts.put(key, new Receipt(entry.optString(1), entry.optLong(2), expiresAt));
                }
            }
        } catch (JSONException ignored) {
            // An unreadable receipt must not prevent an otherwise valid notice.
        }
        return receipts;
    }

    private static void rememberDelivery(SharedPreferences prefs, LinkedHashMap<String, Receipt> receipts,
                                         String delivery, Receipt receipt, String actionDigest,
                                         String noticeDigest, String contentDigest) {
        receipts.put(delivery, receipt);
        if (receipts.size() > MAX_DELIVERY_RECEIPTS) receipts.remove(receipts.keySet().iterator().next());
        JSONArray saved = new JSONArray();
        receipts.forEach((key, value) -> saved.put(new JSONArray().put(key).put(value.occurrence)
                .put(value.generatedAt).put(value.expiresAt)));
        prefs.edit().putString(LAST_ACTION, actionDigest).putString(LAST_NOTICE, noticeDigest)
                .putString(LAST_CONTENT, contentDigest)
                .putString(DELIVERY_RECEIPTS, saved.toString())
                .remove(LEGACY_FINGERPRINT).apply();
    }

    private static final class Receipt {
        final String occurrence;
        final long generatedAt;
        final long expiresAt;

        Receipt(String occurrence, long generatedAt, long expiresAt) {
            this.occurrence = occurrence;
            this.generatedAt = generatedAt;
            this.expiresAt = expiresAt;
        }
    }

    private static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(bytes, Base64.NO_WRAP | Base64.NO_PADDING | Base64.URL_SAFE);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
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
                    confirmedRemote(s) ? "Embarque remoto" : "Embarque",
                    join(" · ",
                            s.currentFlight,
                            confirmedRemote(s) ? "Remota" : confirmedGate(s),
                            s.boardingTime.isBlank() ? "" : "embarque " + s.boardingTime)
            );
            case "CONNECTION" -> new Notice(
                    "Conexão",
                    join(" · ",
                            s.connection,
                            s.currentFlight,
                            confirmedGate(s),
                            s.currentFlight.isBlank() || s.boardingTime.isBlank() ? "" : "embarque previsto " + s.boardingTime)
            );
            case "OVERNIGHT" -> new Notice(
                    "Pernoite " + firstNonBlank(s.overnight, ""),
                    join(" · ", "Hotel confirmado", s.hotelPickup, presentation(s))
            );
            default -> null;
        };
    }

    /**
     * Regra do portão (docs/gate-behavior-rule.md): portão informado sem observação nunca
     * alerta. Ele não entra no texto do aviso nem na deduplicação, então aparecer ou mudar
     * um portão informado não dispara notificação nem é anunciado como confirmado.
     */
    private static String confirmedGate(WatchContextSnapshot s) {
        return s.gateReported() ? "" : s.gateLabel();
    }

    private static boolean confirmedRemote(WatchContextSnapshot s) {
        return s.remoteStand && !s.gateReported();
    }

    private static String alertFingerprint(WatchContextSnapshot s, Notice notice) {
        if (!s.changed && "LEAVE_SOON".equals(s.state)) {
            return String.join("|", s.state, s.leaveTime, s.hotelPickup, presentation(s)).toUpperCase(Locale.ROOT);
        }
        if (isBoardingNotice(s)) {
            return String.join("|", s.state, s.currentFlight, s.boardingTime).toUpperCase(Locale.ROOT);
        }
        return String.join("|", s.state, notice.title, notice.body).toUpperCase(Locale.ROOT);
    }

    private static boolean isBoardingNotice(WatchContextSnapshot s) {
        return !s.changed && ("BOARDING".equals(s.state) || "CONNECTION".equals(s.state));
    }

    private static String legacyFingerprint(WatchContextSnapshot s, Notice notice) {
        boolean connection = "CONNECTION".equals(s.state);
        return String.join("|",
                s.state,
                s.headline,
                s.primaryTime,
                s.leaveTime,
                s.currentFlight,
                connection ? "" : s.nextFlight,
                connection || s.gateReported() ? "" : s.gate,
                connection ? "" : s.boardingTime,
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
