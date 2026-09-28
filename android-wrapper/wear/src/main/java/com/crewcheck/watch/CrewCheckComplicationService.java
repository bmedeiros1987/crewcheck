package com.crewcheck.watch;

/**
 * Dynamic source used by CrewCheck Face and by third-party Wear OS watch faces.
 *
 * Provider histórico: já existe build assinado em campo e complicações configuradas contra
 * este ComponentName. O nome da classe, o export e o texto emitido continuam idênticos —
 * a renderização apenas passou a ser compartilhada com {@link NextStepComplicationService}
 * para que os dois provedores não divirjam com o tempo.
 */
public final class CrewCheckComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 10;
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        return NextStepComplicationService.nextStep(this, nowEpochMs, preview);
    }
}
