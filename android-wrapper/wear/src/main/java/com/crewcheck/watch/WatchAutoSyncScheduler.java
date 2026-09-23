package com.crewcheck.watch;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class WatchAutoSyncScheduler {
    private static final int JOB_ID = 27158;
    private static final long PERIOD_MS = 15 * 60_000L;

    private WatchAutoSyncScheduler() {}

    static void schedule(Context context) {
        try {
            JobScheduler scheduler = context.getSystemService(JobScheduler.class);
            if (scheduler == null) return;
            JobInfo info = new JobInfo.Builder(
                    JOB_ID,
                    new ComponentName(context, WatchAutoSyncJobService.class)
            )
                    .setPersisted(true)
                    .setPeriodic(PERIOD_MS)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_NONE)
                    .build();
            scheduler.schedule(info);
        } catch (Exception ignored) {}
    }
}
