package com.crewcheck.watch.notification;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.crewcheck.watch.MainActivity;
import com.crewcheck.watch.R;
import com.crewcheck.watch.model.WatchContextSnapshot;

public final class WatchNotificationHelper {
    private static final String CHANNEL_ID = "crewcheck_watch_operational";

    private WatchNotificationHelper() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Mudanças da jornada",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Portão, escala e próximo passo relevante no CrewCheck.");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    public static void showOperationalAlert(Context context, WatchContextSnapshot snapshot) {
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ensureChannel(context);
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                701,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String title = snapshot.alertTitle.isEmpty()
                ? "CrewCheck atualizado"
                : snapshot.alertTitle;
        String body = snapshot.alertBody.isEmpty()
                ? snapshot.nextStepLabel() + " " + snapshot.nextStepValue()
                : snapshot.alertBody;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);

        Notification notification = builder
                .setSmallIcon(R.drawable.ic_crewcheck_mono)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_EVENT)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build();

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(702, notification);
        }
    }
}
