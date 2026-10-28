package com.crewcheck.watch;

import android.content.Context;

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
 *   /crewcheck/watch/cloud/v1     -> credencial da nuvem (WatchCloudCredentialStore)
 *   /crewcheck/watch/account/v1   -> conta e época vigentes no celular (WatchAccountGuard)
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
            if (event.getType() == DataEvent.TYPE_DELETED) {
                itemDeleted(this, path);
            } else if (event.getType() == DataEvent.TYPE_CHANGED) {
                try {
                    itemChanged(this, path, DataMapItem.fromDataItem(event.getDataItem()).getDataMap());
                } catch (Exception ignored) {
                    // Fail closed: keep the last valid snapshot.
                }
            }
        }
    }

    /** Revogação: o celular apaga o item e o relógio esquece o dado que já tinha em cache. */
    static void itemDeleted(Context context, String path) {
        if (WatchContract.CREWLIFE_PATH.equals(path)) {
            new WellbeingStore(context).clearCrewLife();
        } else if (WatchContract.ROUTINE_PATH.equals(path)) {
            new WellbeingStore(context).clearRoutine();
        }
        // A exclusão da credencial não carrega conta nem época e pode chegar atrasada, depois
        // do pareamento de outra conta: o pareamento termina pela transição de época
        // (logout/troca) ou por um 401 do servidor, nunca por ela.

    }

    static void itemChanged(Context context, String path, DataMap dataMap) {
        try {
            if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                String json = dataMap.getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                if (json != null) WatchAccountGuard.intake(context, json);
            } else if (WatchContract.ACCOUNT_PATH.equals(path)) {
                WatchAccountGuard.bind(context, dataMap.getString(WatchContract.DATA_KEY_ACCOUNT),
                        dataMap.getLong(WatchContract.DATA_KEY_ACCOUNT_EPOCH, 0L));
            } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                String json = dataMap.getString(WatchContract.DATA_KEY_CREWLIFE_JSON);
                if (json != null) new WellbeingStore(context).saveCrewLife(json);
            } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                String json = dataMap.getString(WatchContract.DATA_KEY_ROUTINE_JSON);
                if (json != null) new WellbeingStore(context).saveRoutine(json);
            } else if (WatchContract.CLOUD_PATH.equals(path)) {
                WatchCloudClient.acceptCredential(context, dataMap.getString(WatchContract.DATA_KEY_CLOUD_CREDENTIAL),
                        dataMap.getLong(WatchContract.DATA_KEY_ACCOUNT_EPOCH, 0L));
            }
        } catch (Exception ignored) {
            // Fail closed: keep the last valid snapshot.
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        message(this, messageEvent.getPath(), messageEvent.getData());
    }

    static void message(Context context, String path, byte[] data) {
        if (path == null || data == null || data.length == 0) return;
        try {
            if (WatchContract.SNAPSHOT_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_SNAPSHOT_BYTES) return;
                WatchAccountGuard.intake(context, new String(data, StandardCharsets.UTF_8));
            } else if (WatchContract.CREWLIFE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES) return;
                new WellbeingStore(context).saveCrewLife(new String(data, StandardCharsets.UTF_8));
            } else if (WatchContract.ROUTINE_PATH.equals(path)) {
                if (data.length > WatchContract.MAX_WELLBEING_BYTES) return;
                new WellbeingStore(context).saveRoutine(new String(data, StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            // Fail closed: do not replace a valid cache with malformed data.
        }
    }
}
