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
                    "Medições indisponíveis",
                    "CREWLIFE",
                    "CrewLife sem medições válidas disponíveis."
            );
        }
        return new ComplicationRendering(
                truncate(snapshot.complicationText(nowEpochMs), SHORT_LIMIT),
                truncate(crewLifeLongText(snapshot, nowEpochMs), LONG_LIMIT),
                snapshot.complicationTitle(),
                truncate(snapshot.accessibilityDescription(nowEpochMs), DESCRIPTION_LIMIT),
                crewLifeRingValue(snapshot, nowEpochMs),
                snapshot.nextExpiry(nowEpochMs)
        );
    }

    /**
     * Recuperação e Energia Samsung são ambas 0–100, então servem ao slot de anel.
     *
     * Sem medida — desatualizado ou score ausente — devolve null: o anel some em vez de
     * desenhar zero, porque zero desenhado é medida inventada.
     */
    private static Integer crewLifeRingValue(CrewLifeSnapshot snapshot, long nowEpochMs) {
        return snapshot.value("recoveryScore", nowEpochMs);
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

        String text = snapshot.value("recoveryScore", nowEpochMs) == null
                ? "Energia indisponível" : "Energia " + snapshot.value("recoveryScore", nowEpochMs) + "/100";
        if (snapshot.value("sleepMinutes", nowEpochMs) != null) text += " · " + snapshot.sleepText(nowEpochMs);
        else if (snapshot.value("steps", nowEpochMs) != null) text += " · " + snapshot.value("steps", nowEpochMs) + " passos";
        return text;
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
