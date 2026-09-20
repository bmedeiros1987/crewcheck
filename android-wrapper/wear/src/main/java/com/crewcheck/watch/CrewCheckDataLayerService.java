package com.crewcheck.watch;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.charset.StandardCharsets;

/** Background receiver for the compact canonical watch projection. */
public final class CrewCheckDataLayerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        SecureSnapshotStore store = new SecureSnapshotStore(this);
        for (DataEvent event : dataEvents) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            if (!WatchContract.SNAPSHOT_PATH.equals(event.getDataItem().getUri().getPath())) continue;

            try {
                DataMap dataMap = DataMapItem.fromDataItem(event.getDataItem()).getDataMap();
                String json = dataMap.getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                if (json != null) store.save(json);
            } catch (Exception ignored) {
                // Fail closed: keep the last valid snapshot.
            }
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!WatchContract.SNAPSHOT_PATH.equals(messageEvent.getPath())) return;
        byte[] data = messageEvent.getData();
        if (data == null || data.length == 0 || data.length > WatchContract.MAX_SNAPSHOT_BYTES) return;

        try {
            new SecureSnapshotStore(this).save(new String(data, StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            // Fail closed: do not replace a valid cache with malformed data.
        }
    }
}
