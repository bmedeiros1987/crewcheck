package com.crewcheck.life;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class CrewLifeRefreshJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                CrewLifeRefresh.refreshNow(this);
            } finally {
                jobFinished(params, false);
            }
        }, "crewlife-samsung-refresh").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
