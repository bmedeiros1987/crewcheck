package com.crewcheck.watch;

import android.content.Context;

import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** Requests the current phone projection and recovers any persistent DataItem already available. */
public final class WatchSyncClient {
    public interface Callback {
        void onFinished(boolean receivedSnapshot, String status);
    }

    private WatchSyncClient() {
    }

    public static void refresh(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        AtomicBoolean found = new AtomicBoolean(false);

        Wearable.getDataClient(appContext).getDataItems()
                .addOnSuccessListener(buffer -> {
                    try {
                        for (DataItem item : buffer) {
                            if (!WatchContract.SNAPSHOT_PATH.equals(item.getUri().getPath())) continue;
                            try {
                                String json = DataMapItem.fromDataItem(item)
                                        .getDataMap()
                                        .getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                                if (json != null) {
                                    new SecureSnapshotStore(appContext).save(json);
                                    found.set(true);
                                }
                            } catch (Exception ignored) {
                            }
                        }
                    } finally {
                        buffer.release();
                    }
                    requestFromConnectedPhone(appContext, found.get(), callback);
                })
                .addOnFailureListener(error ->
                        requestFromConnectedPhone(appContext, false, callback));
    }

    private static void requestFromConnectedPhone(
            Context context,
            boolean recovered,
            Callback callback
    ) {
        Wearable.getNodeClient(context).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    List<Node> connected = nodes;
                    if (connected.isEmpty()) {
                        callback.onFinished(recovered, recovered
                                ? "Snapshot recuperado"
                                : "Celular não conectado");
                        return;
                    }

                    for (Node node : connected) {
                        Wearable.getMessageClient(context).sendMessage(
                                node.getId(),
                                WatchContract.REQUEST_SYNC_PATH,
                                new byte[0]
                        );
                    }
                    callback.onFinished(recovered, recovered
                            ? "Atualizado"
                            : "Pedido enviado ao celular");
                })
                .addOnFailureListener(error ->
                        callback.onFinished(recovered, recovered
                                ? "Snapshot recuperado"
                                : "Não foi possível localizar o celular"));
    }
}
