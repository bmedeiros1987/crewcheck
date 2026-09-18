package com.crewcheck.watch.data;

import android.content.Context;

import com.crewcheck.watch.BuildConfig;
import com.crewcheck.watch.model.WatchContextSnapshot;
import com.crewcheck.watch.notification.WatchNotificationHelper;
import com.crewcheck.watch.surface.WatchSurfaceUpdater;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class SnapshotRepository {
    public interface Callback {
        void onSuccess(WatchStateStore.SavedState state);
        void onError(Throwable error, WatchStateStore.SavedState cachedState);
    }

    private final Context context;
    private final WatchStateStore store;
    private final ExecutorService executor;

    public SnapshotRepository(Context context) {
        this.context = context.getApplicationContext();
        this.store = new WatchStateStore(this.context);
        this.executor = Executors.newSingleThreadExecutor();
    }

    public WatchStateStore.SavedState current() {
        return store.load();
    }

    public boolean hasRemoteEndpoint() {
        return BuildConfig.CREWCHECK_WATCH_ENDPOINT != null
                && !BuildConfig.CREWCHECK_WATCH_ENDPOINT.isBlank();
    }

    public void refresh(Callback callback) {
        if (!hasRemoteEndpoint()) {
            callback.onSuccess(store.load());
            return;
        }
        executor.execute(() -> {
            try {
                WatchContextSnapshot snapshot = loadRemote();
                accept(snapshot, "https");
                callback.onSuccess(store.load());
            } catch (Throwable error) {
                callback.onError(error, store.load());
            }
        });
    }

    public void accept(WatchContextSnapshot snapshot, String source) {
        WatchContextSnapshot previous = store.save(snapshot, source);
        WatchSurfaceUpdater.requestAll(context);
        if (snapshot.shouldAlertComparedWith(previous)) {
            WatchNotificationHelper.showOperationalAlert(context, snapshot);
        }
    }

    public void shutdown() {
        executor.shutdownNow();
    }

    private WatchContextSnapshot loadRemote() throws Exception {
        URL url = new URL(BuildConfig.CREWCHECK_WATCH_ENDPOINT);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new SecurityException("CrewCheck watch endpoint must use HTTPS");
        }

        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(7_000);
        connection.setReadTimeout(7_000);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-CrewCheck-Watch-Schema", "1");
        connection.setRequestProperty("Cache-Control", "no-store");
        if (BuildConfig.CREWCHECK_WATCH_TOKEN != null
                && !BuildConfig.CREWCHECK_WATCH_TOKEN.isBlank()) {
            connection.setRequestProperty(
                    "Authorization",
                    "Bearer " + BuildConfig.CREWCHECK_WATCH_TOKEN
            );
        }

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("CrewCheck endpoint returned HTTP " + status);
            }
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return WatchContextSnapshot.fromJson(body.toString());
        } finally {
            connection.disconnect();
        }
    }
}
