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
        for (DataEvent event : dataEvents) processDataEvent(event);
    }

    void processDataEvent(DataEvent event) {
            String path = event.getDataItem().getUri().getPath();
            if (path == null) return;

            // Revogação: o celular apaga o item e o relógio precisa esquecer o dado de saúde
            // que já tinha em cache. A escala não é apagada por esse caminho.
            if (event.getType() == DataEvent.TYPE_DELETED) {
                if (WatchContract.CREWLIFE_V2_PATH.equals(path)) {
                    new WellbeingStore(this).clearCrewLife();
                } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                    new WellbeingStore(this).rejectLegacyCrewLife();
                } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                    new WellbeingStore(this).clearRoutine();
                }
                return;
            }
            if (event.getType() != DataEvent.TYPE_CHANGED) return;

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
                    new WellbeingStore(this).rejectLegacyCrewLife();
                } else if (WatchContract.CREWLIFE_V2_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_CREWLIFE_JSON);
                    new WellbeingStore(this).applyCrewLifeData(json, event.getDataItem().getUri().getHost(), System.currentTimeMillis());
                } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                    String json = dataMap.getString(WatchContract.DATA_KEY_ROUTINE_JSON);
                    if (json != null) new WellbeingStore(this).saveRoutine(json);
                }
            } catch (Exception ignored) {
                if (WatchContract.CREWLIFE_V2_PATH.equals(path)) new WellbeingStore(this).clearCrewLife();
                // Other domains keep their independent last valid snapshot.
            }

    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        byte[] data = messageEvent.getData();
        if (path == null) return;
        if (data == null) data = new byte[0];
        if (data.length == 0 && !WatchContract.CREWLIFE_V2_PATH.equals(path)
                && !WatchContract.CREWLIFE_CONTROL_PATH.equals(path)) return;

        try {
            if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_SNAPSHOT_BYTES) return;
                WatchContextSnapshot snapshot = new SecureSnapshotStore(this)
                        .save(new String(data, StandardCharsets.UTF_8));
                WatchNotificationCenter.postForSnapshot(this, snapshot);
            } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES) return;
                new WellbeingStore(this).rejectLegacyCrewLife();
            } else if (WatchContract.CREWLIFE_V2_PATH.equals(path)) {
                new WellbeingStore(this).applyCrewLifeData(new String(data, StandardCharsets.UTF_8),
                        messageEvent.getSourceNodeId(), System.currentTimeMillis());
            } else if (WatchContract.CREWLIFE_CONTROL_PATH.equals(path)) {
                String ack = new WellbeingStore(this).applyCrewLifeControl(new String(data, StandardCharsets.UTF_8),
                        messageEvent.getSourceNodeId());
                if (ack != null) sendCrewLifeAck(messageEvent.getSourceNodeId(), ack);
            } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES) return;
                new WellbeingStore(this).saveRoutine(new String(data, StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            // Fail closed: do not replace a valid cache with malformed data.
        }
    }
    private void sendCrewLifeAck(String node, String ack) {
        com.google.android.gms.wearable.Wearable.getMessageClient(this)
                .sendMessage(node, WatchContract.CREWLIFE_ACK_PATH, ack.getBytes(StandardCharsets.UTF_8));
    }
}
