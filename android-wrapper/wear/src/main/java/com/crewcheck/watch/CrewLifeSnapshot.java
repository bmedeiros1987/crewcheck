package com.crewcheck.watch;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/**
 * Projeção de bem-estar para glance no relógio.
 *
 * O celular manda apenas VALORES DERIVADOS. Série temporal bruta — batimento
 * contínuo, estágios de sono, amostras — é recusada de propósito: ela não cabe
 * no orçamento da complicação, gasta bateria à toa e transformaria o mostrador
 * num monitor cardíaco permanente. O que o relógio mostra é "RECUPERAÇÃO 78%",
 * não a série que produziu os 78%.
 *
 * Isto é contexto de bem-estar, nunca diagnóstico.
 */
public final class CrewLifeSnapshot {
    private static final Set<String> LABELS = Set.of("OTIMA", "BOA", "REGULAR", "BAIXA", "DESCONHECIDA");

    public final int schemaVersion;
    public final long generatedAtEpochMs;
    public final long validUntilEpochMs;
    public final int recoveryScore;
    public final String recoveryLabel;
    public final int sleepMinutes;
    public final String sleepLabel;
    public final int steps;
    public final int activeMinutes;
    public final int restingHeartRate;
    public final int hrvMs;
    public final String recommendation;
    public final String detail;

    private CrewLifeSnapshot(
            int schemaVersion,
            long generatedAtEpochMs,
            long validUntilEpochMs,
            int recoveryScore,
            String recoveryLabel,
            int sleepMinutes,
            String sleepLabel,
            int steps,
            int activeMinutes,
            int restingHeartRate,
            int hrvMs,
            String recommendation,
            String detail
    ) {
        this.schemaVersion = schemaVersion;
        this.generatedAtEpochMs = generatedAtEpochMs;
        this.validUntilEpochMs = validUntilEpochMs;
        this.recoveryScore = recoveryScore;
        this.recoveryLabel = recoveryLabel;
        this.sleepMinutes = sleepMinutes;
        this.sleepLabel = sleepLabel;
        this.steps = steps;
        this.activeMinutes = activeMinutes;
        this.restingHeartRate = restingHeartRate;
        this.hrvMs = hrvMs;
        this.recommendation = recommendation;
        this.detail = detail;
    }

    public static CrewLifeSnapshot fromJson(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("CrewLife vazio.");
        }
        if (raw.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_WELLBEING_BYTES) {
            throw new IllegalArgumentException("CrewLife excede 4 KiB.");
        }
        try {
            return fromJson(new JSONObject(raw));
        } catch (JSONException error) {
            throw new IllegalArgumentException("JSON de CrewLife inválido.", error);
        }
    }

    public static CrewLifeSnapshot fromJson(JSONObject json) {
        rejectIdentity(json);
        rejectRawSeries(json);

        int schemaVersion = json.optInt("schemaVersion", 0);
        if (schemaVersion != WatchContract.CREWLIFE_SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão de CrewLife incompatível.");
        }

        long generatedAt = json.optLong("generatedAtEpochMs", 0L);
        if (generatedAt <= 0L) {
            throw new IllegalArgumentException("generatedAtEpochMs obrigatório.");
        }

        // Exigido mesmo não estando no esboço original: sugestão de recuperação
        // sem prazo de validade fica exibida por dias e deixa de ser verdade.
        long validUntil = json.optLong("validUntilEpochMs", 0L);
        if (validUntil <= 0L) {
            throw new IllegalArgumentException("validUntilEpochMs obrigatório.");
        }
        if (validUntil < generatedAt) {
            throw new IllegalArgumentException("validUntilEpochMs anterior à geração.");
        }

        String label = normalizeLabel(json.optString("recoveryLabel", "DESCONHECIDA"), 12);
        if (!LABELS.contains(label)) label = "DESCONHECIDA";

        return new CrewLifeSnapshot(
                schemaVersion,
                generatedAt,
                validUntil,
                bounded(json, "recoveryScore", 0, 100),
                label,
                bounded(json, "sleepMinutes", 0, 24 * 60),
                clean(json.optString("sleepLabel", ""), 10),
                bounded(json, "steps", 0, 200_000),
                bounded(json, "activeMinutes", 0, 24 * 60),
                bounded(json, "restingHeartRate", 0, 220),
                bounded(json, "hrvMs", 0, 500),
                clean(json.optString("recommendation", ""), 28),
                clean(json.optString("detail", ""), 40)
        );
    }

    public JSONObject toJson() throws JSONException {
        return new JSONObject()
                .put("schemaVersion", schemaVersion)
                .put("generatedAtEpochMs", generatedAtEpochMs)
                .put("validUntilEpochMs", validUntilEpochMs)
                .put("recoveryScore", recoveryScore)
                .put("recoveryLabel", recoveryLabel)
                .put("sleepMinutes", sleepMinutes)
                .put("sleepLabel", sleepLabel)
                .put("steps", steps)
                .put("activeMinutes", activeMinutes)
                .put("restingHeartRate", restingHeartRate)
                .put("hrvMs", hrvMs)
                .put("recommendation", recommendation)
                .put("detail", detail);
    }

    public boolean isStale(long nowEpochMs) {
        return nowEpochMs > validUntilEpochMs;
    }

    /** Título curto da complicação. */
    public String complicationTitle() {
        return "CREWLIFE";
    }

    /** Valor de glance: "78%" quando há score, senão o rótulo. */
    public String complicationText(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "--";
        if (recoveryScore > 0) return recoveryScore + "%";
        return recoveryLabel;
    }

    public String accessibilityDescription(long nowEpochMs) {
        if (isStale(nowEpochMs)) return "Dados de bem-estar desatualizados.";
        StringBuilder text = new StringBuilder("Recuperação ");
        text.append(recoveryScore > 0 ? recoveryScore + " por cento" : recoveryLabel.toLowerCase(Locale.ROOT));
        if (!sleepLabel.isEmpty()) text.append(", sono ").append(sleepLabel);
        if (!detail.isEmpty()) text.append(". ").append(detail);
        return text.toString();
    }

    public static CrewLifeSnapshot demo(long nowEpochMs) {
        try {
            return fromJson(new JSONObject()
                    .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                    .put("generatedAtEpochMs", nowEpochMs)
                    .put("validUntilEpochMs", nowEpochMs + 6 * 60 * 60 * 1000L)
                    .put("recoveryScore", 78)
                    .put("recoveryLabel", "BOA")
                    .put("sleepMinutes", 412)
                    .put("sleepLabel", "6h52")
                    .put("steps", 6430)
                    .put("activeMinutes", 31)
                    .put("restingHeartRate", 58)
                    .put("hrvMs", 44)
                    .put("recommendation", "RECUPERAÇÃO BOA")
                    .put("detail", "Treino leve ou moderado"));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    /** Identidade nunca entra no canal de saúde. */
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

    /**
     * Série bruta é recusada, não truncada: aceitar e descartar calado
     * normalizaria o celular mandando o que não deve, e um dia alguém leria.
     */
    private static void rejectRawSeries(JSONObject json) {
        String[] prohibited = {
                "heartRateSeries", "heartRateSamples", "samples", "sleepStages",
                "rawHeartRate", "bpmSeries", "hrvSeries", "spo2Series",
                "gps", "location", "latitude", "longitude", "route"
        };
        for (String key : prohibited) {
            if (json.has(key)) {
                throw new IllegalArgumentException("Série bruta não permitida no relógio: " + key);
            }
        }
    }

    /** Valor implausível reprova em vez de virar glance errado. */
    private static int bounded(JSONObject json, String key, int min, int max) {
        if (!json.has(key)) return 0;
        int value = json.optInt(key, Integer.MIN_VALUE);
        if (value < min || value > max) {
            throw new IllegalArgumentException("Valor fora da faixa plausível em " + key + ": " + value);
        }
        return value;
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
