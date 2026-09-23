package com.crewcheck.watch;

/**
 * Sugestão da Rotina para o momento — já decidida no celular.
 *
 * Lê apenas /crewcheck/watch/routine/v1. O relógio não escolhe treino, não cruza escala com
 * saúde e não recalcula prioridade: exibe o texto derivado que recebeu.
 */
public final class RoutineComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 14;
    }

    @Override
    protected String tapScreen() {
        return "crewlife";
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        RoutineSnapshot snapshot = preview
                ? RoutineSnapshot.demo(nowEpochMs)
                : new WellbeingStore(this).loadRoutine();
        return ComplicationText.routine(snapshot, nowEpochMs);
    }
}
