package com.crewcheck.watch;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Busca na nuvem agendada pelo próprio Android (JobScheduler, sem dependência nova).
 *
 * Economia de bateria: periódica a cada hora com janela flexível, só com rede e bateria
 * que não esteja baixa, para o sistema agrupar com outras tarefas. A busca imediata (botão
 * Sincronizar sem o celular por perto) também espera rede, mas não a bateria.
 */
public final class WatchCloudSyncJob extends JobService {
    static final int PERIODIC_JOB_ID = 0x0C10D01;
    static final int NOW_JOB_ID = 0x0C10D02;
    static final long PERIOD_MS = 60 * 60_000L;
    static final long FLEX_MS = 20 * 60_000L;

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();

    @Override
    public boolean onStartJob(JobParameters params) {
        WORKER.execute(() -> {
            WatchCloudClient.fetch(this, System.currentTimeMillis());
            jobFinished(params, false);
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // O sistema interrompeu (rede caiu etc.): tentar de novo depois.
    }

    /** Idempotente: mantém a periódica já agendada para não reiniciar a contagem. */
    public static void schedulePeriodic(Context context) {
        JobScheduler scheduler = scheduler(context);
        if (scheduler == null || scheduler.getPendingJob(PERIODIC_JOB_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(PERIODIC_JOB_ID, component(context))
                .setPeriodic(PERIOD_MS, FLEX_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setRequiresBatteryNotLow(true)
                .build());
    }

    public static void fetchSoon(Context context) {
        JobScheduler scheduler = scheduler(context);
        if (scheduler == null) return;
        scheduler.schedule(new JobInfo.Builder(NOW_JOB_ID, component(context))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build());
    }

    public static void cancel(Context context) {
        JobScheduler scheduler = scheduler(context);
        if (scheduler == null) return;
        scheduler.cancel(PERIODIC_JOB_ID);
        scheduler.cancel(NOW_JOB_ID);
    }

    private static JobScheduler scheduler(Context context) {
        return context.getApplicationContext().getSystemService(JobScheduler.class);
    }

    private static ComponentName component(Context context) {
        return new ComponentName(context.getApplicationContext(), WatchCloudSyncJob.class);
    }
}
