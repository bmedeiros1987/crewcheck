package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Sends only an allow-listed, presentation-ready roster projection to the paired watch.
 * The watch never receives login tokens, CPF, e-mail, crew name or hotel room numbers.
 */
public final class CrewCheckWatchPublisher {
    public static final String SNAPSHOT_PATH = "/crewcheck/watch/context/v1";
    public static final String REQUEST_SYNC_PATH = "/crewcheck/watch/request-sync/v1";
    public static final String DATA_KEY_SNAPSHOT_JSON = "snapshotJson";
    /**
     * Credencial do relógio para buscar a projeção direto na nuvem (celular longe). Só a
     * credencial viaja: o endereço do servidor é fixo no relógio, então uma página não
     * consegue apontar o relógio para outro host.
     */
    public static final String CLOUD_PATH = "/crewcheck/watch/cloud/v1";
    public static final String DATA_KEY_CLOUD_CREDENTIAL = "credential";
    /**
     * Estado de conta para o relógio: {conta, época}. A época só muda numa transição explícita
     * (outra conta ou logout, conta vazia), sempre cresce e é carimbada em cada resumo e
     * credencial; o relógio recusa item de época anterior (ver WatchAccountGuard).
     */
    public static final String ACCOUNT_PATH = "/crewcheck/watch/account/v1";
    public static final String DATA_KEY_ACCOUNT = "account";
    public static final String DATA_KEY_ACCOUNT_EPOCH = "accountEpoch";
    private static final Pattern ACCOUNT = Pattern.compile("^[0-9a-f]{32}$");
    private static final String KEY_BOUND_ACCOUNT = "bound_account_v1";
    private static final String KEY_ACCOUNT_EPOCH = "account_epoch_v1";
    private static final Object BINDING_LOCK = new Object();
    private static final Pattern CLOUD_CREDENTIAL = Pattern.compile("^cw1\\.[0-9a-f]{32}\\.[A-Za-z0-9_-]{43}$");

    private static final int SCHEMA_VERSION = 1;
    private static final int MAX_SNAPSHOT_BYTES = 16 * 1024;
    private static final String PREFS = "crewcheck_watch_sync";
    private static final String LAST_SNAPSHOT = "last_snapshot";

    private static final Set<String> ALLOWED_STATES = Set.of(
            "OFF_DUTY", "LEAVE_SOON", "REPORTING", "BOARDING", "IN_FLIGHT",
            "CONNECTION", "OVERNIGHT", "CHANGED", "UNKNOWN"
    );

    public interface Callback {
        void onResult(boolean ok, String code, String message);
    }

    private CrewCheckWatchPublisher() {}

    public static void publish(Context context, String rawJson, Callback callback) {
        final Callback safeCallback = callback == null ? (ok, code, message) -> {} : callback;
        final String snapshot;
        try {
            snapshot = sanitize(rawJson);
        } catch (Exception error) {
            safeCallback.onResult(false, "invalid_snapshot", safeMessage(error));
            return;
        }

        Context app = context.getApplicationContext();
        final String stamped;
        try {
            JSONObject out = new JSONObject(snapshot);
            String account = out.optString("account", "");
            if (!ACCOUNT.matcher(account).matches()) {
                account = "";
                out.remove("account");
            }
            // A página é a sessão vigente: a conta dela define a época (e a transição, se mudou).
            // Resumo sem conta (sessão expirada, sem e-mail) fica na época atual, sem transição.
            long epoch = bind(app, account, false);
            if (epoch > 0L) out.put(DATA_KEY_ACCOUNT_EPOCH, epoch);
            stamped = out.toString();
        } catch (Exception error) {
            safeCallback.onResult(false, "invalid_snapshot", safeMessage(error));
            return;
        }
        deliver(app, stamped, safeCallback);
    }

    private static void deliver(Context app, String snapshot, Callback safeCallback) {
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(LAST_SNAPSHOT, snapshot)
                .apply();

        PutDataMapRequest mapRequest = PutDataMapRequest.create(SNAPSHOT_PATH);
        DataMap dataMap = mapRequest.getDataMap();
        dataMap.putString(DATA_KEY_SNAPSHOT_JSON, snapshot);
        dataMap.putLong("sentAtEpochMs", System.currentTimeMillis());

        PutDataRequest request = mapRequest.asPutDataRequest().setUrgent();
        Wearable.getDataClient(app)
                .putDataItem(request)
                .addOnSuccessListener(item -> safeCallback.onResult(
                        true,
                        "published",
                        item.getUri() == null ? SNAPSHOT_PATH : item.getUri().toString()
                ))
                .addOnFailureListener(error -> safeCallback.onResult(
                        false,
                        "data_layer_error",
                        safeMessage(error)
                ));
    }

    /**
     * Entrega a credencial ao relógio pareado; formato inválido é recusado na hora. O
     * resultado da gravação no Data Layer chega depois pelo callback, e só ele confirma o
     * pareamento para a página.
     */
    public static boolean publishCloudCredential(Context context, String credential, Callback callback) {
        if (credential == null || !CLOUD_CREDENTIAL.matcher(credential).matches()) return false;
        Context app = context.getApplicationContext();
        // Só a conta vigente pareia, carimbada com a época dela.
        long epoch;
        synchronized (BINDING_LOCK) {
            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            epoch = prefs.getLong(KEY_ACCOUNT_EPOCH, 0L);
            if (epoch <= 0L || !credential.substring(4, 36).equals(prefs.getString(KEY_BOUND_ACCOUNT, ""))) return false;
        }
        final Callback safeCallback = callback == null ? (ok, code, message) -> {} : callback;
        PutDataMapRequest mapRequest = PutDataMapRequest.create(CLOUD_PATH);
        mapRequest.getDataMap().putString(DATA_KEY_CLOUD_CREDENTIAL, credential);
        mapRequest.getDataMap().putLong(DATA_KEY_ACCOUNT_EPOCH, epoch);
        mapRequest.getDataMap().putLong("sentAtEpochMs", System.currentTimeMillis());
        Wearable.getDataClient(app)
                .putDataItem(mapRequest.asPutDataRequest().setUrgent())
                .addOnSuccessListener(item -> safeCallback.onResult(true, "cloud_credential_delivered", ""))
                .addOnFailureListener(error -> safeCallback.onResult(false, "cloud_credential_failed", safeMessage(error)));
        return true;
    }

    /**
     * Logout ou troca de conta: nova época sem conta, mesmo sem e-mail. O relógio apaga escala,
     * avisos e pareamento e passa a recusar tudo da época anterior; o celular apaga o último
     * resumo e os itens de escala e credencial do Data Layer.
     */
    public static void clearCloudCredential(Context context) {
        Context app = context.getApplicationContext();
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(LAST_SNAPSHOT).apply();
        bind(app, "", true);
        com.google.android.gms.wearable.DataClient data = Wearable.getDataClient(app);
        data.deleteDataItems(new Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(CLOUD_PATH).build());
        data.deleteDataItems(new Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(SNAPSHOT_PATH).build());
    }

    /**
     * Época da conta vigente. Muda (e publica o estado) só quando a conta é outra ou num
     * logout explícito; cresce sempre, também depois de reinstalar o app (relógio do celular).
     */
    private static long bind(Context app, String account, boolean force) {
        synchronized (BINDING_LOCK) {
            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            long epoch = prefs.getLong(KEY_ACCOUNT_EPOCH, 0L);
            if (!force && (account.isEmpty() || (epoch > 0L && account.equals(prefs.getString(KEY_BOUND_ACCOUNT, ""))))) return epoch;
            long next = Math.max(epoch + 1L, System.currentTimeMillis());
            prefs.edit().putString(KEY_BOUND_ACCOUNT, account).putLong(KEY_ACCOUNT_EPOCH, next).commit();
            PutDataMapRequest state = PutDataMapRequest.create(ACCOUNT_PATH);
            state.getDataMap().putString(DATA_KEY_ACCOUNT, account);
            state.getDataMap().putLong(DATA_KEY_ACCOUNT_EPOCH, next);
            Wearable.getDataClient(app).putDataItem(state.asPutDataRequest().setUrgent());
            return next;
        }
    }

    /** Pedido do relógio: reenvia o último resumo só se ainda for da época vigente; nunca muda a conta. */
    public static void republishLast(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String cached = prefs.getString(LAST_SNAPSHOT, "");
        if (cached == null || cached.isBlank()) return;
        try {
            synchronized (BINDING_LOCK) {
                if (new JSONObject(cached).optLong(DATA_KEY_ACCOUNT_EPOCH, 0L) != prefs.getLong(KEY_ACCOUNT_EPOCH, -1L)) return;
            }
        } catch (Exception error) {
            return;
        }
        deliver(app, cached, (ok, code, message) -> {});
    }

    static String sanitize(String rawJson) throws Exception {
        if (rawJson == null || rawJson.isBlank()) {
            throw new IllegalArgumentException("Snapshot vazio.");
        }
        if (rawJson.getBytes(StandardCharsets.UTF_8).length > MAX_SNAPSHOT_BYTES) {
            throw new IllegalArgumentException("Snapshot excede 16 KiB.");
        }

        JSONObject source = new JSONObject(rawJson);
        if (source.optInt("schemaVersion", 0) != SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão de snapshot incompatível.");
        }

        long generatedAt = source.optLong("generatedAtEpochMs", 0L);
        long validUntil = source.optLong("validUntilEpochMs", 0L);
        if (generatedAt <= 0L || validUntil < generatedAt) {
            throw new IllegalArgumentException("Janela temporal inválida.");
        }

        String state = clean(source.optString("state", "UNKNOWN"), 24).toUpperCase();
        if (!ALLOWED_STATES.contains(state)) state = "UNKNOWN";

        JSONObject out = new JSONObject();
        out.put("schemaVersion", SCHEMA_VERSION);
        copyString(source, out, "contextId", 80);
        out.put("generatedAtEpochMs", generatedAt);
        out.put("validUntilEpochMs", validUntil);
        out.put("state", state);
        copyString(source, out, "headline", 42);
        copyString(source, out, "primaryTime", 12);
        copyString(source, out, "detail", 96);
        copyString(source, out, "presentationTime", 12);
        copyString(source, out, "presentationPlace", 42);
        copyString(source, out, "leaveTime", 12);
        copyString(source, out, "trafficDetail", 64);
        copyString(source, out, "currentFlight", 16);
        copyString(source, out, "currentRoute", 32);
        copyString(source, out, "gate", 18);
        out.put("remoteStand", source.optBoolean("remoteStand", false));
        copyString(source, out, "gateSource", 12);
        copyString(source, out, "gateNote", 64);
        copyString(source, out, "account", 32);
        copyString(source, out, "boardingTime", 12);
        copyString(source, out, "eta", 12);
        copyString(source, out, "connection", 16);
        copyString(source, out, "nextFlight", 16);
        copyString(source, out, "nextDetail", 64);
        copyString(source, out, "overnight", 24);
        copyString(source, out, "hotelPickup", 64);
        out.put("changed", source.optBoolean("changed", false));
        out.put("source", "canonical-roster");
        copySchedule(source, out);

        rejectSensitiveFields(source);

        String normalized = out.toString();
        if (normalized.getBytes(StandardCharsets.UTF_8).length > MAX_SNAPSHOT_BYTES) {
            throw new IllegalArgumentException("Snapshot normalizado excede 16 KiB.");
        }
        return normalized;
    }

    private static void copySchedule(JSONObject source, JSONObject target) throws Exception {
        JSONArray input = source.optJSONArray("schedule");
        if (input == null) return;

        JSONArray output = new JSONArray();
        int limit = Math.min(input.length(), 8);
        for (int i = 0; i < limit; i++) {
            JSONObject item = input.optJSONObject(i);
            if (item == null) continue;

            JSONObject cleanItem = new JSONObject();
            copyString(item, cleanItem, "id", 80);
            copyString(item, cleanItem, "kind", 12);
            copyString(item, cleanItem, "time", 12);
            copyString(item, cleanItem, "title", 24);
            copyString(item, cleanItem, "route", 32);
            copyString(item, cleanItem, "presentation", 12);
            copyString(item, cleanItem, "gate", 18);
            copyString(item, cleanItem, "detail", 64);
            if (cleanItem.length() > 0) output.put(cleanItem);
        }
        if (output.length() > 0) target.put("schedule", output);
    }

    private static void rejectSensitiveFields(JSONObject source) {
        String[] prohibited = {
                "cpf", "email", "phone", "crewName", "hotelRoom", "roomNumber",
                "token", "accessToken", "refreshToken", "authorization"
        };
        for (String key : prohibited) {
            if (source.has(key)) {
                throw new IllegalArgumentException("Campo não permitido no relógio: " + key);
            }
        }
    }

    private static void copyString(JSONObject source, JSONObject target, String key, int max) throws Exception {
        String value = clean(source.optString(key, ""), max);
        if (!value.isBlank() && !"null".equalsIgnoreCase(value)) target.put(key, value);
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }

    private static String safeMessage(Throwable error) {
        if (error == null || error.getMessage() == null || error.getMessage().isBlank()) {
            return "Falha ao sincronizar o CrewCheck Watch.";
        }
        String value = error.getMessage().trim();
        return value.length() <= 180 ? value : value.substring(0, 180);
    }
}
