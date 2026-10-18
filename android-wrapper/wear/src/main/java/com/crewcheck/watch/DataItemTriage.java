package com.crewcheck.watch;

import java.util.List;

/**
 * Decisão, canal por canal, sobre os DataItems lidos do Data Layer — em JVM pura.
 *
 * Escala, CrewLife e rotina chegam em caminhos próprios e cada um é validado pelo seu
 * parser. O payload é gravado como veio: generatedAt e validUntil são do celular, e um
 * resumo antigo continua antigo depois de restaurado — refresh nunca renova frescor.
 */
final class DataItemTriage {

    enum Channel {
        ROSTER(WatchContract.SNAPSHOT_PATH, WatchContract.DATA_KEY_SNAPSHOT_JSON),
        CREWLIFE(WatchContract.CREWLIFE_PATH, WatchContract.DATA_KEY_CREWLIFE_JSON),
        ROUTINE(WatchContract.ROUTINE_PATH, WatchContract.DATA_KEY_ROUTINE_JSON);

        final String path;
        final String dataKey;

        Channel(String path, String dataKey) {
            this.path = path;
            this.dataKey = dataKey;
        }
    }

    enum Outcome {
        /** Chegou um item com sentAt maior que o da leitura inicial. */
        FRESH,
        /** Item que já estava no Data Layer, restaurado na leitura inicial. */
        RESTORED,
        /** Na leitura de acompanhamento, nada mais novo que a leitura inicial. */
        UNCHANGED,
        /** Nenhum item neste caminho. Para saúde, é o estado depois de uma revogação. */
        ABSENT,
        /** Item presente, recusado pelo parser. O cache local não é tocado. */
        INVALID
    }

    static final class Item {
        final String path;
        final String json;
        final long sentAtEpochMs;

        Item(String path, String json, long sentAtEpochMs) {
            this.path = path;
            this.json = json;
            this.sentAtEpochMs = sentAtEpochMs;
        }
    }

    static final class Decision {
        final Channel channel;
        final Outcome outcome;
        /** Payload validado para gravar, ou null quando não há nada a gravar. */
        final String payload;
        final long sentAtEpochMs;
        /** O payload aceito já está vencido segundo o validUntil do próprio celular. */
        final boolean stale;

        Decision(Channel channel, Outcome outcome, String payload, long sentAtEpochMs, boolean stale) {
            this.channel = channel;
            this.outcome = outcome;
            this.payload = payload;
            this.sentAtEpochMs = sentAtEpochMs;
            this.stale = stale;
        }

        boolean accepted() {
            return payload != null;
        }
    }

    private DataItemTriage() {
    }

    /** Leitura inicial: restaura o item mais recente do canal, se houver e se for válido. */
    static Decision baseline(Channel channel, List<Item> items, long nowEpochMs) {
        Item latest = latest(channel, items);
        if (latest == null) return new Decision(channel, Outcome.ABSENT, null, 0L, false);
        return validate(channel, latest, Outcome.RESTORED, nowEpochMs);
    }

    /** Leitura de acompanhamento: só interessa o que for mais novo que a leitura inicial. */
    static Decision followUp(Channel channel, List<Item> items, long baselineSentAt, long nowEpochMs) {
        Item latest = latest(channel, items);
        if (latest == null || latest.sentAtEpochMs <= baselineSentAt) {
            return new Decision(channel, Outcome.UNCHANGED, null, baselineSentAt, false);
        }
        return validate(channel, latest, Outcome.FRESH, nowEpochMs);
    }

    private static Item latest(Channel channel, List<Item> items) {
        Item latest = null;
        if (items == null) return null;
        for (Item item : items) {
            if (item == null || !channel.path.equals(item.path) || item.json == null) continue;
            if (latest == null || item.sentAtEpochMs > latest.sentAtEpochMs) latest = item;
        }
        return latest;
    }

    private static Decision validate(Channel channel, Item item, Outcome ok, long nowEpochMs) {
        try {
            boolean stale;
            switch (channel) {
                case ROSTER:
                    stale = WatchContextSnapshot.fromJson(item.json).isStale(nowEpochMs);
                    break;
                case CREWLIFE:
                    stale = CrewLifeSnapshot.fromJson(item.json).isStale(nowEpochMs);
                    break;
                default:
                    stale = RoutineSnapshot.fromJson(item.json).isStale(nowEpochMs);
                    break;
            }
            return new Decision(channel, ok, item.json, item.sentAtEpochMs, stale);
        } catch (RuntimeException rejected) {
            return new Decision(channel, Outcome.INVALID, null, item.sentAtEpochMs, false);
        }
    }
}
