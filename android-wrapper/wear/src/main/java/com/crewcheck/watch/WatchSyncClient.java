package com.crewcheck.watch;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataItemBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.util.ArrayList;
import java.util.List;

/**
 * Pede a projeção atual ao celular e só reporta sucesso quando um DataItem novo de fato chega.
 *
 * Escala, CrewLife e rotina são lidos e restaurados cada um no seu caminho, validados pelo
 * parser do canal. Um pedido feito da tela CrewLife espera por um resumo CrewLife novo; a
 * escala chegar primeiro não conta como sucesso de saúde.
 */
public final class WatchSyncClient {
    private static final long FIRST_POLL_DELAY_MS = 350L;
    private static final long POLL_INTERVAL_MS = 700L;
    private static final int MAX_POLL_ATTEMPTS = 10;

    public interface Callback {
        void onFinished(SyncReport report);
    }

    private WatchSyncClient() {
    }

    /**
     * @param awaitCrewLife true quando o pedido vem da tela CrewLife: a espera termina com um
     *                      resumo CrewLife novo, não com a escala.
     */
    public static void refresh(Context context, boolean awaitCrewLife, Callback callback) {
        Context appContext = context.getApplicationContext();

        Wearable.getDataClient(appContext).getDataItems()
                .addOnSuccessListener(buffer -> {
                    List<DataItemTriage.Item> items = read(buffer);
                    long now = System.currentTimeMillis();
                    DataItemTriage.Decision roster = DataItemTriage.baseline(
                            DataItemTriage.Channel.ROSTER, items, now);
                    DataItemTriage.Decision crewLife = DataItemTriage.baseline(
                            DataItemTriage.Channel.CREWLIFE, items, now);
                    DataItemTriage.Decision routine = DataItemTriage.baseline(
                            DataItemTriage.Channel.ROUTINE, items, now);

                    apply(appContext, roster, true);
                    apply(appContext, crewLife, true);
                    apply(appContext, routine, true);

                    requestFromConnectedPhone(appContext, awaitCrewLife,
                            new Baseline(roster, crewLife, routine), callback);
                })
                .addOnFailureListener(error -> requestFromConnectedPhone(
                        appContext, awaitCrewLife, Baseline.unknown(), callback));
    }

    private static List<DataItemTriage.Item> read(DataItemBuffer buffer) {
        List<DataItemTriage.Item> items = new ArrayList<>();
        try {
            for (DataItem item : buffer) {
                String path = item.getUri().getPath();
                if (path == null) continue;
                for (DataItemTriage.Channel channel : DataItemTriage.Channel.values()) {
                    if (!channel.path.equals(path)) continue;
                    try {
                        DataMap map = DataMapItem.fromDataItem(item).getDataMap();
                        items.add(new DataItemTriage.Item(
                                path,
                                map.getString(channel.dataKey),
                                map.getLong("sentAtEpochMs", 0L)
                        ));
                    } catch (Exception ignored) {
                        // Um item ilegível não impede a leitura dos outros canais.
                    }
                }
            }
        } finally {
            buffer.release();
        }
        return items;
    }

    /**
     * Grava o que o triage aceitou, cada canal isolado dos outros.
     *
     * Saúde ausente na leitura inicial é o estado do Data Layer depois de uma revogação —
     * o celular apaga o item. Se o evento de remoção se perdeu com o relógio desconectado,
     * é aqui que o cache local deixa de reter o dado revogado. A escala nunca é apagada
     * por ausência, e falha num canal nunca limpa outro.
     */
    private static void apply(Context context, DataItemTriage.Decision decision, boolean baseline) {
        try {
            switch (decision.channel) {
                case ROSTER:
                    if (decision.accepted()) new SecureSnapshotStore(context).save(decision.payload);
                    break;
                case CREWLIFE:
                    if (decision.accepted()) new WellbeingStore(context).saveCrewLife(decision.payload);
                    else if (baseline && decision.outcome == DataItemTriage.Outcome.ABSENT) {
                        new WellbeingStore(context).clearCrewLife();
                    }
                    break;
                case ROUTINE:
                    if (decision.accepted()) new WellbeingStore(context).saveRoutine(decision.payload);
                    else if (baseline && decision.outcome == DataItemTriage.Outcome.ABSENT) {
                        new WellbeingStore(context).clearRoutine();
                    }
                    break;
            }
        } catch (Exception ignored) {
            // Fail closed: mantém o último cache válido deste canal.
        }
    }

    private static void requestFromConnectedPhone(
            Context context,
            boolean awaitCrewLife,
            Baseline baseline,
            Callback callback
    ) {
        Wearable.getNodeClient(context).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    List<Node> connected = nodes;
                    if (connected.isEmpty()) {
                        callback.onFinished(baseline.report(SyncReport.Phone.NOT_CONNECTED));
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
                            () -> poll(context, awaitCrewLife, baseline, 0, callback, handler),
                            FIRST_POLL_DELAY_MS
                    );
                })
                .addOnFailureListener(error ->
                        callback.onFinished(baseline.report(SyncReport.Phone.ERROR)));
    }

    private static void poll(
            Context context,
            boolean awaitCrewLife,
            Baseline baseline,
            int attempt,
            Callback callback,
            Handler handler
    ) {
        Wearable.getDataClient(context).getDataItems()
                .addOnSuccessListener(buffer -> {
                    List<DataItemTriage.Item> items = read(buffer);
                    long now = System.currentTimeMillis();
                    baseline.absorb(context, DataItemTriage.followUp(
                            DataItemTriage.Channel.ROSTER, items, baseline.rosterSentAt(), now));
                    baseline.absorb(context, DataItemTriage.followUp(
                            DataItemTriage.Channel.CREWLIFE, items, baseline.crewLifeSentAt(), now));
                    baseline.absorb(context, DataItemTriage.followUp(
                            DataItemTriage.Channel.ROUTINE, items, baseline.routineSentAt(), now));

                    boolean done = awaitCrewLife
                            ? baseline.crewLife.outcome == DataItemTriage.Outcome.FRESH
                            : baseline.roster.outcome == DataItemTriage.Outcome.FRESH;
                    if (done || attempt + 1 >= MAX_POLL_ATTEMPTS) {
                        callback.onFinished(baseline.report(SyncReport.Phone.CONNECTED));
                        return;
                    }
                    handler.postDelayed(
                            () -> poll(context, awaitCrewLife, baseline, attempt + 1, callback, handler),
                            POLL_INTERVAL_MS
                    );
                })
                .addOnFailureListener(error -> {
                    if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
                        callback.onFinished(baseline.report(SyncReport.Phone.CONNECTED));
                        return;
                    }
                    handler.postDelayed(
                            () -> poll(context, awaitCrewLife, baseline, attempt + 1, callback, handler),
                            POLL_INTERVAL_MS
                    );
                });
    }

    /** Estado por canal ao longo de um pedido: a leitura inicial, trocada pelo item novo. */
    private static final class Baseline {
        DataItemTriage.Decision roster;
        DataItemTriage.Decision crewLife;
        DataItemTriage.Decision routine;
        /** sentAt da leitura inicial por canal; só um item acima disso conta como novo. */
        private final long rosterBaseline;
        private final long crewLifeBaseline;
        private final long routineBaseline;

        Baseline(DataItemTriage.Decision roster,
                 DataItemTriage.Decision crewLife,
                 DataItemTriage.Decision routine) {
            this.roster = roster;
            this.crewLife = crewLife;
            this.routine = routine;
            this.rosterBaseline = roster.sentAtEpochMs;
            this.crewLifeBaseline = crewLife.sentAtEpochMs;
            this.routineBaseline = routine.sentAtEpochMs;
        }

        /** Leitura inicial falhou: nada restaurado, e nada foi apagado por ausência. */
        static Baseline unknown() {
            return new Baseline(
                    unread(DataItemTriage.Channel.ROSTER),
                    unread(DataItemTriage.Channel.CREWLIFE),
                    unread(DataItemTriage.Channel.ROUTINE));
        }

        private static DataItemTriage.Decision unread(DataItemTriage.Channel channel) {
            return new DataItemTriage.Decision(
                    channel, DataItemTriage.Outcome.UNCHANGED, null, 0L, false);
        }

        long rosterSentAt() {
            return rosterBaseline;
        }

        long crewLifeSentAt() {
            return crewLifeBaseline;
        }

        long routineSentAt() {
            return routineBaseline;
        }

        /** Grava e adota um item novo do acompanhamento; UNCHANGED mantém a leitura inicial. */
        void absorb(Context context, DataItemTriage.Decision next) {
            if (next.outcome == DataItemTriage.Outcome.UNCHANGED) return;
            DataItemTriage.Decision current = current(next.channel);
            // Um item novo já adotado não volta atrás por uma leitura posterior igual.
            if (current.outcome == DataItemTriage.Outcome.FRESH
                    && next.sentAtEpochMs <= current.sentAtEpochMs) return;
            apply(context, next, false);
            switch (next.channel) {
                case ROSTER: roster = next; break;
                case CREWLIFE: crewLife = next; break;
                default: routine = next; break;
            }
        }

        private DataItemTriage.Decision current(DataItemTriage.Channel channel) {
            switch (channel) {
                case ROSTER: return roster;
                case CREWLIFE: return crewLife;
                default: return routine;
            }
        }

        SyncReport report(SyncReport.Phone phone) {
            return new SyncReport(phone, roster, crewLife);
        }
    }
}
