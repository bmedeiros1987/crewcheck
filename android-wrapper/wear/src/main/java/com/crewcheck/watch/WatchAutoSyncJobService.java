package com.crewcheck.watch;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class WatchAutoSyncJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        WatchSyncClient.refresh(this, (received, status) -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
