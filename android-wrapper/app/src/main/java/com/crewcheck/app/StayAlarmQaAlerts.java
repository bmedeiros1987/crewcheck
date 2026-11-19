package com.crewcheck.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;

/** Notification controls for the packaged offline acceptance fixture only. */
final class StayAlarmQaAlerts {
    static final String CHANNEL_ID = "crewcheck_stay_qa_alarm_v1";
    static final String SNOOZE = "com.crewcheck.app.STAY_QA_SNOOZE";
    static final String DISMISS = "com.crewcheck.app.STAY_QA_DISMISS";
    private static final long SNOOZE_MILLIS = 2 * 60_000L;

    private StayAlarmQaAlerts() {}

    static boolean enabled(Context context) {
        return context != null && StayAlarmHostAndroid.acceptancePackage(context.getPackageName())
            && StayAlarmPhysicalFixture.enabled(context);
    }

    static void createChannel(Context context) {
        if (!enabled(context)) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Despertador offline · QA", NotificationManager.IMPORTANCE_HIGH);
        AudioAttributes alarmAudio = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), alarmAudio);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    static String describe(Context context) {
        if (!enabled(context)) return "";
        try {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(CHANNEL_ID);
            if (channel == null) return "\nCanal QA não encontrado. Programação indisponível.";
            if (channel.getImportance() == NotificationManager.IMPORTANCE_NONE)
                return "\nCanal QA bloqueado. Programação e disparo indisponíveis.";
            AudioManager audio = context.getSystemService(AudioManager.class);
            String volume = audio == null ? "não verificado" : audio.getStreamVolume(AudioManager.STREAM_ALARM)
                + "/" + audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            boolean quietImportance = channel.getImportance() < NotificationManager.IMPORTANCE_DEFAULT;
            return "\nSom no canal QA: " + (channel.getSound() == null || quietImportance ? "silenciado" : "configurado")
                + "\nVibração no canal QA: " + (channel.shouldVibrate() ? "ativada" : "desativada")
                + "\nVolume do alarme: " + volume
                + "\nSoneca de 2 minutos só para teste. A leitura do canal não comprova toque ou vibração.";
        } catch (RuntimeException error) {
            return "\nSom e vibração do canal QA não puderam ser verificados.";
        }
    }

    static boolean isControl(String action) {
        return SNOOZE.equals(action) || DISMISS.equals(action);
    }

    static Uri controlUri(String action, String key, long revision, long scheduledAt) {
        return Uri.parse("crewcheck-stay-alarm://qa-action/" + StayAlarmAndroid.digest(key)
            + "/" + action + "/" + revision + "/" + scheduledAt);
    }

    static boolean matchesControl(String action, Uri data, String key, long revision, long scheduledAt) {
        return isControl(action) && key != null && revision > 0 && scheduledAt > 0
            && controlUri(action, key, revision, scheduledAt).equals(data);
    }

    private static PendingIntent pendingControl(Context context, StayAlarmEngine.Record alert, String action) {
        Intent intent = new Intent(context, StayAlarmReceiver.class).setAction(action)
            .setData(controlUri(action, alert.key, alert.revision, alert.alarm))
            .putExtra("stayKey", alert.key).putExtra("revision", alert.revision).putExtra("scheduledAt", alert.alarm);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);
    }

    static void addActions(Context context, Notification.Builder notification, StayAlarmEngine.Record alert) {
        if (!enabled(context)) return;
        notification.setCategory(Notification.CATEGORY_ALARM)
            .addAction(new Notification.Action.Builder((Icon) null, "Soneca", pendingControl(context, alert, SNOOZE)).build())
            .addAction(new Notification.Action.Builder((Icon) null, "Desligar", pendingControl(context, alert, DISMISS)).build());
    }

    static void handle(Context context, Intent intent) {
        if (!enabled(context)) return;
        String action = intent.getAction(), key = intent.getStringExtra("stayKey");
        long revision = intent.getLongExtra("revision", -1), scheduledAt = intent.getLongExtra("scheduledAt", 0);
        if (!matchesControl(action, intent.getData(), key, revision, scheduledAt)) return;
        boolean snooze = SNOOZE.equals(action);
        StayAlarmEngine.LocalAlertAction local = snooze ? StayAlarmEngine.LocalAlertAction.SNOOZE : StayAlarmEngine.LocalAlertAction.DISMISS;
        StayAlarmAndroid.engine(context).applyLocalAlertAction(true, key, revision, scheduledAt, local,
            snooze ? System.currentTimeMillis() + SNOOZE_MILLIS : 0);
    }
}
