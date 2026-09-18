package com.crewcheck.watch.complication;

import com.crewcheck.watch.model.WatchContextSnapshot;

public final class NextStepComplicationService extends AbstractCrewCheckComplicationService {
    @Override
    protected String shortValue(WatchContextSnapshot snapshot) {
        return snapshot.shortNextStep();
    }

    @Override
    protected String title(WatchContextSnapshot snapshot) {
        return snapshot.nextStepLabel();
    }

    @Override
    protected String longValue(WatchContextSnapshot snapshot) {
        String detail = snapshot.nextStepDetail();
        return snapshot.nextStepValue() + (detail.isEmpty() ? "" : " • " + detail);
    }

    @Override protected String previewShort() { return "18 MIN"; }
    @Override protected String previewTitle() { return "SAIR"; }
    @Override protected String previewLong() { return "Sair em 18 min • APZ 13:30"; }
}
