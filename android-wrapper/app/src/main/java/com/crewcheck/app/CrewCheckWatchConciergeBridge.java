package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/** Narrow, privacy-safe bridge between CrewWatch Concierge actions and the phone WebView. */
public final class CrewCheckWatchConciergeBridge {
    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_BYTES = 4 * 1024;
    public static final String REQUEST_PATH = "/crewcheck/watch/concierge/request/v1";
    public static final String RESPONSE_PATH = "/crewcheck/watch/concierge/response/v1";
    public static final String DATA_KEY_RESPONSE_JSON = "conciergeResponseJson";

    private static final String PREFS = "crewcheck_watch_concierge";
    private static final String KEY_PENDING = "pending_request";
    private static final Set<String> ACTIONS = Set.of(
            "WAKEUP", "TRANSFER", "ROOM", "AIRPORT", "FOOD", "VOICE", "OTHER"
    );

    public interface Callback {
        void onResult(boolean ok, String message);
    }

    private CrewCheckWatchConciergeBridge() {}

    public static String sanitizeRequest(byte[] data) throws Exception {
        if (data == null || data.length == 0 || data.length > MAX_BYTES) {
            throw new IllegalArgumentException("Pedido Concierge inválido.");
        }
        JSONObject source = new JSONObject(new String(data, StandardCharsets.UTF_8));
        if (source.optInt("schemaVersion", 0) != SCHEMA_VERSION) {
            throw new IllegalArgumentException("Versão Concierge incompatível.");
        }

        String requestId = clean(source.optString("requestId", ""), 80);
        String action = clean(source.optString("action", ""), 24).toUpperCase();
        String text = clean(source.optString("text", ""), 220);
        long createdAt = source.optLong("createdAtEpochMs", 0L);

        if (requestId.isBlank() || !ACTIONS.contains(action) || createdAt <= 0L) {
            throw new IllegalArgumentException("Pedido Concierge incompleto.");
        }

        return new JSONObject()
                .put("schemaVersion", SCHEMA_VERSION)
                .put("requestId", requestId)
                .put("action", action)
                .put("text", text)
                .put("createdAtEpochMs", createdAt)
                .toString();
    }

    public static void queue(Context context, String payload) {
        context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PENDING, payload)
                .apply();
    }

    public static String peekPending(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_PENDING, "");
    }

    public static void clearPending(Context context, String requestId) {
        SharedPreferences prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_PENDING, "");
        if (raw == null || raw.isBlank()) return;
        try {
            JSONObject json = new JSONObject(raw);
            if (!requestId.equals(json.optString("requestId", ""))) return;
        } catch (Exception ignored) {
        }
        prefs.edit().remove(KEY_PENDING).apply();
    }

    public static void processInBackground(
            Context context,
            String requestPayload,
            Callback callback
    ) {
        Callback safe = callback == null ? (ok, message) -> {} : callback;
        Context app = context.getApplicationContext();

        new Thread(() -> {
            try {
                JSONObject request = new JSONObject(requestPayload);
                String requestId = request.optString("requestId", "");
                String prompt = promptFor(
                        request.optString("action", ""),
                        request.optString("text", "")
                );
                if (requestId.isBlank() || prompt.isBlank()) {
                    safe.onResult(false, "Pedido Concierge incompleto.");
                    return;
                }

                String cookie = "";
                try {
                    cookie = String.valueOf(
                            CookieManager.getInstance().getCookie("https://crewcheck.online")
                    );
                } catch (Exception ignored) {
                }
                if (cookie.isBlank() || "null".equalsIgnoreCase(cookie)) {
                    safe.onResult(false, "Sessão do CrewCheck indisponível em segundo plano.");
                    return;
                }

                HttpURLConnection connection = (HttpURLConnection) new URL(
                        "https://crewcheck.online/api/telegram/concierge/ask"
                ).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8_000);
                connection.setReadTimeout(18_000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Cookie", cookie);

                byte[] body = new JSONObject().put("text", prompt)
                        .toString()
                        .getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String responseBody = readStream(stream);
                connection.disconnect();

                JSONObject response = responseBody.isBlank()
                        ? new JSONObject()
                        : new JSONObject(responseBody);
                if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
                    safe.onResult(
                            false,
                            clean(response.optString("message", "Concierge indisponível."), 180)
                    );
                    return;
                }

                String reply = clean(response.optString("reply", ""), 520);
                if (reply.isBlank()) {
                    safe.onResult(false, "Concierge respondeu sem texto.");
                    return;
                }

                publishResponse(app, requestId, true, reply, (sent, message) -> {
                    if (sent) clearPending(app, requestId);
                    safe.onResult(sent, message);
                });
            } catch (Exception error) {
                safe.onResult(false, "Concierge aguardando o app no celular.");
            }
        }, "crewcheck-watch-concierge").start();
    }

    private static String promptFor(String action, String dictatedText) {
        String spoken = clean(dictatedText, 220);
        if (!spoken.isBlank()) return spoken;

        return switch (clean(action, 24).toUpperCase()) {
            case "WAKEUP" ->
                    "Com base na minha próxima programação, qual horário você recomenda para eu despertar?";
            case "TRANSFER" ->
                    "Qual é a orientação ou o status do meu pickup ou transfer para a próxima programação?";
            case "ROOM" ->
                    "Preciso de ajuda com meu quarto ou hotel do pernoite. O que posso fazer agora?";
            case "AIRPORT" -> "/proximo";
            case "FOOD" -> "Onde posso comer perto do meu pernoite ou hotel agora?";
            default -> "/hoje";
        };
    }

    private static String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (out.length() > 128 * 1024) {
                    throw new IllegalArgumentException("Resposta Concierge excessiva.");
                }
                out.append(line);
            }
        }
        return out.toString();
    }

    public static void publishResponse(
            Context context,
            String requestId,
            boolean ok,
            String reply,
            Callback callback
    ) {
        Callback safe = callback == null ? (success, message) -> {} : callback;
        try {
            JSONObject out = new JSONObject()
                    .put("schemaVersion", SCHEMA_VERSION)
                    .put("requestId", clean(requestId, 80))
                    .put("ok", ok)
                    .put("reply", clean(reply, 520))
                    .put("status", ok ? "responded" : "error")
                    .put("updatedAtEpochMs", System.currentTimeMillis());

            String payload = out.toString();
            if (payload.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
                safe.onResult(false, "Resposta Concierge excede o limite.");
                return;
            }

            PutDataMapRequest map = PutDataMapRequest.create(RESPONSE_PATH);
            DataMap dataMap = map.getDataMap();
            dataMap.putString(DATA_KEY_RESPONSE_JSON, payload);
            dataMap.putLong("sentAtEpochMs", System.currentTimeMillis());

            Wearable.getDataClient(context.getApplicationContext())
                    .putDataItem(map.asPutDataRequest().setUrgent())
                    .addOnSuccessListener(item -> safe.onResult(true, "Resposta enviada ao relógio"))
                    .addOnFailureListener(error -> safe.onResult(false, "Falha no Data Layer"));
        } catch (Exception error) {
            safe.onResult(false, "Resposta Concierge inválida");
        }
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max).trim();
    }
}
