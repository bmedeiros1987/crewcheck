package com.crewcheck.watch.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.crewcheck.watch.model.WatchContextSnapshot;

public final class WatchStateStore {
    private static final String PREFS = "crewcheck_watch_state_v1";
    private static final String KEY_SNAPSHOT = "snapshot_json";
    private static final String KEY_RECEIVED_AT = "received_at";
    private static final String KEY_SOURCE = "source";

    private final SharedPreferences preferences;

    public WatchStateStore(Context context) {
        preferences = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public synchronized SavedState load() {
        String raw = preferences.getString(KEY_SNAPSHOT, "");
        if (raw == null || raw.isBlank()) {
            return new SavedState(WatchContextSnapshot.demo(), 0L, "demo", true);
        }
        try {
            return new SavedState(
                    WatchContextSnapshot.fromJson(raw),
                    preferences.getLong(KEY_RECEIVED_AT, 0L),
                    preferences.getString(KEY_SOURCE, "cache"),
                    false
            );
        } catch (Exception ignored) {
            return new SavedState(WatchContextSnapshot.demo(), 0L, "demo", true);
        }
    }

    public synchronized WatchContextSnapshot save(WatchContextSnapshot snapshot, String source) {
        WatchContextSnapshot previous = load().snapshot;
        preferences.edit()
                .putString(KEY_SNAPSHOT, snapshot.toJsonString())
                .putLong(KEY_RECEIVED_AT, System.currentTimeMillis())
                .putString(KEY_SOURCE, source == null ? "unknown" : source)
                .apply();
        return previous;
    }

    public synchronized void clear() {
        preferences.edit().clear().apply();
    }

    public static final class SavedState {
        public final WatchContextSnapshot snapshot;
        public final long receivedAtEpochMs;
        public final String source;
        public final boolean demoFallback;

        SavedState(WatchContextSnapshot snapshot, long receivedAtEpochMs,
                   String source, boolean demoFallback) {
            this.snapshot = snapshot;
            this.receivedAtEpochMs = receivedAtEpochMs;
            this.source = source == null ? "" : source;
            this.demoFallback = demoFallback;
        }
    }
}
