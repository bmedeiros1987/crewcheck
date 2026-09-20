package com.crewcheck.watch;

/**
 * Glance do CrewLife: recuperação agregada, sono e passos.
 *
 * Lê apenas o canal /crewcheck/watch/crewlife/v1, que transporta valores derivados. Quando o
 * usuário não optou por saúde — ou revogou — o cache está vazio e a complicação degrada para
 * "--" em vez de cair para outro dado (fail-closed).
 */
public final class CrewLifeComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 13;
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        CrewLifeSnapshot snapshot = preview
                ? CrewLifeSnapshot.demo(nowEpochMs)
                : new WellbeingStore(this).loadCrewLife();
        return ComplicationText.crewLife(snapshot, nowEpochMs);
    }
}
