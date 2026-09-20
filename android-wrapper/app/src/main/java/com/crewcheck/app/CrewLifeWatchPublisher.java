package com.crewcheck.app;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/**
 * Publica bem-estar e rotina no relógio por canais próprios, separados da escala.
 *
 *   /crewcheck/watch/crewlife/v1
 *   /crewcheck/watch/routine/v1
 *
 * Só sai valor agregado ou derivado. Série temporal bruta, amostra e localização são
 * rejeitadas aqui, antes do Data Layer, e de novo no relógio ao desserializar — as duas
 * pontas checam porque o Data Layer persiste o item e o relógio pode receber de uma versão
 * antiga do celular.
 *
 * Fail-closed: sem opt-in vigente nada é publicado, e categoria não concedida é REMOVIDA do
 * payload em vez de ir zerada — zero é um valor de saúde, ausência não é.
 */
public final class CrewLifeWatchPublisher {
    public static final String CREWLIFE_PATH = "/crewcheck/watch/crewlife/v1";
    public static final String ROUTINE_PATH = "/crewcheck/watch/routine/v1";
    public static final String DATA_KEY_CREWLIFE_JSON = "crewLifeJson";
    public static final String DATA_KEY_ROUTINE_JSON = "routineJson";

    private static final int CREWLIFE_SCHEMA_VERSION = 1;
    private static final int ROUTINE_SCHEMA_VERSION = 1;
    private static final int MAX_WELLBEING_BYTES = 4 * 1024;

    private static final Set<String> RECOVERY_LABELS =
            Set.of("OTIMA", "BOA", "REGULAR", "BAIXA", "DESCONHECIDA");
    private static final Set<String> ROUTINE_PRIORITIES =
            Set.of("RECUPERACAO", "MANUTENCAO", "TREINO", "DESCANSO", "DESCONHECIDA");

    /** Nunca atravessam para o pulso, mesmo com consentimento. */
    private static final String[] PROHIBITED = {
            "heartRateSeries", "heartRateSamples", "samples", "sleepStages",
            "rawHeartRate", "bpmSeries", "hrvSeries", "spo2Series",
            "gps", "location", "latitude", "longitude", "route",
            "cpf", "email", "phone", "crewName", "crewId", "hotelRoom", "roomNumber",
            "token", "accessToken", "refreshToken", "authorization"
    };

    public interface Callback {
        void onResult(boolean ok, String code, String message);
    }

    private CrewLifeWatchPublisher() {}

    public static void publishCrewLife(Context context, String rawJson, Callback callback) {
        Callback safeCallback = callback == null ? (ok, code, message) -> {} : callback;
        if (WatchHealthConsent.isRevocationPending(context)) {
            safeCallback.onResult(false, "revocation_pending", "Revogação anterior ainda não confirmada no relógio.");
            return;
        }

        WatchHealthConsent consent = WatchHealthConsent.read(context);
        if (!consent.allowsAnyHealth()) {
            // Só "routine" concedida não abre o canal CrewLife: rotina é agenda, não medição.
            safeCallback.onResult(false, "consent_required", "Bem-estar no relógio não está autorizado.");
            return;
        }

        String payload;
        try {
            payload = sanitizeCrewLife(rawJson, consent.categories());
        } catch (Exception error) {
            safeCallback.onResult(false, "invalid_crewlife", safeMessage(error));
            return;
        }
        put(context, CREWLIFE_PATH, DATA_KEY_CREWLIFE_JSON, payload, safeCallback);
    }

    public static void publishRoutine(Context context, String rawJson, Callback callback) {
        Callback safeCallback = callback == null ? (ok, code, message) -> {} : callback;
        if (WatchHealthConsent.isRevocationPending(context)) {
            safeCallback.onResult(false, "revocation_pending", "Revogação anterior ainda não confirmada no relógio.");
            return;
        }

        WatchHealthConsent consent = WatchHealthConsent.read(context);
        if (!consent.allows(WatchHealthConsent.CATEGORY_ROUTINE)) {
            safeCallback.onResult(false, "consent_required", "Rotina no relógio não está autorizada.");
            return;
        }

        String payload;
        try {
            payload = sanitizeRoutine(rawJson, consent.categories());
        } catch (Exception error) {
            safeCallback.onResult(false, "invalid_routine", safeMessage(error));
            return;
        }
        put(context, ROUTINE_PATH, DATA_KEY_ROUTINE_JSON, payload, safeCallback);
    }

    /**
     * Revoga: apaga o consentimento e remove os itens do Data Layer, o que faz o relógio
     * limpar o próprio cache. A escala continua publicada — revogar saúde não pode cegar o
     * piloto para a própria escala.
     *
     * deleteDataItems é assíncrono. Disparar e responder "revogado" na mesma linha é mentir:
     * a exclusão pode falhar com o relógio fora de alcance e o dado de saúde fica no pulso.
     * Aqui a conclusão só é reportada depois que TODOS os caminhos confirmam, com retentativa
     * em backoff; enquanto não confirma, fica uma pendência registrada que bloqueia novas
     * publicações até a limpeza acontecer.
     */
    public static void revoke(Context context, Callback callback) {
        Callback safeCallback = callback == null ? (ok, code, message) -> {} : callback;
        Context app = context.getApplicationContext();

        // O consentimento local morre primeiro e incondicionalmente: mesmo que o enlace caia,
        // o celular para de publicar na hora.
        WatchHealthConsent.revoke(app);
        WatchHealthConsent.setRevocationPending(app, true);

        RevocationRetry.run(
                new String[]{CREWLIFE_PATH, ROUTINE_PATH},
                wearableDeleter(app),
                mainThreadScheduler(),
                (allDeleted, failedPaths) -> {
                    if (allDeleted) {
                        WatchHealthConsent.setRevocationPending(app, false);
                        safeCallback.onResult(true, "revoked", "Bem-estar removido do relógio.");
                        return;
                    }
                    safeCallback.onResult(
                            false,
                            "revocation_incomplete",
                            "Consentimento revogado no celular, mas "
                                    + failedPaths
                                    + " canal(is) não confirmaram a limpeza no relógio. Será repetido."
                    );
                }
        );
    }

    /** Retoma uma revogação que ficou pela metade, por exemplo ao religar o app. */
    public static void retryPendingRevocation(Context context, Callback callback) {
        Context app = context.getApplicationContext();
        if (!WatchHealthConsent.isRevocationPending(app)) {
            if (callback != null) callback.onResult(true, "nothing_pending", "Nada pendente.");
            return;
        }
        revoke(app, callback);
    }

    private static RevocationRetry.Deleter wearableDeleter(Context app) {
        return (path, onSuccess, onFailure) -> {
            try {
                Wearable.getDataClient(app)
                        .deleteDataItems(wearUri(path))
                        .addOnSuccessListener(deleted -> onSuccess.run())
                        .addOnFailureListener(error -> onFailure.run());
            } catch (Exception error) {
                onFailure.run();
            }
        };
    }

    private static RevocationRetry.Scheduler mainThreadScheduler() {
        Handler handler = new Handler(Looper.getMainLooper());
        return (delayMs, action) -> handler.postDelayed(action, delayMs);
    }

    // --- sanitização pura, testável em JVM ---------------------------------------------

    static String sanitizeCrewLife(String rawJson, Set<String> categories) throws Exception {
        JSONObject source = parse(rawJson);

        JSONObject out = envelope(source, CREWLIFE_SCHEMA_VERSION);
        boolean narrative = categories.containsAll(WatchHealthConsent.HEALTH_CATEGORIES);

        if (categories.contains(WatchHealthConsent.CATEGORY_RECOVERY)) {
            putBounded(source, out, "recoveryScore", 0, 100);
            String label = normalizeLabel(source.optString("recoveryLabel", ""), 16);
            out.put("recoveryLabel", RECOVERY_LABELS.contains(label) ? label : "DESCONHECIDA");

            // "dormiu 4h, FC alta, pegue leve" entrega sono e batimento mesmo com só
            // recuperação concedida. Não dá para saber de qual categoria cada frase veio,
            // então a narrativa exige o consentimento de saúde completo.
            if (narrative) {
                copyString(source, out, "recommendation", 32);
                copyString(source, out, "detail", 48);
            }
        }
        if (categories.contains(WatchHealthConsent.CATEGORY_SLEEP)) {
            putBounded(source, out, "sleepMinutes", 0, 1440);
            copyString(source, out, "sleepLabel", 12);
        }
        if (categories.contains(WatchHealthConsent.CATEGORY_ACTIVITY)) {
            putBounded(source, out, "steps", 0, 200_000);
            putBounded(source, out, "activeMinutes", 0, 1440);
        }
        if (categories.contains(WatchHealthConsent.CATEGORY_HEART)) {
            putBounded(source, out, "restingHeartRate", 0, 220);
            putBounded(source, out, "hrvMs", 0, 500);
        }
        return finish(out);
    }

    static String sanitizeRoutine(String rawJson, Set<String> categories) throws Exception {
        JSONObject source = parse(rawJson);

        JSONObject out = envelope(source, ROUTINE_SCHEMA_VERSION);
        copyString(source, out, "title", 24);
        putBounded(source, out, "durationMinutes", 0, 720);

        // reason e nextAction justificam a sugestão, e justificar quase sempre é citar saúde
        // ("apresentação em 8h e você dormiu 4h"). Mesma regra do CrewLife.
        if (categories.containsAll(WatchHealthConsent.HEALTH_CATEGORIES)) {
            copyString(source, out, "reason", 48);
            copyString(source, out, "nextAction", 32);
        }

        String priority = normalizeLabel(source.optString("priority", ""), 16);
        out.put("priority", ROUTINE_PRIORITIES.contains(priority) ? priority : "DESCONHECIDA");
        return finish(out);
    }

    private static JSONObject parse(String rawJson) throws Exception {
        if (rawJson == null || rawJson.isBlank()) {
            throw new IllegalArgumentException("Payload vazio.");
        }
        if (rawJson.getBytes(StandardCharsets.UTF_8).length > MAX_WELLBEING_BYTES) {
            throw new IllegalArgumentException("Payload excede 4 KiB.");
        }
        JSONObject source = new JSONObject(rawJson);
        for (String key : PROHIBITED) {
            if (source.has(key)) {
                throw new IllegalArgumentException("Campo não permitido no relógio: " + key);
            }
        }
        return source;
    }

    private static JSONObject envelope(JSONObject source, int schemaVersion) throws Exception {
        long generatedAt = source.optLong("generatedAtEpochMs", 0L);
        long validUntil = source.optLong("validUntilEpochMs", 0L);
        if (generatedAt <= 0L) {
            throw new IllegalArgumentException("generatedAtEpochMs obrigatório.");
        }
        if (validUntil <= 0L || validUntil < generatedAt) {
            throw new IllegalArgumentException("Janela temporal inválida.");
        }
        return new JSONObject()
                .put("schemaVersion", schemaVersion)
                .put("generatedAtEpochMs", generatedAt)
                .put("validUntilEpochMs", validUntil);
    }

    private static String finish(JSONObject out) {
        String normalized = out.toString();
        if (normalized.getBytes(StandardCharsets.UTF_8).length > MAX_WELLBEING_BYTES) {
            throw new IllegalArgumentException("Payload normalizado excede 4 KiB.");
        }
        return normalized;
    }

    /** Fora da faixa plausível o valor é recusado inteiro; não há clamp silencioso. */
    private static void putBounded(JSONObject source, JSONObject target, String key, int min, int max)
            throws Exception {
        if (!source.has(key)) return;
        int value = source.optInt(key, Integer.MIN_VALUE);
        if (value < min || value > max) {
            throw new IllegalArgumentException("Valor fora da faixa plausível em " + key + ": " + value);
        }
        target.put(key, value);
    }

    private static void copyString(JSONObject source, JSONObject target, String key, int max)
            throws Exception {
        String value = clean(source.optString(key, ""), max);
        if (!value.isBlank() && !"null".equalsIgnoreCase(value)) target.put(key, value);
    }

    /** Maiúsculas sem acento via Normalizer: ótima/ÓTIMA/Otima chegam todos em OTIMA. */
    private static String normalizeLabel(String value, int max) {
        String cleaned = clean(value, max).toUpperCase(Locale.ROOT);
        return Normalizer.normalize(cleaned, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max).trim();
    }

    private static Uri wearUri(String path) {
        return new Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(path).build();
    }

    private static void put(Context context, String path, String key, String payload, Callback callback) {
        Context app = context.getApplicationContext();
        PutDataMapRequest mapRequest = PutDataMapRequest.create(path);
        DataMap dataMap = mapRequest.getDataMap();
        dataMap.putString(key, payload);
        dataMap.putLong("sentAtEpochMs", System.currentTimeMillis());

        Wearable.getDataClient(app)
                .putDataItem(mapRequest.asPutDataRequest().setUrgent())
                .addOnSuccessListener(item -> callback.onResult(true, "published", path))
                .addOnFailureListener(error -> callback.onResult(false, "data_layer_error", safeMessage(error)));
    }

    private static String safeMessage(Throwable error) {
        if (error == null || error.getMessage() == null || error.getMessage().isBlank()) {
            return "Falha ao sincronizar o bem-estar com o relógio.";
        }
        String value = error.getMessage().trim();
        return value.length() <= 180 ? value : value.substring(0, 180);
    }
}
