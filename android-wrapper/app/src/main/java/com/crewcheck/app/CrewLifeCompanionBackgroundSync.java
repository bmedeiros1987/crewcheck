package com.crewcheck.app;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/** Reads only the Companion's existing local summary; never opens UI or the Samsung SDK. */
final class CrewLifeCompanionBackgroundSync {
    private static final int MAX_SUMMARY_BYTES = 4 * 1024;
    private static final long QUERY_TIMEOUT_MS = 2_000L;
    private static final Uri SUMMARY = Uri.parse("content://com.crewcheck.life.summary/v1/current");

    private CrewLifeCompanionBackgroundSync() {}

    /** Invoke on the WearableListenerService callback worker, not on the main thread. */
    static void republishCurrent(Context context) {
        if (Looper.myLooper() == Looper.getMainLooper()) return;
        Context app = context.getApplicationContext();
        CrewLifeBackgroundSync.run(new CrewLifeBackgroundSync.Port() {
            @Override public String authorization() {
                if (WatchHealthConsent.isRevocationPending(app)) return "";
                WatchHealthConsent grant = WatchHealthConsent.read(app);
                if (!grant.allowsAnyHealth()) return "";
                return grant.acceptedAtEpochMs() + ":" + new TreeSet<>(grant.categories());
            }
            @Override public Set<String> categories() {
                return WatchHealthConsent.read(app).categories();
            }
            @Override public long nowEpochMs() { return System.currentTimeMillis(); }
            @Override public Map<String, ?> readSummary() throws Exception {
                CancellationSignal cancel = new CancellationSignal();
                Handler handler = new Handler(Looper.getMainLooper());
                Runnable timeout = cancel::cancel;
                handler.postDelayed(timeout, QUERY_TIMEOUT_MS);
                try (Cursor cursor = app.getContentResolver().query(
                        SUMMARY, new String[]{"json"}, null, null, null, cancel)) {
                    if (cursor == null || !cursor.moveToFirst()) return Map.of();
                    int column = cursor.getColumnIndex("json");
                    if (column < 0) return Map.of();
                    String raw = cursor.getString(column);
                    if (raw == null || raw.isBlank()) return Map.of();
                    if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_SUMMARY_BYTES) {
                        throw new IllegalArgumentException("Summary too large");
                    }
                    JSONObject json = new JSONObject(raw);
                    Map<String, Object> values = new LinkedHashMap<>();
                    Iterator<String> keys = json.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        Object value = json.opt(key);
                        values.put(key, value == JSONObject.NULL ? null : value);
                    }
                    return values;
                } finally {
                    handler.removeCallbacks(timeout);
                }
            }
            @Override public void submit(Map<String, Object> summary) {
                // The established publisher rechecks the current grant, filters categories,
                // and writes the existing CrewLife path. No new cache or raw series is stored.
                // Its success is Data Layer submission, not proof of delivery to the watch.
                CrewLifeWatchPublisher.publishCrewLife(app, new JSONObject(summary).toString(), null);
            }
        });
    }
}
