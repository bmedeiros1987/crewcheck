package com.crewcheck.auto;

import org.json.JSONObject;
import java.net.URLEncoder;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Read-only adapter of watchContext.ts v1. Never parses a roster or calculates APZ. */
public final class DriveSnapshot {
    public static final long MAX_AGE_MS = 15 * 60_000L;
    public static final int MAX_BYTES = 16 * 1024;
    private static final List<String> STATES = Arrays.asList("OFF_DUTY", "LEAVE_SOON", "REPORTING",
            "BOARDING", "IN_FLIGHT", "CONNECTION", "OVERNIGHT", "CHANGED", "UNKNOWN");
    public final String contextId, state, place, presentationTime, flight, hotel;
    public final long generatedAt, validUntil;

    private DriveSnapshot(JSONObject j, long now) throws Exception {
        if (integer(j, "schemaVersion") != 1 || !"canonical-roster".equals(j.optString("source"))) {
            throw new IllegalArgumentException("Projeção incompatível.");
        }
        generatedAt = integer(j, "generatedAtEpochMs");
        validUntil = integer(j, "validUntilEpochMs");
        if (generatedAt <= 0 || generatedAt > now + 60_000L || validUntil <= generatedAt
                || validUntil - generatedAt > 24 * 60 * 60_000L) {
            throw new IllegalArgumentException("Janela de atualização inválida.");
        }
        contextId = field(j, "contextId", 80);
        if (contextId.isEmpty()) throw new IllegalArgumentException("Contexto ausente.");
        String candidate = field(j, "state", 24);
        state = STATES.contains(candidate) ? candidate : "UNKNOWN";
        place = field(j, "presentationPlace", 42);
        String clock = field(j, "presentationTime", 12);
        presentationTime = clock.matches("(?:[01]?[0-9]|2[0-3]):[0-5][0-9]") ? clock : "";
        flight = field(j, "currentFlight", 16);
        hotel = field(j, "detail", 96);
    }

    public static DriveSnapshot parse(String raw, long now) throws Exception {
        if (raw == null || raw.trim().isEmpty() || raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new IllegalArgumentException("Projeção vazia ou grande demais.");
        }
        return new DriveSnapshot(new JSONObject(raw), now);
    }

    private static long integer(JSONObject j, String key) throws Exception {
        Object value = j.get(key);
        if (!(value instanceof Number)) throw new IllegalArgumentException("Número inválido.");
        double d = ((Number) value).doubleValue();
        if (!Double.isFinite(d) || d != Math.floor(d) || Math.abs(d) > 9_007_199_254_740_991d) {
            throw new IllegalArgumentException("Número inválido.");
        }
        return ((Number) value).longValue();
    }

    private static String field(JSONObject j, String key, int max) {
        Object value = j.opt(key);
        return value instanceof String ? clean((String) value, max) : "";
    }

    public static String clean(String value, int max) {
        if (value == null) return "";
        String text = value.replaceAll("[\\p{Cntrl}\\p{Cf}]", " ").replaceAll("\\s+", " ").trim();
        if (text.equals("—") || text.equalsIgnoreCase("null") || text.equalsIgnoreCase("a confirmar")) return "";
        if (text.length() > max) {
            int end = max;
            if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
            text = text.substring(0, end);
        }
        return text;
    }

    public boolean isFresh(long now) {
        return now >= generatedAt && now < validUntil && now - generatedAt < MAX_AGE_MS;
    }

    public List<Destination> destinations(long now) {
        if (!isFresh(now)) return Collections.emptyList();
        List<Destination> out = new ArrayList<>();
        // Reserve, standby, connection and flight states must not produce a ground trip.
        if (("REPORTING".equals(state) || "LEAVE_SOON".equals(state) || "BOARDING".equals(state))
                && !flight.isEmpty() && place.matches("[A-Z]{3}")) {
            out.add(new Destination(contextId + ":airport", "Aeroporto " + place,
                    "Aeroporto " + place, presentationTime.isEmpty() ? "Destino da apresentação"
                    : "Apresentação informada: " + presentationTime, true));
        } else if ("OVERNIGHT".equals(state) && !hotel.isEmpty()
                && !hotel.matches("[A-Z]{3}") && !hotel.equalsIgnoreCase("hotel")) {
            out.add(new Destination(contextId + ":hotel", hotel,
                    hotel + (place.isEmpty() ? "" : ", " + place), "Hotel informado para o pernoite", true));
        }
        return Collections.unmodifiableList(out);
    }

    /** Strict allow-list: no tokens, health, roster arrays, identity or room fields are retained. */
    public String toSafeJson() throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("source", "canonical-roster")
                .put("contextId", contextId).put("generatedAtEpochMs", generatedAt)
                .put("validUntilEpochMs", validUntil).put("state", state)
                .put("presentationPlace", place).put("presentationTime", presentationTime)
                .put("currentFlight", flight).put("detail", "OVERNIGHT".equals(state) ? hotel : "")
                .toString();
    }

    public static final class Destination {
        public final String id, title, query, context;
        public final boolean canonical;
        public Destination(String id, String title, String query, String context, boolean canonical) {
            this.id = clean(id, 160);
            this.title = clean(title, 60);
            this.query = clean(query, 180);
            this.context = clean(context, 96);
            this.canonical = canonical;
            if (this.id.isEmpty() || this.title.isEmpty() || this.query.isEmpty()) {
                throw new IllegalArgumentException("Informe nome e endereço do destino.");
            }
        }
        public String geoUri() {
            try {
                // String overload works on API 28; the Charset overload requires API 33.
                return "geo:0,0?q=" + URLEncoder.encode(query, "UTF-8");
            } catch (UnsupportedEncodingException impossible) { throw new AssertionError(impossible); }
        }
        public boolean sameTarget(Destination other) {
            return other != null && id.equals(other.id) && query.equals(other.query)
                    && context.equals(other.context) && canonical == other.canonical;
        }
    }
}
