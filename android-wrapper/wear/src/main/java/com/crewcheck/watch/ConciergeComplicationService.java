package com.crewcheck.watch;

/** Quick entry point to the native Concierge page from CrewCheck-compatible watch faces. */
public final class ConciergeComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 16;
    }

    @Override
    protected String tapScreen() {
        return "concierge";
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        if (preview) {
            return new ComplicationRendering(
                    "PRONTO",
                    "Concierge no pulso",
                    "CONCIERGE",
                    "Abrir Concierge CrewCheck"
            );
        }

        WatchConciergeStore.Snapshot latest = new WatchConciergeStore(this).load();
        if (latest != null && latest.isFresh(nowEpochMs)) {
            String shortText = latest.ok ? "NOVA" : "ATENÇÃO";
            String longText = latest.reply.isBlank()
                    ? (latest.ok ? "Concierge respondeu" : "Concierge indisponível")
                    : truncate(latest.reply, 42);
            return new ComplicationRendering(
                    shortText,
                    longText,
                    "CONCIERGE",
                    "Abrir resposta do Concierge CrewCheck"
            );
        }

        return new ComplicationRendering(
                "ABRIR",
                "Pergunte ao Concierge",
                "CONCIERGE",
                "Abrir Concierge CrewCheck"
        );
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max - 1).trim() + "…";
    }
}
