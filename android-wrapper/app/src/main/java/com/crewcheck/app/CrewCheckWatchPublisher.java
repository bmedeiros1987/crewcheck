package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Sends only an allow-listed, presentation-ready roster projection to the paired watch.
 * The watch never receives login tokens, CPF, e-mail, crew name or hotel room numbers.
 *
 * watchSnapshotV1 is backward-compatible: basic canonical roster is always available. The
 * optional premiumAccess flag defaults to false, so an older phone/peer fails closed and keeps
 * basic roster rather than exposing fields that may depend on paid/costly integrations.
 */
public final class CrewCheckWatchPublisher {
    public static final String SNAPSHOT_PATH = "/crewcheck/watch/context/v1";
    public static final String REQUEST_SYNC_PATH = "/crewcheck/watch/request-sync/v1";
    public static final String DATA_KEY_SNAPSHOT_JSON = "snapshotJson";

    private static final int SCHEMA_VERSION = 1;
    private static final int MAX_SNAPSHOT_BYTES = 16 * 1024;
    private static final String PREFS = "crewcheck_watch_sync";
    private static final String LAST_SNAPSHOT = "last_snapshot";

    private static final Set<String> ALLOWED_STATES = Set.of(
            "OFF_DUTY", "LEAVE_SOON", "REPORTING", "BOARDING", "IN_FLIGHT",
            "CONNECTION", "OVERNIGHT", "CHANGED", "UNKNOWN"
    );

    public interface Callback {
        void onResult(boolean ok, String code, String message);
    }

    private CrewCheckWatchPublisher() {}

    public static void publish(Context context, String rawJson, Callback callback) {
        final Callback safeCallback = callback == null ? (ok, code, message) -> {} : callback;
        final String snapshot;
        try {
            snapshot = sanitize(rawJson);
        } catch (Exception error) {
            safeCallback.onResult(false, "invalid_snapshot", safeMessage(error));
            return;
        }

        Context app = context.getApplicationContext();
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(LAST_SNAPSHOT, snapshot)
                .apply();

        PutDataMapRequest mapRequest = PutDataMapRequest.create(SNAPSHOT_PATH);
        DataMap dataMap = mapRequest.getDataMap();
        dataMap.putString(DATA_KEY_SNAPSHOT_JSON, snapshot);
        dataMap.putLong("sentAtEpochMs", System.currentTimeMillis());

        PutDataRequest request = mapRequest.asPutDataRequest().setUrgent();
        Wearable.getDataClient(app)
                .putDataItem(request)
                .addOnSuccessListener(item -> safeCallback.onResult(
                        true,
                        "published",
                        item.getUri() == null ? SNAPSHOT_PATH : item.getUri().toString()
                ))
                .addOnFailureListener(error -> safeCallback.onResult(
                        false,
                        "data_layer_error",
                        safeMessage(error)
                ));
    }

    public static void republishLast(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String cached = prefs.getString(LAST_SNAPSHOT, "");
        if (cached == null || cached.isBlank()) return;
        publish(app, cached, null);
    }

    static String sanitize(String rawJson) throws Exception {
        if (rawJson == null || rawJson.isBlank()) {
            throw new IllegalArgumentException("Snapshot vazio.");
        }
        if (rawJson.getBytes(StandardCharsets.UTF_8).length > MAX_SNAPSHOT_BYTES) {
            throw new IllegalArgumentException("Snapshot excede 16 KiB.");
        }

        JSONObject source = new JSONObject(rawJson);
        long schemaVersion = strictRequiredJsonInteger(source, "schemaVersion");
        if (schemaVersion != SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão de snapshot incompatível.");
        }

        long generatedAt = strictRequiredJsonInteger(source, "generatedAtEpochMs");
        long validUntil = strictRequiredJsonInteger(source, "validUntilEpochMs");
        if (generatedAt <= 0L || validUntil < generatedAt) {
            throw new IllegalArgumentException("Janela temporal inválida.");
        }

        String state = clean(source.optString("state", "UNKNOWN"), 24).toUpperCase();
        if (!ALLOWED_STATES.contains(state)) state = "UNKNOWN";
        boolean premiumAccess = strictOptionalBoolean(source, "premiumAccess", false);

        JSONObject out = new JSONObject();
        out.put("schemaVersion", SCHEMA_VERSION);
        out.put("premiumAccess", premiumAccess);
        copyString(source, out, "contextId", 80);
        out.put("generatedAtEpochMs", generatedAt);
        out.put("validUntilEpochMs", validUntil);
        out.put("state", state);

        // Free/basic contract: canonical roster facts do not depend on paid APIs.
        copyString(source, out, "headline", 42);
        copyString(source, out, "primaryTime", 12);
        copyString(source, out, "detail", 96);
        copyString(source, out, "presentationTime", 12);
        copyString(source, out, "presentationPlace", 42);
        copyString(source, out, "currentFlight", 16);
        copyString(source, out, "currentRoute", 32);
        copyString(source, out, "boardingTime", 12);
        copyString(source, out, "eta", 12);
        copyString(source, out, "connection", 16);
        copyString(source, out, "nextFlight", 16);
        copyString(source, out, "nextDetail", 64);
        copyString(source, out, "overnight", 24);
        copySchedule(source, out, premiumAccess);

        // Premium-only projection. Absence or downgrade removes these fields on the next snapshot.
        if (premiumAccess) {
            copyString(source, out, "leaveTime", 12);
            copyString(source, out, "trafficDetail", 64);
            copyString(source, out, "gate", 18);
            out.put("remoteStand", strictOptionalBoolean(source, "remoteStand", false));
            copyString(source, out, "hotelPickup", 64);
            out.put("changed", strictOptionalBoolean(source, "changed", false));
        } else {
            out.put("changed", false);
        }

        out.put("source", "canonical-roster");
        rejectSensitiveFields(source);

        String normalized = out.toString();
        if (normalized.getBytes(StandardCharsets.UTF_8).length > MAX_SNAPSHOT_BYTES) {
            throw new IllegalArgumentException("Snapshot normalizado excede 16 KiB.");
        }
        return normalized;
    }

    private static void copySchedule(JSONObject source, JSONObject target, boolean premiumAccess) throws Exception {
        JSONArray input = source.optJSONArray("schedule");
        if (input == null) return;

        JSONArray output = new JSONArray();
        int limit = Math.min(input.length(), 8);
        for (int i = 0; i < limit; i++) {
            JSONObject item = input.optJSONObject(i);
            if (item == null) continue;

            JSONObject cleanItem = new JSONObject();
            copyString(item, cleanItem, "id", 80);
            cleanItem.put("kind", normalizeScheduleKind(item));
            copyString(item, cleanItem, "time", 12);
            copyString(item, cleanItem, "title", 24);
            copyString(item, cleanItem, "route", 32);
            copyString(item, cleanItem, "presentation", 12);
            if (premiumAccess) copyString(item, cleanItem, "gate", 18);
            copyString(item, cleanItem, "detail", 64);
            if (cleanItem.length() > 0) output.put(cleanItem);
        }
        if (output.length() > 0) target.put("schedule", output);
    }

    private static long strictRequiredJsonInteger(JSONObject source, String key) {
        Object value = source.opt(key);
        if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long)) {
            throw new IllegalArgumentException("Campo obrigatório deve ser inteiro JSON: " + key);
        }
        return ((Number) value).longValue();
    }

    private static boolean strictOptionalBoolean(JSONObject source, String key, boolean defaultValue) {
        Object value = source.opt(key);
        return value instanceof Boolean ? (Boolean) value : defaultValue;
    }

    private static String normalizeScheduleKind(JSONObject item) {
        Object raw = item.opt("kind");
        if (!(raw instanceof String)) return "duty";
        String kind = clean((String) raw, 12);
        if ("flight".equalsIgnoreCase(kind)) return "flight";
        if ("stay".equalsIgnoreCase(kind)) return "stay";
        return "duty";
    }

    private static void rejectSensitiveFields(JSONObject source) {
        String[] prohibited = {
                "cpf", "email", "phone", "crewName", "hotelRoom", "roomNumber",
                "token", "accessToken", "refreshToken", "authorization"
        };
        for (String key : prohibited) {
            if (source.has(key)) {
                throw new IllegalArgumentException("Campo não permitido no relógio: " + key);
            }
        }
    }

    private static void copyString(JSONObject source, JSONObject target, String key, int max) throws Exception {
        String value = clean(source.optString(key, ""), max);
        if (!value.isBlank() && !"null".equalsIgnoreCase(value)) target.put(key, value);
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }

    private static String safeMessage(Throwable error) {
        if (error == null || error.getMessage() == null || error.getMessage().isBlank()) {
            return "Falha ao sincronizar o CrewCheck Watch.";
        }
        String value = error.getMessage().trim();
        return value.length() <= 180 ? value : value.substring(0, 180);
    }
}
