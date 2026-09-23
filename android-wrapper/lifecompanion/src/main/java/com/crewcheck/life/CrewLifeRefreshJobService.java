package com.crewcheck.life;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class CrewLifeRefreshJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                if (SamsungHealthRuntime.sdkBundled()) {
                    org.json.JSONObject status = SamsungHealthRuntime.status(this);
                    if ("connected".equals(status.optString("state"))) {
                        LifeSummaryStore.save(this, SamsungHealthRuntime.readSummary(this));
                    }
                }
            } catch (Throwable ignored) {
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
