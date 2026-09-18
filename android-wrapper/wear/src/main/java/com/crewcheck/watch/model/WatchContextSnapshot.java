package com.crewcheck.watch.model;

import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Objects;

/** A compact rendering projection produced by CrewCheck's canonical roster runtime. */
public final class WatchContextSnapshot {
    public static final int SCHEMA_VERSION = 1;

    public final int schemaVersion;
    public final String snapshotId;
    public final String journeyId;
    public final long generatedAtEpochMs;
    public final long validUntilEpochMs;
    public final String phase;
    public final String nextActionLabel;
    public final String nextActionValue;
    public final String nextActionDetail;
    public final String presentationTime;
    public final String presentationPlace;
    public final String leaveTime;
    public final String trafficDetail;
    public final String currentFlight;
    public final String currentRoute;
    public final String eta;
    public final String gate;
    public final String gateMode;
    public final String connection;
    public final String nextFlight;
    public final String nextDetail;
    public final String overnight;
    public final String hotelPickup;
    public final String alertId;
    public final String alertTitle;
    public final String alertBody;

    private final String persistedJson;

    private WatchContextSnapshot(JSONObject json) throws JSONException {
        schemaVersion = json.optInt("schemaVersion", SCHEMA_VERSION);
        if (schemaVersion != SCHEMA_VERSION) {
            throw new JSONException("Unsupported watch schema " + schemaVersion);
        }

        JSONObject next = object(json, "nextAction");
        JSONObject presentation = object(json, "presentation");
        JSONObject leave = object(json, "leave");
        JSONObject leg = object(json, "currentLeg");
        JSONObject connectionInfo = object(json, "connectionInfo");
        JSONObject overnightInfo = object(json, "overnightInfo");
        JSONObject alert = object(json, "alert");

        snapshotId = value(json, "snapshotId", "id");
        journeyId = value(json, "journeyId", "dutyId");
        generatedAtEpochMs = normalizedEpoch(json, "generatedAtEpochMs", "generatedAt",
                System.currentTimeMillis());
        validUntilEpochMs = normalizedEpoch(json, "validUntilEpochMs", "validUntil",
                generatedAtEpochMs + 6L * 60L * 60L * 1000L);
        phase = upper(value(json, "phase", "state"));

        nextActionLabel = value(next, "label", "title");
        nextActionValue = value(next, "value", "time");
        nextActionDetail = value(next, "detail", "subtitle");

        presentationTime = choose(value(presentation, "time", "value"),
                value(json, "presentationTime", "apz"));
        presentationPlace = choose(value(presentation, "place", "detail"),
                value(json, "presentationPlace", "apzPlace"));
        leaveTime = choose(value(leave, "time", "value"), value(json, "leaveTime"));
        trafficDetail = choose(value(leave, "detail", "trafficDetail"),
                value(json, "trafficDetail"));

        currentFlight = upper(choose(value(leg, "flight", "flightNumber"),
                value(json, "currentFlight", "flight")));
        currentRoute = upper(choose(value(leg, "route", "sector"),
                value(json, "currentRoute", "route")));
        eta = choose(value(leg, "eta", "arrivalTime"), value(json, "eta"));
        gate = upper(choose(value(leg, "gate", "departureGate"), value(json, "gate")));
        gateMode = upper(choose(value(leg, "gateMode", "boardingMode"),
                value(json, "gateMode")));

        connection = choose(value(connectionInfo, "duration", "value"),
                value(json, "connection"));
        nextFlight = upper(choose(value(connectionInfo, "nextFlight", "flight"),
                value(json, "nextFlight")));
        nextDetail = choose(value(connectionInfo, "detail", "nextDetail"),
                value(json, "nextDetail"));
        overnight = upper(choose(value(overnightInfo, "station", "value"),
                value(json, "overnight")));
        hotelPickup = choose(value(overnightInfo, "detail", "hotelPickup"),
                value(json, "hotelPickup"));

        alertId = choose(value(alert, "id", "alertId"), value(json, "alertId"));
        alertTitle = choose(value(alert, "title", "label"), value(json, "alertTitle"));
        alertBody = choose(value(alert, "body", "detail"), value(json, "alertBody"));

        if (nextActionLabel.isEmpty() && currentFlight.isEmpty()
                && presentationTime.isEmpty() && leaveTime.isEmpty()) {
            throw new JSONException("Snapshot has no renderable watch data");
        }

        json.put("schemaVersion", SCHEMA_VERSION);
        json.put("generatedAtEpochMs", generatedAtEpochMs);
        json.put("validUntilEpochMs", validUntilEpochMs);
        persistedJson = json.toString();
    }

    public static WatchContextSnapshot fromJson(String raw) throws JSONException {
        JSONObject input = new JSONObject(raw);
        JSONObject nested = input.optJSONObject("snapshot");
        return new WatchContextSnapshot(nested == null ? input : nested);
    }

    public String toJsonString() {
        return persistedJson;
    }

    public boolean isStale(long nowEpochMs) {
        return validUntilEpochMs > 0L && nowEpochMs > validUntilEpochMs;
    }

    public String displayGate() {
        if (gateMode.equals("REMOTE") || gateMode.equals("REMOTA")
                || gateMode.equals("BUS") || gateMode.equals("REMOTE_STAND")) {
            return "REMOTA";
        }
        if (gate.isEmpty()) return "—";
        return gate.replaceFirst("^(GATE|PORTÃO)\\s+", "");
    }

    public String nextStepLabel() {
        if (!nextActionLabel.isEmpty()) return nextActionLabel;
        return switch (phase) {
            case "LEAVE", "DEPART_HOME" -> "HORA DE SAIR";
            case "PRESENTATION", "SHOW_UP" -> "APRESENTAÇÃO";
            case "BOARDING" -> "EMBARQUE";
            case "FLIGHT", "IN_FLIGHT" -> "VOO ATUAL";
            case "CONNECTION" -> "CONEXÃO";
            case "OVERNIGHT", "HOTEL" -> "PICKUP";
            default -> "PRÓXIMO PASSO";
        };
    }

    public String nextStepValue() {
        if (!nextActionValue.isEmpty()) return nextActionValue;
        return switch (phase) {
            case "LEAVE", "DEPART_HOME" -> leaveTime;
            case "PRESENTATION", "SHOW_UP" -> presentationTime;
            case "BOARDING" -> displayGate().equals("—") ? currentFlight : "PORTÃO " + displayGate();
            case "FLIGHT", "IN_FLIGHT" -> currentFlight;
            case "CONNECTION" -> connection;
            case "OVERNIGHT", "HOTEL" -> hotelPickup;
            default -> first(leaveTime, presentationTime, currentFlight, nextFlight, "Sem atividade");
        };
    }

    public String nextStepDetail() {
        if (!nextActionDetail.isEmpty()) return nextActionDetail;
        return switch (phase) {
            case "LEAVE", "DEPART_HOME" -> first(trafficDetail, presentationPlace);
            case "PRESENTATION", "SHOW_UP" -> presentationPlace;
            case "BOARDING" -> first(currentRoute, currentFlight);
            case "FLIGHT", "IN_FLIGHT" -> join(currentRoute, eta.isEmpty() ? "" : "ETA " + eta);
            case "CONNECTION" -> join(nextFlight, nextDetail);
            case "OVERNIGHT", "HOTEL" -> join(overnight, hotelPickup);
            default -> first(currentRoute, presentationPlace, nextDetail, hotelPickup);
        };
    }

    public String shortNextStep() {
        if (displayGate().equals("REMOTA") && phase.equals("BOARDING")) return "REMOTA";
        String value = upper(nextStepValue());
        if (value.codePointCount(0, value.length()) <= 7) return value;
        String label = upper(nextStepLabel());
        if (label.contains("SAIR")) return "SAIR";
        if (label.contains("APRESENT")) return "APZ";
        if (label.contains("EMBAR")) return "EMBARQ";
        if (label.contains("CONEX")) return "CONEX";
        if (label.contains("PICKUP")) return "PICKUP";
        return trim(value, 7);
    }

    public String shortFlight() {
        return trim(first(currentFlight, nextFlight, "—"), 7);
    }

    public boolean shouldAlertComparedWith(WatchContextSnapshot previous) {
        return !alertId.isEmpty() && !alertBody.isEmpty()
                && (previous == null || !Objects.equals(alertId, previous.alertId));
    }

    public static WatchContextSnapshot demo() {
        long now = System.currentTimeMillis();
        String json = "{" +
                "\"schemaVersion\":1," +
                "\"snapshotId\":\"demo-v1\"," +
                "\"generatedAtEpochMs\":" + now + "," +
                "\"validUntilEpochMs\":" + (now + 86_400_000L) + "," +
                "\"phase\":\"LEAVE\"," +
                "\"nextAction\":{\"label\":\"SAIR EM\",\"value\":\"18 MIN\",\"detail\":\"APZ 13:30 • BSB\"}," +
                "\"presentation\":{\"time\":\"13:30\",\"place\":\"BSB • apresentação\"}," +
                "\"leave\":{\"time\":\"12:42\",\"detail\":\"Trânsito normal • 28 min\"}," +
                "\"currentLeg\":{\"flight\":\"LA3721\",\"route\":\"BSB → GRU\",\"eta\":\"15:35\",\"gate\":\"24\",\"gateMode\":\"JET_BRIDGE\"}," +
                "\"connectionInfo\":{\"duration\":\"1H20\",\"nextFlight\":\"LA3102\",\"detail\":\"Portão 18 • embarque 16:15\"}," +
                "\"overnightInfo\":{\"station\":\"GYN\",\"detail\":\"Hotel confirmado • pickup 09:20\"}" +
                "}";
        try {
            return fromJson(json);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static JSONObject object(JSONObject parent, String name) {
        JSONObject value = parent.optJSONObject(name);
        return value == null ? new JSONObject() : value;
    }

    private static String value(JSONObject object, String... keys) {
        for (String key : keys) {
            Object value = object.opt(key);
            if (value == null || value == JSONObject.NULL) continue;
            String text = clean(String.valueOf(value));
            if (!text.isEmpty() && !text.equalsIgnoreCase("null")) return text;
        }
        return "";
    }

    private static long normalizedEpoch(JSONObject object, String numericKey,
                                        String isoKey, long fallback) {
        long numeric = object.optLong(numericKey, 0L);
        if (numeric > 0L) return numeric;
        String raw = value(object, isoKey);
        if (raw.isEmpty()) return fallback;
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException ignored) {
        }
        try {
            return Instant.parse(raw).toEpochMilli();
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private static String choose(String preferred, String fallback) {
        return preferred.isEmpty() ? clean(fallback) : clean(preferred);
    }

    private static String first(String... values) {
        for (String value : values) {
            String clean = clean(value);
            if (!clean.isEmpty()) return clean;
        }
        return "";
    }

    private static String join(String first, String second) {
        String a = clean(first);
        String b = clean(second);
        if (a.isEmpty()) return b;
        if (b.isEmpty()) return a;
        return a + " • " + b;
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    private static String upper(String value) {
        return clean(value).toUpperCase(Locale.ROOT);
    }

    private static String trim(String value, int maxCodePoints) {
        String clean = clean(value);
        int count = clean.codePointCount(0, clean.length());
        return count <= maxCodePoints ? clean
                : clean.substring(0, clean.offsetByCodePoints(0, maxCodePoints));
    }
}
