package com.crewcheck.life;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class RefreshScheduler {
    private static final int JOB_ID = 27140;

    private RefreshScheduler() {}

    static void schedule(Context context) {
        try {
            JobScheduler scheduler = context.getSystemService(JobScheduler.class);
            if (scheduler == null) return;
            JobInfo info = new JobInfo.Builder(
                    JOB_ID,
                    new ComponentName(context, CrewLifeRefreshJobService.class)
            )
                    .setPersisted(true)
                    .setPeriodic(60 * 60 * 1000L)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_NONE)
                    .build();
            scheduler.schedule(info);
        } catch (Exception ignored) {}
    }
}
