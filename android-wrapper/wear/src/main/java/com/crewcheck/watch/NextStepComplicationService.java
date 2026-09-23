package com.crewcheck.watch;

import android.content.Context;

/**
 * Próximo passo da escala: sair, apresentação, embarque, voo, conexão ou pernoite.
 *
 * É a mesma projeção publicada pelo {@link CrewCheckComplicationService}, exposta como uma
 * segunda fonte de dados para que a face consiga mostrar o próximo passo e outro dado
 * CrewCheck ao mesmo tempo — no seletor do Wear OS escolhe-se a fonte, não o slot.
 */
public final class NextStepComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 11;
    }

    @Override
    protected String tapScreen() {
        return "journey";
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        return nextStep(this, nowEpochMs, preview);
    }

    /** Compartilhado com o provider legado para que os dois nunca divirjam. */
    static ComplicationRendering nextStep(Context context, long nowEpochMs, boolean preview) {
        WatchContextSnapshot snapshot = preview
                ? WatchContextSnapshot.demo(nowEpochMs)
                : new SecureSnapshotStore(context).load();
        return ComplicationText.nextStep(snapshot, nowEpochMs);
    }
}
