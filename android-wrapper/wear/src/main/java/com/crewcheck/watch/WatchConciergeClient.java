package com.crewcheck.watch;

import android.content.Context;

import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Sends small Concierge actions to the paired CrewCheck phone through Wear Data Layer. */
final class WatchConciergeClient {
    interface Callback {
        void onFinished(boolean sent, String requestId, String status);
    }

    private WatchConciergeClient() {}

    static void send(Context context, String action, String text, Callback callback) {
        Context app = context.getApplicationContext();
        String requestId = UUID.randomUUID().toString();

        if (!WatchEntitlements.concierge(app)) {
            callback.onFinished(false, requestId, "Concierge no relógio é Premium");
            return;
        }

        final byte[] payload;
        try {
            JSONObject json = new JSONObject()
                    .put("schemaVersion", WatchContract.CONCIERGE_SCHEMA_VERSION)
                    .put("requestId", requestId)
                    .put("action", clean(action, 24).toUpperCase())
                    .put("text", clean(text, 220))
                    .put("createdAtEpochMs", System.currentTimeMillis());
            payload = json.toString().getBytes(StandardCharsets.UTF_8);
            if (payload.length > WatchContract.MAX_CONCIERGE_BYTES) {
                callback.onFinished(false, requestId, "Pedido muito longo");
                return;
            }
        } catch (Exception error) {
            callback.onFinished(false, requestId, "Não foi possível preparar o pedido");
            return;
        }

        Wearable.getNodeClient(app).getConnectedNodes()
                .addOnSuccessListener(nodes -> sendToPhone(app, nodes, payload, requestId, callback))
                .addOnFailureListener(error ->
                        callback.onFinished(false, requestId, "Celular não localizado"));
    }

    private static void sendToPhone(
            Context context,
            List<Node> nodes,
            byte[] payload,
            String requestId,
            Callback callback
    ) {
        if (nodes == null || nodes.isEmpty()) {
            callback.onFinished(false, requestId, "Celular não conectado");
            return;
        }

        Node node = nodes.get(0);
        Wearable.getMessageClient(context)
                .sendMessage(node.getId(), WatchContract.CONCIERGE_REQUEST_PATH, payload)
                .addOnSuccessListener(id ->
                        callback.onFinished(true, requestId, "Enviado · aguardando Concierge"))
                .addOnFailureListener(error ->
                        callback.onFinished(false, requestId, "Não foi possível enviar ao celular"));
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max).trim();
    }
}
