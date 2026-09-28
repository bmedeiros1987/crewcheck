package com.crewcheck.life;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class RefreshReceiver extends BroadcastReceiver {
    public static final String ACTION_REFRESH_SUMMARY = "com.crewcheck.life.REFRESH_SUMMARY";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null
                || !ACTION_REFRESH_SUMMARY.equals(intent.getAction())) {
            return;
        }

        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                CrewLifeRefresh.refreshNow(app);
                RefreshScheduler.schedule(app);
            } finally {
                pending.finish();
            }
        }, "crewlife-refresh-request").start();
    }
}
