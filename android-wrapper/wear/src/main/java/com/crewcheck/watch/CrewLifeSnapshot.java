package com.crewcheck.watch;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Source-deadline-only v2 health projection. No labels, narratives, identity or raw data. */
public final class CrewLifeSnapshot {
    static final long MAX_INTEGER = 9_007_199_254_740_991L;
    static final Map<String, Integer> LIMITS = Map.of(
            "recoveryScore", 100, "sleepMinutes", 1440, "steps", 200000, "activeMinutes", 1440);
    private static final Set<String> ENVELOPE = Set.of("schemaVersion", "streamId", "revision", "kind",
            "generatedAtEpochMs", "validUntilEpochMs", "metrics");
    private static final Set<String> METRIC_FIELDS = Set.of("state", "value", "validUntilEpochMs");
    private static final Set<String> STATES = Set.of("valid", "no_data", "expired", "sample_time_unknown",
            "revoked", "permission_denied", "invalid");
    public final int schemaVersion = 2;
    public final String streamId;
    public final long revision, generatedAtEpochMs, validUntilEpochMs;
    public final String kind;
    private final Map<String, Metric> metrics;
    // Compatibility for callers: unavailable is -1, never zero. Rendering must use value(key, now).
    public final int recoveryScore, sleepMinutes, steps, activeMinutes;

    private static final class Metric {
        final String state;
        final int value;
        final long until;
        Metric(String state, int value, long until) { this.state = state; this.value = value; this.until = until; }
    }
    private CrewLifeSnapshot(String stream, long revision, long generated, long until, String kind,
            Map<String, Metric> metrics) {
        this.streamId = stream; this.revision = revision; this.generatedAtEpochMs = generated;
        this.validUntilEpochMs = until; this.kind = kind; this.metrics = metrics;
        recoveryScore = storedValue("recoveryScore"); sleepMinutes = storedValue("sleepMinutes");
        steps = storedValue("steps"); activeMinutes = storedValue("activeMinutes");
    }
    private int storedValue(String key) { return metrics.get(key).value; }
    public static CrewLifeSnapshot fromJson(String raw) { return fromJson(raw, System.currentTimeMillis()); }
    public static CrewLifeSnapshot fromJson(JSONObject json) { return fromJson(json, System.currentTimeMillis()); }
    static CrewLifeSnapshot fromJson(String raw, long now) {
        try {
            if (raw == null || raw.isBlank() || raw.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_WELLBEING_BYTES)
                throw new IllegalArgumentException("CrewLife inválido ou maior que 4 KiB.");
            return fromJson(new JSONObject(raw), now);
        } catch (Exception error) { throw new IllegalArgumentException("CrewLife v2 inválido.", error); }
    }
    static CrewLifeSnapshot fromJson(JSONObject json, long now) {
        try {
            only(json, ENVELOPE);
            if (integer(json.opt("schemaVersion")) != 2) throw new IllegalArgumentException("CrewLife v2 obrigatório.");
            String stream = nonce(json.opt("streamId"));
            long revision = positive(json.opt("revision"));
            Object rawKind = json.opt("kind");
            if (!(rawKind instanceof String) || !(rawKind.equals("snapshot") || rawKind.equals("revoked")))
                throw new IllegalArgumentException("Kind inválido.");
            String kind = (String) rawKind;
            long generated = integer(json.opt("generatedAtEpochMs"));
            // Value-free tombstone has no measurement time; zero is not freshness evidence.
            if (generated < 0 || (kind.equals("snapshot") && generated == 0) || generated > now)
                throw new IllegalArgumentException("Geração inválida ou futura.");
            long until = integer(json.opt("validUntilEpochMs"));
            if (kind.equals("revoked") ? until != 0 : until <= generated)
                throw new IllegalArgumentException("Janela inválida.");
            JSONObject source = json.getJSONObject("metrics");
            only(source, LIMITS.keySet());
            if (kind.equals("revoked") && source.length() != 0) throw new IllegalArgumentException("Tombstone com valores.");
            Map<String, Metric> metrics = new LinkedHashMap<>();
            for (String key : LIMITS.keySet()) {
                Metric metric = new Metric("no_data", -1, 0);
                if (source.has(key)) {
                    Object item = source.opt(key);
                    // Unknown nested fields reject the envelope; bad scalar/value only invalidates this metric.
                    if (item instanceof JSONObject) {
                        JSONObject m = (JSONObject)item;
                        only(m, METRIC_FIELDS);
                        for (String field : METRIC_FIELDS) {
                            Object v = m.opt(field);
                            if (v instanceof JSONObject || v instanceof org.json.JSONArray)
                                throw new IllegalArgumentException("Nested metric data prohibited.");
                        }
                        try {
                            Object state = m.opt("state");
                            if (!(state instanceof String) || !STATES.contains(state)) throw new IllegalArgumentException();
                            long deadline = integer(m.opt("validUntilEpochMs"));
                            if (state.equals("valid")) {
                                long value = integer(m.opt("value"));
                                if (value < 0 || value > LIMITS.get(key) || deadline > until || deadline <= generated)
                                    throw new IllegalArgumentException();
                                metric = new Metric("valid", (int)value, deadline);
                            } else {
                                if (m.has("value") || deadline != 0) throw new IllegalArgumentException();
                                metric = new Metric((String)state, -1, 0);
                            }
                        } catch (IllegalArgumentException badMetric) { metric = new Metric("invalid", -1, 0); }
                    } else if (item instanceof org.json.JSONArray) {
                        throw new IllegalArgumentException("Nested metric data prohibited.");
                    } else metric = new Metric("invalid", -1, 0);
                }
                metrics.put(key, metric);
            }
            return new CrewLifeSnapshot(stream, revision, generated, until, kind, metrics);
        } catch (Exception error) { throw new IllegalArgumentException("CrewLife v2 inválido.", error); }
    }
    static void only(JSONObject json, Set<String> allowed) {
        java.util.Iterator<String> keys = json.keys();
        while (keys.hasNext()) if (!allowed.contains(keys.next())) throw new IllegalArgumentException("Unknown field.");
    }
    static long integer(Object value) {
        if (!(value instanceof Number)) throw new IllegalArgumentException("Integer required.");
        double number = ((Number)value).doubleValue();
        if (!Double.isFinite(number) || number != Math.rint(number) || Math.abs(number) > MAX_INTEGER)
            throw new IllegalArgumentException("Safe integer required.");
        return ((Number)value).longValue();
    }
    static long positive(Object value) { long n = integer(value); if (n <= 0) throw new IllegalArgumentException(); return n; }
    static String nonce(Object value) {
        if (!(value instanceof String)) throw new IllegalArgumentException("UUID required.");
        String s = (String)value;
        if (!UUID.fromString(s).toString().equals(s)) throw new IllegalArgumentException("Canonical UUID required.");
        return s;
    }
    public JSONObject toJson() {
        try {
            JSONObject values = new JSONObject();
            if (!kind.equals("revoked")) for (Map.Entry<String, Metric> entry : metrics.entrySet()) {
                Metric m = entry.getValue();
                JSONObject item = new JSONObject().put("state", m.state).put("validUntilEpochMs", m.until);
                if (m.value >= 0) item.put("value", m.value);
                values.put(entry.getKey(), item);
            }
            return new JSONObject().put("schemaVersion", 2).put("streamId", streamId).put("revision", revision)
                    .put("generatedAtEpochMs", generatedAtEpochMs).put("validUntilEpochMs", validUntilEpochMs)
                    .put("kind", kind).put("metrics", values);
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    public Integer value(String key, long now) {
        Metric m = metrics.get(key);
        return m != null && m.value >= 0 && !isStale(now) && now < m.until ? m.value : null;
    }
    public boolean isStale(long now) { return kind.equals("revoked") || now >= validUntilEpochMs; }
    public boolean hasAny(long now) { for (String key : LIMITS.keySet()) if (value(key, now) != null) return true; return false; }
    public long nextExpiry(long now) {
        long next = 0;
        for (String key : LIMITS.keySet()) if (value(key, now) != null)
            next = next == 0 ? metrics.get(key).until : Math.min(next, metrics.get(key).until);
        return next;
    }
    public boolean isEnergyScore() { return true; }
    public String complicationTitle() { return "ENERGIA"; }
    public String complicationText(long now) { Integer score = value("recoveryScore", now); return score == null ? "--" : score + "/100"; }
    public String sleepText(long now) {
        Integer sleep = value("sleepMinutes", now);
        return sleep == null ? "--" : (sleep / 60) + "h" + String.format(java.util.Locale.ROOT, "%02d", sleep % 60);
    }
    public String accessibilityDescription(long now) {
        if (!hasAny(now)) return "Dados de bem-estar indisponíveis ou desatualizados.";
        Integer score = value("recoveryScore", now);
        return (score == null ? "Energia indisponível" : "Energia Samsung " + score + " de 100") + ", sono " + sleepText(now);
    }
    public static CrewLifeSnapshot demo(long now) {
        try {
            JSONObject metrics = new JSONObject();
            int[] values = {78,412,6430,31}; String[] keys = {"recoveryScore","sleepMinutes","steps","activeMinutes"};
            for (int i=0;i<keys.length;i++) metrics.put(keys[i],new JSONObject().put("state","valid").put("value",values[i]).put("validUntilEpochMs",now+21600000));
            return fromJson(new JSONObject().put("schemaVersion",2).put("streamId","00000000-0000-4000-8000-000000000001")
                    .put("revision",1).put("kind","snapshot").put("generatedAtEpochMs",now)
                    .put("validUntilEpochMs",now+21600000).put("metrics",metrics), now);
        } catch(Exception error) { throw new IllegalStateException(error); }
    }
}
