package com.crewcheck.watch.complication;

import com.crewcheck.watch.model.WatchContextSnapshot;

public final class FlightComplicationService extends AbstractCrewCheckComplicationService {
    @Override
    protected String shortValue(WatchContextSnapshot snapshot) {
        return snapshot.shortFlight();
    }

    @Override
    protected String title(WatchContextSnapshot snapshot) {
        return "VOO";
    }

    @Override
    protected String longValue(WatchContextSnapshot snapshot) {
        String flight = snapshot.currentFlight.isEmpty() ? snapshot.nextFlight : snapshot.currentFlight;
        String route = snapshot.currentRoute;
        return flight + (route.isEmpty() ? "" : " • " + route);
    }

    @Override protected String previewShort() { return "LA3721"; }
    @Override protected String previewTitle() { return "VOO"; }
    @Override protected String previewLong() { return "LA3721 • BSB → GRU"; }
}
