package com.crewcheck.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** A revogação não pode reportar sucesso sem que a exclusão tenha sido confirmada. */
public final class RevocationRetryTest {
    private static final String[] PATHS = {"/crewcheck/watch/crewlife/v1", "/crewcheck/watch/routine/v1"};

    /** Executa o agendamento na hora, registrando os atrasos pedidos. */
    private static final class ImmediateScheduler implements RevocationRetry.Scheduler {
        final List<Long> delays = new ArrayList<>();

        @Override
        public void schedule(long delayMs, Runnable action) {
            delays.add(delayMs);
            action.run();
        }
    }

    private static final class Outcome implements RevocationRetry.Result {
        Boolean allDeleted;
        int failedPaths = -1;

        @Override
        public void onFinished(boolean allDeleted, int failedPaths) {
            this.allDeleted = allDeleted;
            this.failedPaths = failedPaths;
        }
    }

    @Test
    public void confirmsEveryPathBeforeReportingSuccess() {
        List<String> deleted = new ArrayList<>();
        Outcome outcome = new Outcome();

        RevocationRetry.run(PATHS, (path, onSuccess, onFailure) -> {
            deleted.add(path);
            onSuccess.run();
        }, new ImmediateScheduler(), outcome);

        assertEquals(List.of(PATHS[0], PATHS[1]), deleted);
        assertTrue(outcome.allDeleted);
        assertEquals(0, outcome.failedPaths);
    }

    @Test
    public void retriesUntilTheDeleteGoesThrough() {
        Map<String, Integer> attempts = new HashMap<>();
        ImmediateScheduler scheduler = new ImmediateScheduler();
        Outcome outcome = new Outcome();

        RevocationRetry.run(PATHS, (path, onSuccess, onFailure) -> {
            int attempt = attempts.merge(path, 1, Integer::sum);
            // O primeiro caminho falha duas vezes antes de confirmar.
            if (PATHS[0].equals(path) && attempt < 3) {
                onFailure.run();
            } else {
                onSuccess.run();
            }
        }, scheduler, outcome);

        assertEquals(3, (int) attempts.get(PATHS[0]));
        assertEquals(1, (int) attempts.get(PATHS[1]));
        assertTrue(outcome.allDeleted);
        assertEquals(0, outcome.failedPaths);
        assertArrayEquals(
                new Long[]{RevocationRetry.BACKOFF_MS[1], RevocationRetry.BACKOFF_MS[2]},
                scheduler.delays.toArray(new Long[0])
        );
    }

    @Test
    public void neverReportsSuccessWhenAPathNeverConfirms() {
        Map<String, Integer> attempts = new HashMap<>();
        Outcome outcome = new Outcome();

        RevocationRetry.run(PATHS, (path, onSuccess, onFailure) -> {
            attempts.merge(path, 1, Integer::sum);
            if (PATHS[0].equals(path)) {
                onFailure.run();
            } else {
                onSuccess.run();
            }
        }, new ImmediateScheduler(), outcome);

        assertEquals("esgota o backoff antes de desistir",
                RevocationRetry.BACKOFF_MS.length, (int) attempts.get(PATHS[0]));
        assertFalse("dado de saúde pode ter ficado no pulso", outcome.allDeleted);
        assertEquals(1, outcome.failedPaths);
    }

    @Test
    public void everyPathFailingIsCountedSeparately() {
        Outcome outcome = new Outcome();
        RevocationRetry.run(PATHS, (path, onSuccess, onFailure) -> onFailure.run(),
                new ImmediateScheduler(), outcome);
        assertFalse(outcome.allDeleted);
        assertEquals(2, outcome.failedPaths);
    }

    @Test
    public void backoffStartsImmediatelyAndThenSpacesOut() {
        assertEquals(0L, RevocationRetry.BACKOFF_MS[0]);
        for (int i = 1; i < RevocationRetry.BACKOFF_MS.length; i++) {
            assertTrue(RevocationRetry.BACKOFF_MS[i] > RevocationRetry.BACKOFF_MS[i - 1]);
        }
    }
}
