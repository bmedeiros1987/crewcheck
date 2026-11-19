package com.crewcheck.app;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class StayAlarmReceiver extends BroadcastReceiver {
    private static final java.util.concurrent.ExecutorService WORK=java.util.concurrent.Executors.newSingleThreadExecutor();
    static boolean bootRecoveryAction(String action,boolean qaBoot) {
        return (qaBoot?Intent.ACTION_LOCKED_BOOT_COMPLETED:Intent.ACTION_BOOT_COMPLETED).equals(action);
    }
    @Override public void onReceive(Context context,Intent intent) {
        if(context==null||intent==null)return;
        final PendingResult pending=goAsync();
        final Context app=context.getApplicationContext();
        WORK.execute(()->{
        try {
            String action=intent.getAction();
            boolean qaBoot=StayAlarmQaAlerts.enabled(app);
            boolean lockedBoot=Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action);
            if(lockedBoot&&!qaBoot)return;
            // QA re-arms at locked boot only. The later unlocked BOOT_COMPLETED
            // must not cancel a valid alarm whose delivery is already queued.
            if(qaBoot&&Intent.ACTION_BOOT_COMPLETED.equals(action))return;
            if (StayAlarmQaAlerts.isControl(action)) {
                StayAlarmQaAlerts.handle(app,intent);
                return;
            }
            if(StayAlarmAndroid.ACTION.equals(action)) {
                StayAlarmAndroid.engine(app).receive(intent.getStringExtra("stayKey"),intent.getLongExtra("revision",-1),intent.getLongExtra("scheduledAt",0));
            } else if(bootRecoveryAction(action,qaBoot)) {
                StayAlarmEngine engine=StayAlarmAndroid.engine(app);
                if(qaBoot)engine.recoverConfirmedOnBoot();
                else engine.recover(false);
            } else if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                ||Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                ||AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
                if(!qaBoot||StayAlarmQaBoot.unlocked(app))
                    StayAlarmAndroid.engine(app).recover(AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action));
            }
        } catch(Exception ignored) { /* No acknowledgement or notification on incomplete journal. */ }
        finally {pending.finish();}
        });
    }
}
