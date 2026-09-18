package com.crewcheck.watch.tile;

import androidx.wear.protolayout.ColorBuilders;
import androidx.wear.protolayout.DimensionBuilders;
import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.ResourceBuilders;
import androidx.wear.protolayout.TimelineBuilders;
import androidx.wear.tiles.RequestBuilders;
import androidx.wear.tiles.TileBuilders;
import androidx.wear.tiles.TileService;

import com.crewcheck.watch.data.WatchStateStore;
import com.crewcheck.watch.model.WatchContextSnapshot;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

public final class CrewCheckTileService extends TileService {
    private static final String RESOURCES_VERSION = "crewcheck-watch-v1";

    private static final int WHITE = 0xFFF7FAFC;
    private static final int MUTED = 0xFFA9B7C6;
    private static final int CYAN = 0xFF55D9F2;
    private static final int MAGENTA = 0xFFF255A4;

    @Override
    protected ListenableFuture<TileBuilders.Tile> onTileRequest(
            RequestBuilders.TileRequest requestParams
    ) {
        WatchStateStore.SavedState saved = new WatchStateStore(this).load();
        WatchContextSnapshot snapshot = saved.snapshot;

        LayoutElementBuilders.Column root = new LayoutElementBuilders.Column.Builder()
                .setWidth(DimensionBuilders.expand())
                .setHeight(DimensionBuilders.expand())
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(text("CREWCHECK", 12f, CYAN, 700))
                .addContent(spacer(8f))
                .addContent(text(snapshot.nextStepLabel(), 14f, MAGENTA, 700))
                .addContent(text(snapshot.nextStepValue(), 28f, WHITE, 700))
                .addContent(spacer(6f))
                .addContent(text(snapshot.nextStepDetail(), 12f, MUTED, 400, 2))
                .addContent(spacer(8f))
                .addContent(text(secondaryLine(snapshot), 11f, WHITE, 500, 1))
                .addContent(text(saved.demoFallback ? "DEMO" : statusLine(snapshot), 9f, MUTED, 400))
                .build();

        TimelineBuilders.Timeline timeline = new TimelineBuilders.Timeline.Builder()
                .addTimelineEntry(TimelineBuilders.TimelineEntry.fromLayoutElement(root))
                .build();

        TileBuilders.Tile tile = new TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES_VERSION)
                .setFreshnessIntervalMillis(5L * 60L * 1000L)
                .setTileTimeline(timeline)
                .build();

        return Futures.immediateFuture(tile);
    }

    @Override
    protected ListenableFuture<ResourceBuilders.Resources> onTileResourcesRequest(
            RequestBuilders.ResourcesRequest requestParams
    ) {
        return Futures.immediateFuture(
                new ResourceBuilders.Resources.Builder()
                        .setVersion(RESOURCES_VERSION)
                        .build()
        );
    }

    private static LayoutElementBuilders.Text text(
            String value, float size, int color, int weight
    ) {
        return text(value, size, color, weight, 1);
    }

    private static LayoutElementBuilders.Text text(
            String value, float size, int color, int weight, int maxLines
    ) {
        return new LayoutElementBuilders.Text.Builder()
                .setText(value == null || value.isBlank() ? "—" : value)
                .setMaxLines(maxLines)
                .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
                .setFontStyle(new LayoutElementBuilders.FontStyle.Builder()
                        .setSize(DimensionBuilders.sp(size))
                        .setColor(ColorBuilders.argb(color))
                        .setWeight(weight)
                        .build())
                .build();
    }

    private static LayoutElementBuilders.Spacer spacer(float height) {
        return new LayoutElementBuilders.Spacer.Builder()
                .setHeight(DimensionBuilders.dp(height))
                .build();
    }

    private static String secondaryLine(WatchContextSnapshot snapshot) {
        if (!snapshot.currentFlight.isEmpty()) {
            String gate = snapshot.displayGate();
            return snapshot.currentFlight + ("—".equals(gate) ? "" : " • GATE " + gate);
        }
        if (!snapshot.presentationTime.isEmpty()) {
            return "APZ " + snapshot.presentationTime;
        }
        return snapshot.currentRoute;
    }

    private static String statusLine(WatchContextSnapshot snapshot) {
        return snapshot.isStale(System.currentTimeMillis()) ? "DADOS DESATUALIZADOS" : "ATUALIZADO";
    }
}
