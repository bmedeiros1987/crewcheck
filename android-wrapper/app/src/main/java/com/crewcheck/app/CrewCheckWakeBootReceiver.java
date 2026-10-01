package com.crewcheck.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class CrewCheckWakeBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            CrewCheckWakeScheduler.rescheduleAll(context);
        }
    }
}
