using Toybox.Graphics;
using Toybox.WatchUi;

class CrewCheckGlanceView extends WatchUi.GlanceView {
    private const ROUND_SAFE_WIDTH_PERCENT = 76;
    private var store;

    function initialize(snapshotStore) {
        GlanceView.initialize();
        store = snapshotStore;
    }

    function onUpdate(dc) {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var cx = width / 2;
        var snapshot = store.load();

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        if (snapshot == null) {
            drawCentered(dc, cx, height * 0.22, Graphics.FONT_XTINY, "CrewCheck");
            drawCentered(dc, cx, height * 0.58, Graphics.FONT_XTINY, "Sem sync");
            return;
        }

        var primary = snapshot["t"] == null ? "" : snapshot["t"].toString();
        var flight = snapshot["f"] == null ? "" : snapshot["f"].toString();
        var route = snapshot["r"] == null ? "" : snapshot["r"].toString();
        var freshness = store.freshness(snapshot);

        // Never present an expired cached snapshot as current. Stale roster remains useful,
        // but the freshness warning takes the primary glance position.
        var top = freshness == "fresh"
                ? (primary.length() > 0 ? primary : "Agora")
                : "Dados antigos";
        var bottom = flight;
        if (route.length() > 0) {
            bottom = bottom.length() > 0 ? bottom + " " + route : route;
        }
        if (bottom.length() == 0) {
            bottom = freshness == "fresh" ? "Escala atualizada" : "Offline • cache local";
        }

        drawCentered(dc, cx, height * 0.18, Graphics.FONT_XTINY, top);
        drawCentered(dc, cx, height * 0.56, Graphics.FONT_XTINY, bottom);
    }

    private function drawCentered(dc, x, y, font, value) {
        var maxWidth = (dc.getWidth() * ROUND_SAFE_WIDTH_PERCENT) / 100;
        dc.drawText(x, y, font, fitText(dc, font, value, maxWidth), Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function fitText(dc, font, value, maxWidth) {
        if (value == null) {
            return "";
        }

        var text = value.toString();
        if (dc.getTextWidthInPixels(text, font) <= maxWidth) {
            return text;
        }

        var ellipsis = "…";
        while (text.length() > 1) {
            text = text.substring(0, text.length() - 1);
            var candidate = text + ellipsis;
            if (dc.getTextWidthInPixels(candidate, font) <= maxWidth) {
                return candidate;
            }
        }

        return ellipsis;
    }
}
