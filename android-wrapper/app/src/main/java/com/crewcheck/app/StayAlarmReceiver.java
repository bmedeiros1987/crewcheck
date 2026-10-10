package com.crewcheck.app;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class StayAlarmReceiver extends BroadcastReceiver {
    private static final java.util.concurrent.ExecutorService WORK=java.util.concurrent.Executors.newSingleThreadExecutor();
    @Override public void onReceive(Context context,Intent intent) {
        if(context==null||intent==null)return;
        final PendingResult pending=goAsync();
        final Context app=context.getApplicationContext();
        WORK.execute(()->{
        try {
            StayAlarmEngine engine=StayAlarmAndroid.engine(app);
            String action=intent.getAction();
            if(StayAlarmAndroid.ACTION.equals(action)) {
                engine.receive(intent.getStringExtra("stayKey"),intent.getLongExtra("revision",-1),intent.getLongExtra("scheduledAt",0));
            } else if(Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                ||Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                ||AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
                engine.recover(AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action));
            }
        } catch(Exception ignored) { /* No acknowledgement or notification on incomplete journal. */ }
        finally {pending.finish();}
        });
    }
}
