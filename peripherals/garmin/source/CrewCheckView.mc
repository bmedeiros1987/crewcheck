using Toybox.Graphics;
using Toybox.Time;
using Toybox.WatchUi;

/**
 * Round-first Garmin renderer for the portable watchSnapshotV1 projection.
 *
 * This view is intentionally presentation-only: every operational value is already computed by
 * CrewCheck before the compact snapshot reaches the watch.
 */
class CrewCheckView extends WatchUi.View {
    private const PAGE_COUNT = 4;
    private const ROUND_SAFE_WIDTH_PERCENT = 76;
    private var store;
    private var page = 0;

    function initialize(snapshotStore) {
        View.initialize();
        store = snapshotStore;
    }

    function nextPage() {
        page = (page + 1) % PAGE_COUNT;
    }

    function previousPage() {
        page = page <= 0 ? PAGE_COUNT - 1 : page - 1;
    }

    function onUpdate(dc) {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var cx = width / 2;
        var snapshot = store.load();

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        if (snapshot == null) {
            drawCentered(dc, cx, height * 0.32, Graphics.FONT_SMALL, "CrewCheck");
            drawCentered(dc, cx, height * 0.50, Graphics.FONT_XTINY, "Sem escala sincronizada");
            drawCentered(dc, cx, height * 0.62, Graphics.FONT_XTINY, "Abra o CrewCheck no celular");
            return;
        }

        if (page == 0) {
            drawNow(dc, cx, height, snapshot);
        } else if (page == 1) {
            drawJourney(dc, cx, height, snapshot);
        } else if (page == 2) {
            drawSchedule(dc, cx, height, snapshot);
        } else {
            drawSync(dc, cx, height, snapshot);
        }

        drawPageMarker(dc, cx, height);
    }

    private function drawNow(dc, cx, height, snapshot) {
        var freshness = store.freshness(snapshot);
        var headline = textOr(snapshot["h"], "AGORA");
        var primaryTime = textOr(snapshot["t"], "");
        var flight = textOr(snapshot["f"], "");
        var route = textOr(snapshot["r"], "");
        var gate = textOr(snapshot["k"], "");
        var overnight = textOr(snapshot["o"], "");

        drawCentered(dc, cx, height * 0.12, Graphics.FONT_XTINY,
                freshness == "fresh" ? "CREWCHECK • AGORA" : "CREWCHECK • DADOS ANTIGOS");
        drawCentered(dc, cx, height * 0.28, Graphics.FONT_SMALL, headline);

        if (primaryTime.length() > 0) {
            drawCentered(dc, cx, height * 0.43, Graphics.FONT_LARGE, primaryTime);
        }

        var operation = flight;
        if (route.length() > 0) {
            operation = operation.length() > 0 ? operation + " • " + route : route;
        }
        if (operation.length() > 0) {
            drawCentered(dc, cx, height * 0.60, Graphics.FONT_XTINY, operation);
        }

        var footer = "";
        if (gate.length() > 0) {
            footer = "Gate " + gate;
        } else if (overnight.length() > 0) {
            footer = overnight;
        } else {
            footer = freshness == "fresh" ? "Sincronizado" : "Offline • cache local";
        }
        drawCentered(dc, cx, height * 0.72, Graphics.FONT_XTINY, footer);
    }

    private function drawJourney(dc, cx, height, snapshot) {
        drawCentered(dc, cx, height * 0.11, Graphics.FONT_XTINY, "CREWCHECK • JORNADA");
        var rows = snapshot["q"];
        if (rows == null || rows.size() == 0) {
            drawCentered(dc, cx, height * 0.45, Graphics.FONT_XTINY, "Sem etapas para hoje");
            return;
        }

        var count = rows.size() < 3 ? rows.size() : 3;
        for (var i = 0; i < count; i += 1) {
            var row = rows[i];
            var time = rowValue(row, 0);
            var title = rowValue(row, 1);
            var route = rowValue(row, 2);
            var line = time.length() > 0 ? time + "  " + title : title;
            var y = 0.28 + (i * 0.19);
            drawCentered(dc, cx, height * y, Graphics.FONT_XTINY, line);
            if (route.length() > 0) {
                drawCentered(dc, cx, height * (y + 0.08), Graphics.FONT_XTINY, route);
            }
        }
    }

    private function drawSchedule(dc, cx, height, snapshot) {
        drawCentered(dc, cx, height * 0.11, Graphics.FONT_XTINY, "CREWCHECK • ESCALA");
        var rows = snapshot["q"];
        if (rows == null || rows.size() == 0) {
            drawCentered(dc, cx, height * 0.45, Graphics.FONT_XTINY, "Sem programação");
            return;
        }

        var count = rows.size() < 5 ? rows.size() : 5;
        for (var i = 0; i < count; i += 1) {
            var row = rows[i];
            var time = rowValue(row, 0);
            var title = rowValue(row, 1);
            var route = rowValue(row, 2);
            var line = time + "  " + title;
            if (route.length() > 0) {
                line = line + "  " + route;
            }
            drawCentered(dc, cx, height * (0.27 + (i * 0.115)), Graphics.FONT_XTINY, line);
        }
    }

    private function drawSync(dc, cx, height, snapshot) {
        var freshness = store.freshness(snapshot);
        var generated = safeNumber(snapshot["g"]);
        var validUntil = safeNumber(snapshot["u"]);

        drawCentered(dc, cx, height * 0.11, Graphics.FONT_XTINY, "CREWCHECK • SYNC");
        drawCentered(dc, cx, height * 0.31, Graphics.FONT_SMALL,
                freshness == "fresh" ? "ATUALIZADO" : "DADOS ANTIGOS");
        drawCentered(dc, cx, height * 0.47, Graphics.FONT_XTINY,
                freshness == "fresh" ? "Cache local pronto" : "Offline • usando cache");

        if (generated > 0) {
            drawCentered(dc, cx, height * 0.61, Graphics.FONT_XTINY,
                    "Última sync " + ageLabel(generated));
        }
        if (validUntil > 0 && freshness == "fresh") {
            drawCentered(dc, cx, height * 0.70, Graphics.FONT_XTINY,
                    remainingLabel(validUntil));
        }
    }

    private function drawPageMarker(dc, cx, height) {
        drawCentered(dc, cx, height * 0.86, Graphics.FONT_XTINY,
                (page + 1).toString() + "/" + PAGE_COUNT.toString());
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

    private function rowValue(row, index) {
        if (row == null || row.size() <= index || row[index] == null) {
            return "";
        }
        return row[index].toString();
    }

    private function textOr(value, fallback) {
        return value == null ? fallback : value.toString();
    }

    private function safeNumber(value) {
        if (value == null) {
            return 0;
        }
        try {
            return value.toNumber();
        } catch (e) {
            return 0;
        }
    }

    private function ageLabel(epochSeconds) {
        var delta = Time.now().value() - epochSeconds;
        if (delta <= 30) {
            return "agora";
        }
        if (delta < 3600) {
            return "há " + ((delta + 30) / 60).toNumber().toString() + " min";
        }
        if (delta < 86400) {
            return "há " + ((delta + 1800) / 3600).toNumber().toString() + " h";
        }
        return "há " + ((delta + 43200) / 86400).toNumber().toString() + " d";
    }

    private function remainingLabel(epochSeconds) {
        var delta = epochSeconds - Time.now().value();
        if (delta <= 60) {
            return "Atualização em breve";
        }
        if (delta < 3600) {
            return "Válido por " + ((delta + 30) / 60).toNumber().toString() + " min";
        }
        return "Válido por " + ((delta + 1800) / 3600).toNumber().toString() + " h";
    }
}
