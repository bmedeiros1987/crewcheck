package com.crewcheck.app;

import android.content.Context;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Publishes a minimal, allow-listed CrewCheck projection to the paired Wear OS app.
 * The full roster, authentication tokens and personal profile never enter the payload.
 */
public final class CrewCheckWatchPublisher {
    public static final String SNAPSHOT_PATH = "/crewcheck/watch-context/v1";
    public static final String KEY_SNAPSHOT_JSON = "snapshotJson";
    private static final int SCHEMA_VERSION = 1;
    private static final int MAX_PAYLOAD_BYTES = 48 * 1024;

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

        PutDataMapRequest mapRequest = PutDataMapRequest.create(SNAPSHOT_PATH);
        DataMap dataMap = mapRequest.getDataMap();
        dataMap.putString(KEY_SNAPSHOT_JSON, snapshot);
        dataMap.putLong("sentAtEpochMs", System.currentTimeMillis());
        PutDataRequest request = mapRequest.asPutDataRequest().setUrgent();

        Wearable.getDataClient(context.getApplicationContext())
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

    static String sanitize(String rawJson) throws Exception {
        if (rawJson == null || rawJson.isBlank()) {
            throw new IllegalArgumentException("Snapshot vazio.");
        }

        JSONObject envelope = new JSONObject(rawJson);
        JSONObject source = envelope.optJSONObject("snapshot");
        if (source == null) source = envelope;

        int schemaVersion = source.optInt("schemaVersion", SCHEMA_VERSION);
        if (schemaVersion != SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão de snapshot não suportada: " + schemaVersion);
        }

        JSONObject output = new JSONObject();
        output.put("schemaVersion", SCHEMA_VERSION);
        copyString(source, output, "snapshotId");
        copyString(source, output, "journeyId");
        copyString(source, output, "generatedAt");
        copyString(source, output, "validUntil");
        copyLong(source, output, "generatedAtEpochMs");
        copyLong(source, output, "validUntilEpochMs");
        copyString(source, output, "phase");

        copyObject(source, output, "nextAction", "label", "value", "detail", "at");
        copyObject(source, output, "presentation", "time", "place");
        copyObject(source, output, "leave", "time", "detail");
        copyObject(source, output, "currentLeg", "flight", "route", "eta", "gate", "gateMode");
        copyObject(source, output, "connectionInfo", "duration", "nextFlight", "detail");
        copyObject(source, output, "overnightInfo", "station", "detail");
        copyObject(source, output, "alert", "id", "title", "body");

        boolean renderable = output.has("nextAction")
                || output.has("presentation")
                || output.has("currentLeg")
                || output.has("leave");
        if (!renderable) {
            throw new IllegalArgumentException("Snapshot sem informação renderizável.");
        }

        String normalized = output.toString();
        int bytes = normalized.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_PAYLOAD_BYTES) {
            throw new IllegalArgumentException("Snapshot excede " + MAX_PAYLOAD_BYTES + " bytes.");
        }
        return normalized;
    }

    private static void copyObject(JSONObject source, JSONObject target, String name, String... allowedKeys) throws Exception {
        JSONObject input = source.optJSONObject(name);
        if (input == null) return;
        JSONObject output = new JSONObject();
        for (String key : allowedKeys) {
            String value = input.optString(key, "").trim();
            if (!value.isEmpty() && !"null".equalsIgnoreCase(value)) output.put(key, value);
        }
        if (output.length() > 0) target.put(name, output);
    }

    private static void copyString(JSONObject source, JSONObject target, String key) throws Exception {
        String value = source.optString(key, "").trim();
        if (!value.isEmpty() && !"null".equalsIgnoreCase(value)) target.put(key, value);
    }

    private static void copyLong(JSONObject source, JSONObject target, String key) throws Exception {
        long value = source.optLong(key, 0L);
        if (value > 0L) target.put(key, value);
    }

    private static String safeMessage(Throwable error) {
        if (error == null || error.getMessage() == null || error.getMessage().isBlank()) {
            return "Falha ao sincronizar o CrewCheck Watch.";
        }
        String value = error.getMessage().trim();
        return value.length() <= 180 ? value : value.substring(0, 180);
    }
}
