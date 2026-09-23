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
 * Três canais independentes, cada um com o seu próprio destino de cache:
 *   /crewcheck/watch/context/v1   -> escala (SecureSnapshotStore)
 *   /crewcheck/watch/crewlife/v1  -> bem-estar agregado (WellbeingStore)
 *   /crewcheck/watch/routine/v1   -> sugestão de rotina (WellbeingStore)
 *
 * O canal de saúde é separado para poder ser revogado sem derrubar a escala, e um payload
 * inválido em um canal nunca invalida os outros.
 */
public final class CrewCheckDataLayerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        for (DataEvent event : dataEvents) {
            String path = event.getDataItem().getUri().getPath();
            if (path == null) continue;

            // Revogação: o celular apaga o item e o relógio precisa esquecer o dado de saúde
            // que já tinha em cache. A escala não é apagada por esse caminho.
            if (event.getType() == DataEvent.TYPE_DELETED) {
                if (WatchContract.CREWLIFE_PATH.equals(path)) {
                    new WellbeingStore(this).clearCrewLife();
                } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                    new WellbeingStore(this).clearRoutine();
                }
                continue;
            }
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;

            try {
                DataMap dataMap = DataMapItem.fromDataItem(event.getDataItem()).getDataMap();
                if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                    if (json != null) {
                        WatchContextSnapshot snapshot = new SecureSnapshotStore(this).save(json);
                        WatchNotificationCenter.postForSnapshot(this, snapshot);
                    }
                } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_CREWLIFE_JSON);
                    if (json != null) new WellbeingStore(this).saveCrewLife(json);
                } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_ROUTINE_JSON);
                    if (json != null) new WellbeingStore(this).saveRoutine(json);
                }
            } catch (Exception ignored) {
                // Fail closed: keep the last valid snapshot.
            }
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        byte[] data = messageEvent.getData();
        if (path == null || data == null || data.length == 0) return;

        try {
            if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_SNAPSHOT_BYTES) return;
                WatchContextSnapshot snapshot = new SecureSnapshotStore(this)
                        .save(new String(data, StandardCharsets.UTF_8));
                WatchNotificationCenter.postForSnapshot(this, snapshot);
            } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES) return;
                new WellbeingStore(this).saveCrewLife(new String(data, StandardCharsets.UTF_8));
            } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES) return;
                new WellbeingStore(this).saveRoutine(new String(data, StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            // Fail closed: do not replace a valid cache with malformed data.
        }
    }
}
