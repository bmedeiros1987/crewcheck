package com.crewcheck.watch.sync;

import com.crewcheck.watch.data.SnapshotRepository;
import com.crewcheck.watch.model.WatchContextSnapshot;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.charset.StandardCharsets;

/** Receives the canonical watch projection from the paired CrewCheck phone app. */
public final class CrewCheckDataLayerService extends WearableListenerService {
    public static final String SNAPSHOT_PATH = "/crewcheck/watch-context/v1";
    public static final String KEY_SNAPSHOT_JSON = "snapshotJson";

    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        try {
            for (DataEvent event : dataEvents) {
                if (event.getType() != DataEvent.TYPE_CHANGED) continue;
                if (!SNAPSHOT_PATH.equals(event.getDataItem().getUri().getPath())) continue;

                DataMap dataMap = DataMapItem.fromDataItem(event.getDataItem()).getDataMap();
                String json = dataMap.getString(KEY_SNAPSHOT_JSON, "");
                if (json.isBlank()) {
                    byte[] payload = dataMap.getByteArray("snapshot");
                    if (payload != null) json = new String(payload, StandardCharsets.UTF_8);
                }
                accept(json, "phone-data-item");
            }
        } finally {
            dataEvents.release();
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!SNAPSHOT_PATH.equals(messageEvent.getPath())) return;
        accept(new String(messageEvent.getData(), StandardCharsets.UTF_8), "phone-message");
    }

    private void accept(String raw, String source) {
        if (raw == null || raw.isBlank()) return;
        try {
            WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(raw);
            SnapshotRepository repository = new SnapshotRepository(this);
            try {
                repository.accept(snapshot, source);
            } finally {
                repository.shutdown();
            }
        } catch (Exception ignored) {
            // Invalid or future schemas are ignored; last known good state remains available.
        }
    }
}
