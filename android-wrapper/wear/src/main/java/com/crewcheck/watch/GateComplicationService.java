package com.crewcheck.watch;

/**
 * Portão de embarque, isolado do próximo passo.
 *
 * Lê a mesma projeção operacional v1 — o relógio não calcula portão, apenas mostra o valor
 * já publicado pelo celular. Posição remota é tratada como estado próprio e não como um
 * portão chamado "REMOTA".
 */
public final class GateComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 12;
    }

    @Override
    protected String tapScreen() {
        return "journey";
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        WatchContextSnapshot snapshot = preview
                ? WatchContextSnapshot.demo(nowEpochMs)
                : new SecureSnapshotStore(this).load();
        return ComplicationText.gate(snapshot, nowEpochMs);
    }
}
