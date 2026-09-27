package com.crewcheck.watch;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Best-effort background sync trigger owned by the Wear side.
 *
 * Complication hosts wake providers even when the CrewWatch Activity is not open. Reusing
 * that wakeup lets the watch ask the phone for its latest cached canonical projection
 * without running a foreground service or an always-on timer.
 *
 * This class never computes roster/CrewLife data. It only sends the existing v1 sync request.
 */
final class WatchBackgroundSyncRequester {
    static final long SUCCESS_INTERVAL_MS = 5 * 60_000L;
    static final long RETRY_INTERVAL_MS = 60_000L;

    private static final String PREFS = "crewcheck_watch_background_sync";
    private static final String KEY_LAST_ATTEMPT = "lastAttemptEpochMs";
    private static final String KEY_LAST_SUCCESS = "lastSuccessEpochMs";
    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);

    private WatchBackgroundSyncRequester() {
    }

    static boolean shouldRequest(long now, long lastAttempt, long lastSuccess) {
        if (now <= 0L) return false;
        // Clock rollback must not lock the device out for minutes/hours.
        if (lastAttempt > now || lastSuccess > now) return true;
        if (lastSuccess > 0L && now - lastSuccess < SUCCESS_INTERVAL_MS) return false;
        return lastAttempt <= 0L || now - lastAttempt >= RETRY_INTERVAL_MS;
    }

    static void requestIfDue(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long lastAttempt = prefs.getLong(KEY_LAST_ATTEMPT, 0L);
        long lastSuccess = prefs.getLong(KEY_LAST_SUCCESS, 0L);
        if (!shouldRequest(now, lastAttempt, lastSuccess)) return;
        if (!IN_FLIGHT.compareAndSet(false, true)) return;

        prefs.edit().putLong(KEY_LAST_ATTEMPT, now).apply();

        Wearable.getNodeClient(app).getConnectedNodes()
                .addOnSuccessListener(nodes -> sendToConnectedPhone(app, prefs, nodes))
                .addOnFailureListener(error -> IN_FLIGHT.set(false));
    }

    private static void sendToConnectedPhone(
            Context app,
            SharedPreferences prefs,
            List<Node> nodes
    ) {
        if (nodes == null || nodes.isEmpty()) {
            IN_FLIGHT.set(false);
            return;
        }

        AtomicInteger remaining = new AtomicInteger(nodes.size());
        AtomicBoolean delivered = new AtomicBoolean(false);

        for (Node node : nodes) {
            Wearable.getMessageClient(app)
                    .sendMessage(node.getId(), WatchContract.REQUEST_SYNC_PATH, new byte[0])
                    .addOnSuccessListener(requestId -> delivered.set(true))
                    .addOnCompleteListener(task -> {
                        if (remaining.decrementAndGet() != 0) return;
                        if (delivered.get()) {
                            prefs.edit()
                                    .putLong(KEY_LAST_SUCCESS, System.currentTimeMillis())
                                    .apply();
                        }
                        IN_FLIGHT.set(false);
                    });
        }
    }
}
