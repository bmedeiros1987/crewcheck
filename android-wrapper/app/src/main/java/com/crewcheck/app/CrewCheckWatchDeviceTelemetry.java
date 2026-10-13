package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Phone-owned, privacy-minimal telemetry used by the native Device Hub.
 *
 * No roster body, health record, credentials or personal identifiers are persisted here.
 * The payload is limited to device/app state and freshness timestamps. Protocol v1 remains
 * compatible with an older peer that omits requestId: that response may refresh cached status,
 * but can never complete the current correlated round-trip test.
 */
public final class CrewCheckWatchDeviceTelemetry {
    public static final String STATUS_REQUEST_PATH = "/crewcheck/watch/device-status/request/v1";
    public static final String STATUS_RESPONSE_PATH = "/crewcheck/watch/device-status/response/v1";
    public static final String ACTION_DEVICE_STATUS_UPDATED = "com.crewcheck.app.WATCH_DEVICE_STATUS_UPDATED";

    private static final String PREFS = "crewcheck_watch_device_hub";
    private static final String KEY_STATUS = "last_status_json";
    private static final String KEY_PENDING_REQUEST_ID = "pending_request_id";
    private static final String KEY_PENDING_REQUEST_AT = "pending_request_at";
    private static final int MAX_STATUS_BYTES = 4 * 1024;
    private static final long REQUEST_WINDOW_MS = 5_000L;

    public interface Callback {
        void onResult(boolean ok, int connectedCount, String message);
    }

    public static final class Status {
        public final String nodeId;
        public final String nodeName;
        public final String manufacturer;
        public final String model;
        public final String appVersionName;
        public final long appVersionCode;
        public final int batteryPercent;
        public final boolean round;
        public final int screenWidthDp;
        public final int screenHeightDp;
        public final long snapshotGeneratedAtEpochMs;
        public final long snapshotValidUntilEpochMs;
        public final long updatedAtEpochMs;
        public final boolean verifiedRoundTrip;
        public final long roundTripMs;

        private Status(JSONObject json) {
            nodeId = clean(json.optString("nodeId", ""), 120);
            nodeName = clean(json.optString("nodeName", ""), 80);
            manufacturer = clean(json.optString("manufacturer", ""), 48);
            model = clean(json.optString("model", ""), 80);
            appVersionName = clean(json.optString("appVersionName", ""), 32);
            appVersionCode = Math.max(0L, json.optLong("appVersionCode", 0L));
            int rawBattery = json.optInt("batteryPercent", -1);
            batteryPercent = rawBattery >= 0 && rawBattery <= 100 ? rawBattery : -1;
            round = json.optBoolean("round", false);
            screenWidthDp = clamp(json.optInt("screenWidthDp", 0), 0, 1000);
            screenHeightDp = clamp(json.optInt("screenHeightDp", 0), 0, 1000);
            snapshotGeneratedAtEpochMs = Math.max(0L, json.optLong("snapshotGeneratedAtEpochMs", 0L));
            snapshotValidUntilEpochMs = Math.max(0L, json.optLong("snapshotValidUntilEpochMs", 0L));
            updatedAtEpochMs = Math.max(0L, json.optLong("updatedAtEpochMs", 0L));
            verifiedRoundTrip = json.optBoolean("verifiedRoundTrip", false);
            roundTripMs = clampLong(json.optLong("roundTripMs", -1L), -1L, REQUEST_WINDOW_MS);
        }

        public boolean hasSnapshot() {
            return snapshotGeneratedAtEpochMs > 0L;
        }

        public boolean snapshotIsStale(long now) {
            return !hasSnapshot() || snapshotValidUntilEpochMs <= 0L || now > snapshotValidUntilEpochMs;
        }
    }

    private CrewCheckWatchDeviceTelemetry() {}

    public static void requestStatus(Context context, Callback callback) {
        final Context app = context.getApplicationContext();
        final Callback safe = callback == null ? (ok, count, message) -> {} : callback;
        final String requestId = UUID.randomUUID().toString().replace("-", "");
        final long requestedAt = System.currentTimeMillis();

        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PENDING_REQUEST_ID, requestId)
                .putLong(KEY_PENDING_REQUEST_AT, requestedAt)
                .apply();

        Wearable.getNodeClient(app).getConnectedNodes()
                .addOnSuccessListener(nodes -> sendRequests(app, nodes, requestId, safe))
                .addOnFailureListener(error -> safe.onResult(
                        false,
                        0,
                        error == null || error.getMessage() == null
                                ? "Não foi possível consultar o relógio."
                                : clean(error.getMessage(), 160)
                ));
    }

    private static void sendRequests(Context app, List<Node> nodes, String requestId, Callback callback) {
        if (nodes == null || nodes.isEmpty()) {
            clearPendingRequest(app);
            callback.onResult(false, 0, "Nenhum relógio Wear OS conectado ao telefone.");
            return;
        }

        AtomicInteger remaining = new AtomicInteger(nodes.size());
        AtomicBoolean sentAny = new AtomicBoolean(false);
        byte[] ping = requestId.getBytes(StandardCharsets.UTF_8);

        for (Node node : nodes) {
            Wearable.getMessageClient(app)
                    .sendMessage(node.getId(), STATUS_REQUEST_PATH, ping)
                    .addOnSuccessListener(result -> {
                        sentAny.set(true);
                        finishRequest(app, callback, nodes.size(), remaining, sentAny);
                    })
                    .addOnFailureListener(error ->
                            finishRequest(app, callback, nodes.size(), remaining, sentAny));
        }
    }

    private static void finishRequest(
            Context app,
            Callback callback,
            int connectedCount,
            AtomicInteger remaining,
            AtomicBoolean sentAny
    ) {
        if (remaining.decrementAndGet() != 0) return;
        if (sentAny.get()) {
            callback.onResult(true, connectedCount, "Consulta enviada ao CrewWatch.");
        } else {
            clearPendingRequest(app);
            callback.onResult(false, connectedCount, "O telefone viu o relógio, mas o CrewWatch não respondeu ao canal de dados.");
        }
    }

    public static void saveStatus(Context context, String sourceNodeId, byte[] raw) {
        if (raw == null || raw.length == 0 || raw.length > MAX_STATUS_BYTES) return;
        try {
            Context app = context.getApplicationContext();
            JSONObject source = new JSONObject(new String(raw, StandardCharsets.UTF_8));
            if (source.optInt("schemaVersion", 0) != 1) return;

            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String pendingRequestId = prefs.getString(KEY_PENDING_REQUEST_ID, "");
            if (pendingRequestId == null) pendingRequestId = "";
            long requestedAt = Math.max(0L, prefs.getLong(KEY_PENDING_REQUEST_AT, 0L));
            long now = System.currentTimeMillis();
            String responseRequestId = exactRequestId(source);

            boolean legacyResponse = responseRequestId.isEmpty();
            long requestAgeMs = requestedAt > 0L ? now - requestedAt : -1L;
            boolean hasActivePendingRequest = !pendingRequestId.isEmpty()
                    && requestAgeMs >= 0L
                    && requestAgeMs <= REQUEST_WINDOW_MS;
            boolean verifiedRoundTrip = hasActivePendingRequest
                    && responseRequestId.equals(pendingRequestId);

            // requestId is opaque. It is validated for bounds/control characters, then compared
            // byte-for-byte-equivalent as a Java String: no trim, whitespace collapse or rewrite.
            // A malformed/oversized requestId degrades to legacy/unverified and can never verify.
            if (!legacyResponse && !verifiedRoundTrip) return;

            JSONObject clean = new JSONObject();
            clean.put("schemaVersion", 1);
            clean.put("nodeId", clean(sourceNodeId, 120));
            copyString(source, clean, "nodeName", 80);
            copyString(source, clean, "manufacturer", 48);
            copyString(source, clean, "model", 80);
            copyString(source, clean, "appVersionName", 32);
            clean.put("appVersionCode", Math.max(0L, source.optLong("appVersionCode", 0L)));

            int battery = source.optInt("batteryPercent", -1);
            clean.put("batteryPercent", battery >= 0 && battery <= 100 ? battery : -1);
            clean.put("round", source.optBoolean("round", false));
            clean.put("screenWidthDp", clamp(source.optInt("screenWidthDp", 0), 0, 1000));
            clean.put("screenHeightDp", clamp(source.optInt("screenHeightDp", 0), 0, 1000));
            clean.put("snapshotGeneratedAtEpochMs", Math.max(0L, source.optLong("snapshotGeneratedAtEpochMs", 0L)));
            clean.put("snapshotValidUntilEpochMs", Math.max(0L, source.optLong("snapshotValidUntilEpochMs", 0L)));
            clean.put("updatedAtEpochMs", now);
            clean.put("verifiedRoundTrip", verifiedRoundTrip);
            clean.put("roundTripMs", verifiedRoundTrip ? Math.max(0L, requestAgeMs) : -1L);

            SharedPreferences.Editor editor = prefs.edit().putString(KEY_STATUS, clean.toString());
            if (verifiedRoundTrip || !hasActivePendingRequest) {
                editor.remove(KEY_PENDING_REQUEST_ID).remove(KEY_PENDING_REQUEST_AT);
            }
            // A legacy watch may answer first when more than one Wear node is paired. Keep the
            // active nonce so the current CrewWatch can still complete the verified round trip.
            editor.apply();

            android.content.Intent updated = new android.content.Intent(ACTION_DEVICE_STATUS_UPDATED)
                    .setPackage(context.getPackageName());
            context.sendBroadcast(updated);
        } catch (Exception ignored) {
            // Malformed telemetry must never replace the last known-good status.
        }
    }

    public static Status loadStatus(Context context) {
        try {
            SharedPreferences prefs = context.getApplicationContext()
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_STATUS, "");
            if (raw == null || raw.isBlank()) return null;
            JSONObject json = new JSONObject(raw);
            if (json.optInt("schemaVersion", 0) != 1) return null;
            return new Status(json);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String exactRequestId(JSONObject source) {
        try {
            if (source == null || !source.has("requestId") || source.isNull("requestId")) return "";
            Object raw = source.opt("requestId");
            if (!(raw instanceof String)) return "";
            String value = (String) raw;
            if (value.isEmpty()) return "";
            if (value.codePointCount(0, value.length()) > 64) return "";
            if (value.getBytes(StandardCharsets.UTF_8).length > 256) return "";
            for (int offset = 0; offset < value.length();) {
                int codePoint = value.codePointAt(offset);
                if (Character.isISOControl(codePoint)) return "";
                offset += Character.charCount(codePoint);
            }
            return value;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static void clearPendingRequest(Context context) {
        context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_PENDING_REQUEST_ID)
                .remove(KEY_PENDING_REQUEST_AT)
                .apply();
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

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static long clampLong(long value, long min, long max) {
        return Math.max(min, Math.min(max, value));
    }
}