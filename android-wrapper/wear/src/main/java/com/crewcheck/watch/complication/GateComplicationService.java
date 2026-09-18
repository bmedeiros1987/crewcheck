package com.crewcheck.watch.complication;

import com.crewcheck.watch.model.WatchContextSnapshot;

public final class GateComplicationService extends AbstractCrewCheckComplicationService {
    @Override
    protected String shortValue(WatchContextSnapshot snapshot) {
        return snapshot.displayGate();
    }

    @Override
    protected String title(WatchContextSnapshot snapshot) {
        return "PORTÃO";
    }

    @Override
    protected String longValue(WatchContextSnapshot snapshot) {
        String gate = snapshot.displayGate();
        if ("REMOTA".equals(gate)) return "Embarque em posição remota";
        return "Portão " + gate;
    }

    @Override protected String previewShort() { return "24"; }
    @Override protected String previewTitle() { return "PORTÃO"; }
    @Override protected String previewLong() { return "Portão 24"; }
}
