package com.crewcheck.watch;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.charset.StandardCharsets;

/**
 * Background receiver for the compact canonical watch projection.
 *
 * The roster channel is always available, including Free. Premium-only channels are isolated
 * and are cleared on downgrade or entitlement expiry so stale CrewLife/Concierge data never
 * survives a commercial-state change. The watch remains a renderer: it never parses PDF or
 * recalculates operational rules.
 */
public final class CrewCheckDataLayerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        for (DataEvent event : dataEvents) {
            String path = event.getDataItem().getUri().getPath();
            if (path == null) continue;

            if (event.getType() == DataEvent.TYPE_DELETED) {
                if (WatchContract.CREWLIFE_PATH.equals(path)) {
                    new WellbeingStore(this).clearCrewLife();
                } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                    new WellbeingStore(this).clearRoutine();
                } else if (WatchContract.CONCIERGE_RESPONSE_PATH.equals(path)) {
                    new WatchConciergeStore(this).clear();
                }
                continue;
            }
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;

            try {
                DataMap dataMap = DataMapItem.fromDataItem(event.getDataItem()).getDataMap();
                if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                    if (json != null) applyContextSnapshot(json);
                } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_CREWLIFE_JSON);
                    if (json != null && WatchEntitlements.crewLife(this)) {
                        new WellbeingStore(this).saveCrewLife(json);
                    }
                } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_ROUTINE_JSON);
                    if (json != null && WatchEntitlements.crewLife(this)) {
                        new WellbeingStore(this).saveRoutine(json);
                    }
                } else if (WatchContract.CONCIERGE_RESPONSE_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_CONCIERGE_RESPONSE_JSON);
                    if (json != null && WatchEntitlements.concierge(this)) {
                        saveConciergeResponse(json);
                    }
                }
            } catch (Exception ignored) {
                // Fail closed: keep the last valid snapshot.
            }
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        if (path == null) return;

        if (WatchDeviceTelemetry.STATUS_REQUEST_PATH.equals(path)) {
            WatchDeviceTelemetry.reply(this, messageEvent.getSourceNodeId(), messageEvent.getData());
            return;
        }

        byte[] data = messageEvent.getData();
        if (data == null || data.length == 0) return;

        try {
            if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_SNAPSHOT_BYTES) return;
                applyContextSnapshot(new String(data, StandardCharsets.UTF_8));
            } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES || !WatchEntitlements.crewLife(this)) return;
                new WellbeingStore(this).saveCrewLife(new String(data, StandardCharsets.UTF_8));
            } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES || !WatchEntitlements.crewLife(this)) return;
                new WellbeingStore(this).saveRoutine(new String(data, StandardCharsets.UTF_8));
            } else if (WatchContract.CONCIERGE_RESPONSE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_CONCIERGE_BYTES || !WatchEntitlements.concierge(this)) return;
                saveConciergeResponse(new String(data, StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            // Fail closed: do not replace a valid cache with malformed data.
        }
    }

    private void applyContextSnapshot(String json) {
        WatchContextSnapshot snapshot = new SecureSnapshotStore(this).save(json);
        if (!WatchEntitlements.premiumFromSnapshot(snapshot, System.currentTimeMillis())) {
            WellbeingStore wellbeing = new WellbeingStore(this);
            wellbeing.clearCrewLife();
            wellbeing.clearRoutine();
            new WatchConciergeStore(this).clear();
        }
        WatchNotificationCenter.postForSnapshot(this, snapshot);
        sendBroadcast(new android.content.Intent(MainActivity.ACTION_SNAPSHOT_UPDATED)
                .setPackage(getPackageName()));
    }

    private void saveConciergeResponse(String json) {
        WatchConciergeStore.Snapshot response = new WatchConciergeStore(this).save(json);
        WatchNotificationCenter.postConciergeResponse(this, response);
        sendBroadcast(new android.content.Intent(MainActivity.ACTION_SNAPSHOT_UPDATED)
                .setPackage(getPackageName()));
    }
}
