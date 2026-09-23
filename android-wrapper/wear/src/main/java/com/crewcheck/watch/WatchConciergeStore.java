package com.crewcheck.watch;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/** Local cache for the latest Concierge reply returned by the paired phone. */
final class WatchConciergeStore {
    private static final String PREFS = "crewcheck_watch_concierge";
    private static final String KEY_RESPONSE = "response_json";
    private static final int MAX_BYTES = 4 * 1024;

    private final SharedPreferences prefs;

    WatchConciergeStore(Context context) {
        prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    Snapshot save(String raw) {
        Snapshot snapshot = Snapshot.fromJson(raw);
        prefs.edit().putString(KEY_RESPONSE, snapshot.toJson().toString()).apply();
        return snapshot;
    }

    Snapshot load() {
        String raw = prefs.getString(KEY_RESPONSE, "");
        if (raw == null || raw.isBlank()) return null;
        try {
            return Snapshot.fromJson(raw);
        } catch (Exception error) {
            clear();
            return null;
        }
    }

    void clear() {
        prefs.edit().remove(KEY_RESPONSE).apply();
    }

    static final class Snapshot {
        final int schemaVersion;
        final String requestId;
        final boolean ok;
        final String reply;
        final String status;
        final long updatedAtEpochMs;

        private Snapshot(
                int schemaVersion,
                String requestId,
                boolean ok,
                String reply,
                String status,
                long updatedAtEpochMs
        ) {
            this.schemaVersion = schemaVersion;
            this.requestId = requestId;
            this.ok = ok;
            this.reply = reply;
            this.status = status;
            this.updatedAtEpochMs = updatedAtEpochMs;
        }

        static Snapshot fromJson(String raw) {
            if (raw == null || raw.isBlank()) {
                throw new IllegalArgumentException("Resposta Concierge vazia.");
            }
            if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
                throw new IllegalArgumentException("Resposta Concierge excede 4 KiB.");
            }
            try {
                JSONObject json = new JSONObject(raw);
                int schema = json.optInt("schemaVersion", 0);
                if (schema != WatchContract.CONCIERGE_SCHEMA_VERSION) {
                    throw new IllegalArgumentException("Versão Concierge incompatível.");
                }
                String requestId = clean(json.optString("requestId", ""), 80);
                if (requestId.isBlank()) throw new IllegalArgumentException("requestId obrigatório.");
                long updatedAt = json.optLong("updatedAtEpochMs", 0L);
                if (updatedAt <= 0L) throw new IllegalArgumentException("updatedAtEpochMs obrigatório.");
                return new Snapshot(
                        schema,
                        requestId,
                        json.optBoolean("ok", false),
                        clean(json.optString("reply", ""), 520),
                        clean(json.optString("status", ""), 80),
                        updatedAt
                );
            } catch (Exception error) {
                throw new IllegalArgumentException("Resposta Concierge inválida.", error);
            }
        }

        JSONObject toJson() {
            try {
                return new JSONObject()
                        .put("schemaVersion", schemaVersion)
                        .put("requestId", requestId)
                        .put("ok", ok)
                        .put("reply", reply)
                        .put("status", status)
                        .put("updatedAtEpochMs", updatedAtEpochMs);
            } catch (Exception error) {
                throw new IllegalStateException(error);
            }
        }

        boolean isFresh(long nowEpochMs) {
            return updatedAtEpochMs > 0L && nowEpochMs - updatedAtEpochMs <= 6 * 60 * 60 * 1000L;
        }

        private static String clean(String value, int max) {
            if (value == null) return "";
            String normalized = value.replaceAll("[\\p{Cntrl}]", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
            return normalized.length() <= max ? normalized : normalized.substring(0, max).trim();
        }
    }
}
