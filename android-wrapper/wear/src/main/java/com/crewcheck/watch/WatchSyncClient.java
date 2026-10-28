package com.crewcheck.watch;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Requests the current phone projection and only reports success after a fresh DataItem
 * actually arrives from the paired CrewCheck phone app.
 */
public final class WatchSyncClient {
    private static final long FIRST_POLL_DELAY_MS = 350L;
    private static final long POLL_INTERVAL_MS = 700L;
    private static final int MAX_POLL_ATTEMPTS = 10;

    public interface Callback {
        void onFinished(boolean receivedSnapshot, String status);
    }

    private WatchSyncClient() {
    }

    public static void refresh(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        AtomicBoolean recovered = new AtomicBoolean(false);
        AtomicLong baselineSentAt = new AtomicLong(0L);

        Wearable.getDataClient(appContext).getDataItems()
                .addOnSuccessListener(buffer -> {
                    try {
                        List<Item> items = new ArrayList<>();
                        for (DataItem item : buffer) {
                            try {
                                items.add(new Item(item.getUri().getPath(), DataMapItem.fromDataItem(item).getDataMap()));
                            } catch (Exception ignored) {
                            }
                        }
                        recovered.set(importItems(appContext, items, baselineSentAt));
                    } finally {
                        buffer.release();
                    }
                    requestFromConnectedPhone(
                            appContext,
                            recovered.get(),
                            baselineSentAt.get(),
                            callback
                    );
                })
                .addOnFailureListener(error ->
                        requestFromConnectedPhone(appContext, false, 0L, callback));
    }

    /** Um item do Data Layer já lido (caminho e conteúdo). */
    static final class Item {
        final String path;
        final DataMap map;

        Item(String path, DataMap map) {
            this.path = path;
            this.map = map;
        }
    }

    /**
     * Reimportação do Sincronizar. Estado de conta primeiro, depois a credencial, por último a
     * escala; cada item passa pela regra de época, então um item antigo de outra conta (ou de
     * uma sessão anterior da mesma) nunca volta, qualquer que seja a ordem dos itens.
     * @return true se alguma escala foi aceita.
     */
    static boolean importItems(Context appContext, List<Item> items, AtomicLong baselineSentAt) {
        boolean recovered = false;
        for (Item item : items) {
            if (!WatchContract.ACCOUNT_PATH.equals(item.path)) continue;
            try {
                WatchAccountGuard.bind(appContext, item.map.getString(WatchContract.DATA_KEY_ACCOUNT),
                        item.map.getLong(WatchContract.DATA_KEY_ACCOUNT_EPOCH, 0L));
            } catch (Exception ignored) {
            }
        }
        for (Item item : items) {
            if (!WatchContract.CLOUD_PATH.equals(item.path)) continue;
            try {
                String credential = item.map.getString(WatchContract.DATA_KEY_CLOUD_CREDENTIAL);
                // O mesmo item reaparece a cada Sincronizar: só um pareamento novo conta.
                if (credential != null && !credential.equals(new WatchCloudCredentialStore(appContext).load())) {
                    WatchCloudClient.acceptCredential(appContext, credential, item.map.getLong(WatchContract.DATA_KEY_ACCOUNT_EPOCH, 0L));
                }
            } catch (Exception ignored) {
            }
        }
        for (Item item : items) {
            if (!WatchContract.SNAPSHOT_PATH.equals(item.path)) continue;
            try {
                String json = item.map.getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                long sentAt = item.map.getLong("sentAtEpochMs", 0L);
                baselineSentAt.set(Math.max(baselineSentAt.get(), sentAt));
                if (json != null && WatchAccountGuard.intake(appContext, json, false) != null) recovered = true;
            } catch (Exception ignored) {
            }
        }
        return recovered;
    }

    private static void requestFromConnectedPhone(
            Context context,
            boolean recovered,
            long baselineSentAt,
            Callback callback
    ) {
        Wearable.getNodeClient(context).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    List<Node> connected = nodes;
                    if (connected.isEmpty()) {
                        callback.onFinished(recovered, recovered
                                ? "Celular offline · dados anteriores mantidos"
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

                    Handler handler = new Handler(Looper.getMainLooper());
                    handler.postDelayed(
                            () -> pollForFreshSnapshot(
                                    context,
                                    recovered,
                                    baselineSentAt,
                                    0,
                                    callback,
                                    handler
                            ),
                            FIRST_POLL_DELAY_MS
                    );
                })
                .addOnFailureListener(error ->
                        callback.onFinished(recovered, recovered
                                ? "Não foi possível falar com o celular · dados anteriores mantidos"
                                : "Não foi possível localizar o celular"));
    }

    private static void pollForFreshSnapshot(
            Context context,
            boolean recovered,
            long baselineSentAt,
            int attempt,
            Callback callback,
            Handler handler
    ) {
        Wearable.getDataClient(context).getDataItems()
                .addOnSuccessListener(buffer -> {
                    boolean fresh = false;
                    try {
                        for (DataItem item : buffer) {
                            if (!WatchContract.SNAPSHOT_PATH.equals(item.getUri().getPath())) continue;
                            try {
                                DataMap map = DataMapItem.fromDataItem(item).getDataMap();
                                String json = map.getString(WatchContract.DATA_KEY_SNAPSHOT_JSON);
                                long sentAt = map.getLong("sentAtEpochMs", 0L);
                                if (json != null && sentAt > baselineSentAt && WatchAccountGuard.intake(context, json, false) != null) {
                                    fresh = true;
                                    break;
                                }
                            } catch (Exception ignored) {
                            }
                        }
                    } finally {
                        buffer.release();
                    }

                    if (fresh) {
                        callback.onFinished(true, "Sincronizado agora");
                        return;
                    }
                    retryOrFinish(
                            context,
                            recovered,
                            baselineSentAt,
                            attempt,
                            callback,
                            handler
                    );
                })
                .addOnFailureListener(error ->
                        retryOrFinish(
                                context,
                                recovered,
                                baselineSentAt,
                                attempt,
                                callback,
                                handler
                        ));
    }

    private static void retryOrFinish(
            Context context,
            boolean recovered,
            long baselineSentAt,
            int attempt,
            Callback callback,
            Handler handler
    ) {
        if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
            callback.onFinished(recovered, recovered
                    ? "Celular não respondeu · usando última atualização"
                    : "CrewCheck do celular não respondeu");
            return;
        }

        handler.postDelayed(
                () -> pollForFreshSnapshot(
                        context,
                        recovered,
                        baselineSentAt,
                        attempt + 1,
                        callback,
                        handler
                ),
                POLL_INTERVAL_MS
        );
    }
}
