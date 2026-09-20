package com.crewcheck.watch;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/**
 * Sugestão de rotina do dia, já decidida no celular.
 *
 * O relógio não escolhe treino nem calcula carga: ele recebe o resultado e o
 * mostra. Toda a inferência (dormiu pouco + apresentação em 6h => priorizar
 * recuperação) acontece do lado que tem a escala e o histórico.
 */
public final class RoutineSnapshot {
    private static final Set<String> PRIORITIES = Set.of(
            "RECUPERACAO", "MANUTENCAO", "TREINO", "DESCANSO", "DESCONHECIDA"
    );

    public final int schemaVersion;
    public final long generatedAtEpochMs;
    public final long validUntilEpochMs;
    public final String title;
    public final int durationMinutes;
    public final String reason;
    public final String priority;
    public final String nextAction;

    private RoutineSnapshot(
            int schemaVersion,
            long generatedAtEpochMs,
            long validUntilEpochMs,
            String title,
            int durationMinutes,
            String reason,
            String priority,
            String nextAction
    ) {
        this.schemaVersion = schemaVersion;
        this.generatedAtEpochMs = generatedAtEpochMs;
        this.validUntilEpochMs = validUntilEpochMs;
        this.title = title;
        this.durationMinutes = durationMinutes;
        this.reason = reason;
        this.priority = priority;
        this.nextAction = nextAction;
    }

    public static RoutineSnapshot fromJson(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Rotina vazia.");
        }
        if (raw.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_WELLBEING_BYTES) {
            throw new IllegalArgumentException("Rotina excede 4 KiB.");
        }
        try {
            return fromJson(new JSONObject(raw));
        } catch (JSONException error) {
            throw new IllegalArgumentException("JSON de rotina inválido.", error);
        }
    }

    public static RoutineSnapshot fromJson(JSONObject json) {
        rejectIdentity(json);

        int schemaVersion = json.optInt("schemaVersion", 0);
        if (schemaVersion != WatchContract.ROUTINE_SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão de rotina incompatível.");
        }

        long generatedAt = json.optLong("generatedAtEpochMs", 0L);
        if (generatedAt <= 0L) {
            throw new IllegalArgumentException("generatedAtEpochMs obrigatório.");
        }

        // Sugestão de ontem exibida hoje é pior do que nenhuma sugestão.
        long validUntil = json.optLong("validUntilEpochMs", 0L);
        if (validUntil <= 0L) {
            throw new IllegalArgumentException("validUntilEpochMs obrigatório.");
        }
        if (validUntil < generatedAt) {
            throw new IllegalArgumentException("validUntilEpochMs anterior à geração.");
        }

        String priority = normalizeLabel(json.optString("priority", "DESCONHECIDA"), 14);
        if (!PRIORITIES.contains(priority)) priority = "DESCONHECIDA";

        int duration = json.optInt("durationMinutes", 0);
        if (duration < 0 || duration > 12 * 60) {
            throw new IllegalArgumentException("durationMinutes fora da faixa plausível: " + duration);
        }

        return new RoutineSnapshot(
                schemaVersion,
                generatedAt,
                validUntil,
                clean(json.optString("title", ""), 18),
                duration,
                clean(json.optString("reason", ""), 40),
                priority,
                clean(json.optString("nextAction", ""), 32)
        );
    }

    public JSONObject toJson() throws JSONException {
        return new JSONObject()
                .put("schemaVersion", schemaVersion)
                .put("generatedAtEpochMs", generatedAtEpochMs)
                .put("validUntilEpochMs", validUntilEpochMs)
                .put("title", title)
                .put("durationMinutes", durationMinutes)
                .put("reason", reason)
                .put("priority", priority)
                .put("nextAction", nextAction);
    }

    public boolean isStale(long nowEpochMs) {
        return nowEpochMs > validUntilEpochMs;
    }

    public String complicationTitle() {
        return "ROTINA";
    }

    /** Glance: "25 min" quando há duração, senão o título curto. */
    public String complicationText(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "--";
        if (durationMinutes > 0) return durationMinutes + " min";
        return title.isEmpty() ? "--" : title;
    }

    public String complicationLongText(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "Rotina desatualizada";
        if (title.isEmpty()) return "Sem sugestão para hoje";
        return durationMinutes > 0 ? title + " · " + durationMinutes + " min" : title;
    }

    public String accessibilityDescription(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "Sugestão de rotina desatualizada.";
        StringBuilder text = new StringBuilder(title.isEmpty() ? "Sem sugestão" : title);
        if (durationMinutes > 0) text.append(", ").append(durationMinutes).append(" minutos");
        if (!reason.isEmpty()) text.append(". ").append(reason);
        return text.toString();
    }

    public static RoutineSnapshot demo(long nowEpochMs) {
        try {
            return fromJson(new JSONObject()
                    .put("schemaVersion", WatchContract.ROUTINE_SCHEMA_VERSION)
                    .put("generatedAtEpochMs", nowEpochMs)
                    .put("validUntilEpochMs", nowEpochMs + 18 * 60 * 60 * 1000L)
                    .put("title", "TREINO LEVE")
                    .put("durationMinutes", 25)
                    .put("reason", "Apresentação em 8h")
                    .put("priority", "RECUPERACAO")
                    .put("nextAction", "Caminhada 25 min"));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private static void rejectIdentity(JSONObject json) {
        String[] prohibited = {
                "cpf", "email", "phone", "crewName", "crewId", "hotelRoom", "roomNumber",
                "token", "accessToken", "refreshToken", "authorization"
        };
        for (String key : prohibited) {
            if (json.has(key)) {
                throw new IllegalArgumentException("Campo pessoal não permitido no relógio: " + key);
            }
        }
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength).trim();
    }

    /**
     * Maiúsculas sem acento, via Normalizer.
     *
     * Trocar caractere a caractere não escala: "ÓTIMA" passava direto e virava DESCONHECIDA,
     * porque só Ç e Ã estavam mapeados. NFD decompõe a letra do acento e a marca combinante é
     * descartada, então ótima/ÓTIMA/Otima chegam todos em OTIMA.
     */
    private static String normalizeLabel(String value, int maxLength) {
        String cleaned = clean(value, maxLength).toUpperCase(Locale.ROOT);
        return Normalizer.normalize(cleaned, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }
}
