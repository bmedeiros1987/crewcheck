package com.crewcheck.app;

import org.json.JSONObject;
import java.util.Iterator;
import java.util.Set;

/** Pure wire contract. No receipt time, identity, raw series or inferred zero. */
public final class CrewLifeV2Protocol {
    public static final String CAPABILITY = "crewlife_metric_validity_v2";
    public static final String PATH = "/crewcheck/watch/crewlife/v2";
    public static final String CONTROL_PATH = PATH + "/control";
    public static final String ACK_PATH = PATH + "/ack";
    public static final String DATA_KEY = "crewLifeJson";
    public static final String[] KEYS = {"recoveryScore", "sleepMinutes", "steps", "activeMinutes"};
    private static final int[] MAX = {100, 1440, 200000, 1440};
    private static final String[] CATEGORIES = {"recovery", "sleep", "activity", "activity"};
    private static final Set<String> STATES = Set.of("valid", "no_data", "expired", "sample_time_unknown", "revoked", "permission_denied", "invalid");
    private CrewLifeV2Protocol() {}
    private static void rejectPrivate(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject)value;
            Set<String> privateKeys = Set.of("ownerId", "email", "phone", "crewId", "crewName", "heartRateSamples", "heartRateSeries",
                    "sleepStages", "samples", "location", "latitude", "longitude", "gps", "token", "accessToken", "refreshToken");
            for (Iterator<String> i = object.keys(); i.hasNext();) {
                String key = i.next();
                if (privateKeys.contains(key)) throw new IllegalArgumentException("Private CrewLife field");
                rejectPrivate(object.opt(key));
            }
        } else if (value instanceof org.json.JSONArray) {
            org.json.JSONArray array = (org.json.JSONArray)value;
            for (int i = 0; i < array.length(); i++) rejectPrivate(array.opt(i));
        }
    }

    static long integer(Object value, long fallback) {
        if (!(value instanceof Number)) return fallback;
        double n = ((Number)value).doubleValue();
        if (!Double.isFinite(n) || n != Math.rint(n) || n < 0 || n > 9007199254740991d) return fallback;
        return ((Number)value).longValue();
    }
    static void keys(JSONObject value, Set<String> allowed) {
        for (Iterator<String> i = value.keys(); i.hasNext();) {
            if (!allowed.contains(i.next())) throw new IllegalArgumentException("Unknown CrewLife field");
        }
    }

    /** Receives only the phone projection, before stream/revision allocation. */
    static JSONObject sanitize(JSONObject source, Set<String> categories, long now) throws Exception {
        if (source.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 4096) throw new IllegalArgumentException("CrewLife too large");
        rejectPrivate(source);
        keys(source, Set.of("schemaVersion", "generatedAtEpochMs", "validUntilEpochMs", "metrics"));
        if (integer(source.opt("schemaVersion"), -1) != 2) throw new IllegalArgumentException("CrewLife v2 required");
        long generated = integer(source.opt("generatedAtEpochMs"), 0);
        long expiry = integer(source.opt("validUntilEpochMs"), 0);
        if (generated <= 0 || generated > now || expiry <= now || expiry < generated) throw new IllegalArgumentException("Invalid source window");
        JSONObject input = source.getJSONObject("metrics");
        keys(input, Set.of(KEYS));
        JSONObject metrics = new JSONObject();
        for (int i = 0; i < KEYS.length; i++) {
            String key = KEYS[i];
            JSONObject metric = input.optJSONObject(key);
            String state = "no_data";
            long until = 0, value = -1;
            if (metric != null) {
                keys(metric, Set.of("state", "value", "validUntilEpochMs"));
                state = metric.optString("state", "invalid");
                if (!STATES.contains(state)) state = "invalid";
                until = integer(metric.opt("validUntilEpochMs"), 0);
                value = integer(metric.opt("value"), -1);
                if (state.equals("valid")) {
                    if (value < 0 || value > MAX[i] || until <= 0 || until > expiry || until < generated) state = "invalid";
                    else if (until <= now) state = "expired";
                }
            } else if (input.has(key)) state = "invalid";
            if (!categories.contains(CATEGORIES[i])) state = "permission_denied";
            JSONObject clean = new JSONObject().put("state", state).put("validUntilEpochMs", state.equals("valid") ? until : 0);
            if (state.equals("valid")) clean.put("value", value);
            metrics.put(key, clean);
        }
        return new JSONObject().put("schemaVersion", 2).put("kind", "snapshot")
                .put("generatedAtEpochMs", generated).put("validUntilEpochMs", expiry).put("metrics", metrics);
    }

    /** Only maps values whose provenance was already checked by CompanionFreshness. */
    static JSONObject project(JSONObject source) throws Exception {
        JSONObject metrics = new JSONObject(), validity = source.optJSONObject("metricValidity");
        long envelope = integer(source.opt("validUntilEpochMs"), 0);
        for (String key : KEYS) {
            String original = key.equals("recoveryScore") ? "energyScore" : key;
            JSONObject v = validity == null ? null : validity.optJSONObject(original);
            String state = v == null ? "sample_time_unknown" : v.optString("state", "invalid");
            if (state.equals("stale")) state = "expired";
            JSONObject m = new JSONObject().put("state", state).put("validUntilEpochMs", v == null ? 0 : v.opt("validUntilEpochMs"));
            if (!source.isNull(original)) m.put("value", source.opt(original));
            // Conservative projection: neither this metric nor the v1 envelope is extended.
            if ("valid".equals(state)) m.put("validUntilEpochMs", Math.min(envelope,
                    v == null ? 0 : integer(v.opt("validUntilEpochMs"), 0)));
            metrics.put(key, m);
        }
        return new JSONObject().put("schemaVersion", 2).put("generatedAtEpochMs", source.opt("generatedAtEpochMs"))
                .put("validUntilEpochMs", envelope).put("metrics", metrics);
    }
}
