package com.crewcheck.app;

/**
 * Máquina de retentativa da revogação de bem-estar no relógio.
 *
 * Deliberadamente sem nenhuma dependência de Android: apagar o dado de saúde do pulso é a
 * operação que mais precisa de teste e é justamente a que mais depende de I/O. Separando a
 * decisão do transporte, a decisão roda em JVM.
 *
 * Regra: cada caminho é tentado até esgotar o backoff, em sequência. Só se TODOS confirmarem
 * a exclusão é que a revogação é dada como concluída. Uma única falha deixa o resultado como
 * incompleto, para que o chamador mantenha a pendência registrada e tente de novo — nunca
 * para que o usuário ouça "revogado" com o dado ainda no relógio.
 */
final class RevocationRetry {

    interface Deleter {
        /** Deve chamar exatamente um dos dois callbacks. */
        void delete(String path, Runnable onSuccess, Runnable onFailure);
    }

    interface Scheduler {
        void schedule(long delayMs, Runnable action);
    }

    interface Result {
        void onFinished(boolean allDeleted, int failedPaths);
    }

    /** Primeira tentativa imediata; as seguintes afastadas, porque a falha típica é enlace caído. */
    static final long[] BACKOFF_MS = {0L, 2_000L, 4_000L, 8_000L};

    private RevocationRetry() {
    }

    static void run(String[] paths, Deleter deleter, Scheduler scheduler, Result result) {
        if (paths == null || paths.length == 0) {
            result.onFinished(true, 0);
            return;
        }
        deletePath(paths, 0, 0, 0, deleter, scheduler, result);
    }

    private static void deletePath(
            String[] paths,
            int index,
            int attempt,
            int failedSoFar,
            Deleter deleter,
            Scheduler scheduler,
            Result result
    ) {
        if (index >= paths.length) {
            result.onFinished(failedSoFar == 0, failedSoFar);
            return;
        }

        String path = paths[index];
        deleter.delete(
                path,
                () -> deletePath(paths, index + 1, 0, failedSoFar, deleter, scheduler, result),
                () -> {
                    int next = attempt + 1;
                    if (next >= BACKOFF_MS.length) {
                        // Esgotou: segue para o próximo caminho, mas a revogação já não é completa.
                        deletePath(paths, index + 1, 0, failedSoFar + 1, deleter, scheduler, result);
                        return;
                    }
                    scheduler.schedule(
                            BACKOFF_MS[next],
                            () -> deletePath(paths, index, next, failedSoFar, deleter, scheduler, result)
                    );
                }
        );
    }
}
