package com.crewcheck.watch;

/**
 * Decisão de texto de cada complicação CrewCheck, em JVM pura.
 *
 * Um snapshot nulo significa "sem dado" — cache vazio, saúde não autorizada ou payload
 * rejeitado — e sempre degrada para um texto neutro. Nenhuma complicação cai para outro
 * domínio quando o seu próprio canal está vazio (fail-closed).
 */
final class ComplicationText {
    /** SHORT_TEXT no Wear OS é cortado por volta de 7 caracteres. */
    private static final int SHORT_LIMIT = 7;
    private static final int LONG_LIMIT = 48;
    private static final int DESCRIPTION_LIMIT = 120;

    private ComplicationText() {
    }

    static ComplicationRendering nextStep(WatchContextSnapshot snapshot, long nowEpochMs) {
        if (snapshot == null) {
            return new ComplicationRendering(
                    "ABRIR",
                    "Abra o CrewCheck no celular",
                    "CREWCHECK",
                    "Abra o CrewCheck no celular para sincronizar a escala."
            );
        }
        return new ComplicationRendering(
                snapshot.complicationShortText(nowEpochMs),
                snapshot.complicationLongText(nowEpochMs),
                snapshot.complicationTitle(nowEpochMs),
                snapshot.accessibilityDescription(nowEpochMs)
        );
    }

    static ComplicationRendering gate(WatchContextSnapshot snapshot, long nowEpochMs) {
        if (snapshot == null) {
            return gateRendering("--", "Abra o CrewCheck no celular",
                    "Portão indisponível. Abra o CrewCheck no celular.");
        }
        if (snapshot.isStale(nowEpochMs)) {
            return gateRendering("--", "Portão desatualizado",
                    "Dado de portão desatualizado. Abra o CrewCheck no celular.");
        }
        if (snapshot.remoteStand) {
            String longText = snapshot.boardingTime.isBlank()
                    ? "REMOTA"
                    : "REMOTA · Embarque " + snapshot.boardingTime;
            return gateRendering("REMOTA", longText, "Embarque em posição remota.");
        }
        if (snapshot.gate.isBlank()) {
            return gateRendering("--", "Portão não publicado",
                    "Portão ainda não publicado para este voo.");
        }

        StringBuilder longText = new StringBuilder(snapshot.gateLabel());
        if (!snapshot.currentFlight.isBlank()) longText.append(" · ").append(snapshot.currentFlight);
        if (!snapshot.boardingTime.isBlank()) longText.append(" · ").append(snapshot.boardingTime);

        return gateRendering(
                "P" + snapshot.gate.replaceAll("\\s+", ""),
                longText.toString(),
                "Portão " + snapshot.gate + "."
        );
    }

    static ComplicationRendering crewLife(CrewLifeSnapshot snapshot, long nowEpochMs) {
        if (snapshot == null) {
            return new ComplicationRendering(
                    "--",
                    "Ative o CrewLife no celular",
                    "CREWLIFE",
                    "CrewLife sem dados. Ative a sincronização de saúde no celular."
            );
        }
        return new ComplicationRendering(
                truncate(snapshot.complicationText(nowEpochMs), SHORT_LIMIT),
                truncate(crewLifeLongText(snapshot, nowEpochMs), LONG_LIMIT),
                snapshot.complicationTitle(),
                truncate(snapshot.accessibilityDescription(nowEpochMs), DESCRIPTION_LIMIT)
        );
    }

    static ComplicationRendering routine(RoutineSnapshot snapshot, long nowEpochMs) {
        if (snapshot == null) {
            return new ComplicationRendering(
                    "--",
                    "Ative a Rotina no celular",
                    "ROTINA",
                    "Rotina sem sugestão. Ative a sincronização no celular."
            );
        }
        return new ComplicationRendering(
                truncate(snapshot.complicationText(nowEpochMs), SHORT_LIMIT),
                truncate(snapshot.complicationLongText(nowEpochMs), LONG_LIMIT),
                snapshot.complicationTitle(),
                truncate(snapshot.accessibilityDescription(nowEpochMs), DESCRIPTION_LIMIT)
        );
    }

    private static String crewLifeLongText(CrewLifeSnapshot snapshot, long nowEpochMs) {
        if (snapshot.isStale(nowEpochMs)) return "Bem-estar desatualizado";

        StringBuilder text = new StringBuilder();
        if (snapshot.recoveryScore > 0) {
            if (snapshot.isEnergyScore()) {
                text.append("Energia ").append(snapshot.recoveryScore);
            } else {
                text.append(snapshot.recoveryScore).append("%");
            }
        } else {
            text.append(snapshot.recoveryLabel);
        }
        if (!snapshot.sleepLabel.isEmpty()) {
            text.append(" · ").append(snapshot.sleepLabel);
        } else if (snapshot.steps > 0) {
            text.append(" · ").append(snapshot.steps).append(" passos");
        }
        if (text.length() < 24 && !snapshot.recommendation.isEmpty()) {
            text.append(" · ").append(snapshot.recommendation);
        }
        return text.toString();
    }

    private static ComplicationRendering gateRendering(
            String shortText,
            String longText,
            String description
    ) {
        return new ComplicationRendering(
                truncate(shortText, SHORT_LIMIT),
                truncate(longText, LONG_LIMIT),
                "PORTÃO",
                truncate(description, DESCRIPTION_LIMIT)
        );
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return "";
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
