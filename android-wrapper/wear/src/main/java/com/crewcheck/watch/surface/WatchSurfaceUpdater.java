package com.crewcheck.watch.surface;

import android.content.ComponentName;
import android.content.Context;

import androidx.wear.tiles.TileService;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;

import com.crewcheck.watch.complication.FlightComplicationService;
import com.crewcheck.watch.complication.GateComplicationService;
import com.crewcheck.watch.complication.NextStepComplicationService;
import com.crewcheck.watch.tile.CrewCheckTileService;

public final class WatchSurfaceUpdater {
    private WatchSurfaceUpdater() {}

    public static void requestAll(Context context) {
        Context app = context.getApplicationContext();
        try {
            TileService.getUpdater(app).requestUpdate(CrewCheckTileService.class);
        } catch (Throwable ignored) {
        }

        requestComplication(app, NextStepComplicationService.class);
        requestComplication(app, FlightComplicationService.class);
        requestComplication(app, GateComplicationService.class);
    }

    private static void requestComplication(
            Context context,
            Class<? extends ComplicationDataSourceService> service
    ) {
        try {
            ComplicationDataSourceUpdateRequester
                    .create(context, new ComponentName(context, service))
                    .requestUpdateAll();
        } catch (Throwable ignored) {
        }
    }
}
