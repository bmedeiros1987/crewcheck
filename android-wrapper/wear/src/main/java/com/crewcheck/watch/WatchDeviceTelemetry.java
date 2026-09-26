package com.crewcheck.watch;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.os.BatteryManager;
import android.os.Build;

import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Minimal, privacy-safe status response for CrewCheck Mobile's Device Hub. */
public final class WatchDeviceTelemetry {
    public static final String STATUS_REQUEST_PATH = "/crewcheck/watch/device-status/request/v1";
    public static final String STATUS_RESPONSE_PATH = "/crewcheck/watch/device-status/response/v1";
    private static final int MAX_STATUS_BYTES = 4 * 1024;
    private static final int MAX_REQUEST_ID_CHARS = 64;
    private static final int MAX_REQUEST_BYTES = MAX_REQUEST_ID_CHARS * 4;

    private WatchDeviceTelemetry() {}

    public static void reply(Context context, String targetNodeId, byte[] requestPayload) {
        if (targetNodeId == null || targetNodeId.isBlank()) return;
        try {
            Context app = context.getApplicationContext();
            JSONObject payload = new JSONObject();
            payload.put("schemaVersion", 1);

            String requestId = parseRequestId(requestPayload);
            if (!requestId.isBlank()) payload.put("requestId", requestId);

            payload.put("nodeName", "CrewWatch");
            payload.put("manufacturer", clean(Build.MANUFACTURER, 48));
            payload.put("model", clean(Build.MODEL, 80));

            PackageInfo info = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
            payload.put("appVersionName", clean(info.versionName, 32));
            payload.put("appVersionCode", info.getLongVersionCode());

            BatteryManager batteryManager = (BatteryManager) app.getSystemService(Context.BATTERY_SERVICE);
            int battery = batteryManager == null
                    ? -1
                    : batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            payload.put("batteryPercent", battery >= 0 && battery <= 100 ? battery : -1);

            Configuration config = app.getResources().getConfiguration();
            boolean round = (config.screenLayout & Configuration.SCREENLAYOUT_ROUND_MASK)
                    == Configuration.SCREENLAYOUT_ROUND_YES;
            payload.put("round", round);
            payload.put("screenWidthDp", Math.max(0, config.screenWidthDp));
            payload.put("screenHeightDp", Math.max(0, config.screenHeightDp));

            WatchContextSnapshot snapshot = new SecureSnapshotStore(app).load();
            payload.put("snapshotGeneratedAtEpochMs", snapshot == null ? 0L : snapshot.generatedAtEpochMs);
            payload.put("snapshotValidUntilEpochMs", snapshot == null ? 0L : snapshot.validUntilEpochMs);

            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes.length == 0 || bytes.length > MAX_STATUS_BYTES) return;

            Wearable.getMessageClient(app)
                    .sendMessage(targetNodeId, STATUS_RESPONSE_PATH, bytes);
        } catch (Exception ignored) {
            // Device Hub is diagnostic only. Never interfere with roster rendering.
        }
    }

    /**
     * Correlation identifiers are opaque Unicode strings. A valid nonce is strict UTF-8 and must
     * be echoed unchanged. Malformed UTF-8, controls or oversized payloads degrade to
     * legacy/unverified telemetry by omitting requestId instead of risking a false match.
     */
    static String parseRequestId(byte[] requestPayload) {
        if (requestPayload == null || requestPayload.length == 0 || requestPayload.length > MAX_REQUEST_BYTES) {
            return "";
        }

        final String value;
        try {
            value = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(requestPayload))
                    .toString();
        } catch (CharacterCodingException ignored) {
            return "";
        }
        if (value.isEmpty()) return "";

        int codePoints = 0;
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            if (Character.isISOControl(codePoint)) return "";
            codePoints++;
            if (codePoints > MAX_REQUEST_ID_CHARS) return "";
            offset += Character.charCount(codePoint);
        }
        return value;
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }
}
