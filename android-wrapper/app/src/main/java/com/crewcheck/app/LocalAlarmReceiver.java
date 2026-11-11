package com.crewcheck.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Rings a LocalAlarmLedger entry once. An intent whose entry was replaced, cancelled,
 * armed under another account epoch or before a reboot cannot be claimed. */
public class LocalAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || !LocalAlarmAndroid.ENABLED) return;
        LocalAlarmAndroid local = new LocalAlarmAndroid(context);
        synchronized (NotificationLedger.LOCK) {
            LocalAlarmLedger.Entry entry = local.ledger().claim(intent.getStringExtra("key"), intent.getStringExtra("epoch"), intent.getLongExtra("at", 0L));
            if (entry == null) return;
            LocalAlarmAndroid.ensureChannels(context);
            String title = intent.getStringExtra("title"), body = intent.getStringExtra("body");
            if (title == null || title.trim().isEmpty()) title = "CrewCheck";
            if (body == null) body = "";
            Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(context, 10839, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(context, LocalAlarmAndroid.channelId(entry.channel)) : new Notification.Builder(context);
            builder.setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
                    .setVisibility(Notification.VISIBILITY_PRIVATE).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setCategory("default".equals(entry.channel) ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_ALARM)
                    .setContentIntent(pi).setAutoCancel(true);
            Notification notification = builder.build();
            // Wake-up alarms keep sounding/vibrating until the crew member opens or dismisses them.
            if (!"default".equals(entry.channel)) notification.flags |= Notification.FLAG_INSISTENT;
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(LocalAlarmAndroid.TAG + entry.key, 0, notification);
        }
    }
}
