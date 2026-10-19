package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** Phone-only v2 transport. ACK means durable remote clearing, not physical display. */
public final class CrewLifeV2Phone {
    private static final Object LOCK = new Object();
    private static final String PREFS = "crewcheck_crewlife_v2_protocol";
    private static boolean diskFailed;
    private static boolean retryScheduled;
    private static int retries;
    private CrewLifeV2Phone() {}

    private static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static CrewLifeV2Journal read(Context c) throws Exception {
        if (diskFailed) throw new IllegalStateException("CrewLife journal unavailable");
        return new CrewLifeV2Journal(prefs(c).getString("journal", ""));
    }
    private static void save(Context c, CrewLifeV2Journal journal) {
        if (!prefs(c).edit().putString("journal", journal.data.toString()).commit()) {
            diskFailed = true;
            throw new IllegalStateException("CrewLife journal not persisted");
        }
    }
    private static String consentStamp(Context c) {
        WatchHealthConsent v = WatchHealthConsent.read(c);
        return v.acceptedAtEpochMs() + ":" + new java.util.TreeSet<>(v.categories());
    }
    private static boolean same(Context c, String stream, long revision, String stamp) throws Exception {
        CrewLifeV2Journal current = read(c);
        return current.stream().equals(stream) && current.revision() == revision && !current.revoked()
                && stamp.equals(consentStamp(c)) && WatchHealthConsent.read(c).allowsAnyHealth()
                && !WatchHealthConsent.isRevocationPending(c);
    }

    public static void publish(Context context, String raw, CrewLifeWatchPublisher.Callback callback) {
        Context c = context.getApplicationContext();
        try {
            final String stream, stamp;
            final long revision;
            synchronized (LOCK) {
                WatchHealthConsent consent = WatchHealthConsent.read(c);
                if (!consent.allowsAnyHealth() || WatchHealthConsent.isRevocationPending(c)) {
                    callback.onResult(false, "consent_required", "Saúde indisponível; limpeza pode estar pendente."); return;
                }
                CrewLifeV2Protocol.sanitize(new JSONObject(raw), consent.categories(), System.currentTimeMillis());
                CrewLifeV2Journal j = read(c);
                if (j.revoked()) {
                    if (j.data.getJSONObject("nodes").length() > 0 && !j.allCleared()) {
                        retry(c); callback.onResult(false, "cleanup_pending", "Limpeza remota ainda não confirmada."); return;
                    }
                    j.newStream();
                }
                j.advance(); save(c, j);
                stream = j.stream(); revision = j.revision(); stamp = consentStamp(c);
            }
            Wearable.getNodeClient(c).getConnectedNodes().addOnSuccessListener(nodes ->
                Wearable.getCapabilityClient(c).getCapability(CrewLifeV2Protocol.CAPABILITY, CapabilityClient.FILTER_ALL)
                    .addOnSuccessListener(info -> {
                        try {
                            synchronized (LOCK) {
                                if (!same(c, stream, revision, stamp)) return;
                                Set<String> connected = new HashSet<>(), capable = new HashSet<>();
                                for (Node n : info.getNodes()) capable.add(n.getId());
                                CrewLifeV2Journal j = read(c);
                                for (Node n : nodes) {
                                    connected.add(n.getId());
                                    JSONObject known = j.data.getJSONObject("nodes").optJSONObject(n.getId());
                                    if (known == null || !known.optBoolean("ready")) {
                                        JSONObject request = j.request(n.getId(), "reset");
                                        save(c, j); // durable challenge BEFORE send
                                        if (capable.contains(n.getId())) send(c, n.getId(), j.control(request));
                                    }
                                }
                                save(c, j);
                                deleteLegacy(c);
                                if (!capable.containsAll(connected) || !j.ready(connected)) {
                                    callback.onResult(false, "peer_cleanup_pending", "Versão e limpeza de cada relógio precisam ser confirmadas.");
                                    schedule(c); return;
                                }
                                // Revalidate source expiry after asynchronous discovery, never renew it.
                                if (!same(c, stream, revision, stamp)) return;
                                Wearable.getDataClient(c).deleteDataItems(new Uri.Builder().scheme("wear").path(CrewLifeWatchPublisher.CREWLIFE_PATH).build())
                                    .addOnSuccessListener(deleted -> {
                                        synchronized (LOCK) {
                                            try {
                                                if (!same(c, stream, revision, stamp)) return;
                                                JSONObject finalCheck = CrewLifeV2Protocol.sanitize(new JSONObject(raw), WatchHealthConsent.read(c).categories(), System.currentTimeMillis());
                                                finalCheck.put("streamId", stream).put("revision", revision);
                                                put(c, finalCheck, stream, revision, stamp, callback);
                                            } catch (Exception invalid) { invalidate(c); callback.onResult(false, "expired_before_put", "Validade encerrada."); }
                                        }
                                    }).addOnFailureListener(error -> { schedule(c); callback.onResult(false, "legacy_delete_pending", "Remoção do item legado pendente."); });
                            }
                        } catch (Exception error) { callback.onResult(false, "crewlife_v2_unavailable", "Saúde indisponível."); }
                    }).addOnFailureListener(error -> {
                        deleteLegacy(c); schedule(c); callback.onResult(false, "capability_unconfirmed", "Capacidade remota não confirmada.");
                    })
            ).addOnFailureListener(error -> {
                deleteLegacy(c); schedule(c); callback.onResult(false, "peer_unavailable", "Relógio indisponível.");
            });
        } catch (Exception invalid) {
            invalidate(c);
            callback.onResult(false, "invalid_crewlife_v2", "Validade de saúde não comprovada.");
        }
    }

    /** Health-only invalidation: never mutates routine or operational stores. */
    public static void invalidate(Context context) {
        Context c = context.getApplicationContext();
        synchronized (LOCK) {
            try {
                CrewLifeV2Journal j = read(c);
                if (!j.revoked()) j.invalidate();
                save(c, j);
                putTombstone(c, j);
                deleteLegacy(c);
            } catch (Exception unavailable) { diskFailed = true; }
        }
        retry(c);
    }

    /** Reconnect/process restart resumes persisted challenges; health payload is never retained. */
    public static void retry(Context context) {
        Context c = context.getApplicationContext();
        Wearable.getNodeClient(c).getConnectedNodes().addOnSuccessListener(nodes ->
            Wearable.getCapabilityClient(c).getCapability(CrewLifeV2Protocol.CAPABILITY, CapabilityClient.FILTER_ALL)
                .addOnSuccessListener(info -> {
                    try {
                        synchronized (LOCK) {
                            CrewLifeV2Journal j = read(c);
                            save(c, j); // persist even the initial empty journal before transport
                            if (j.revoked()) putTombstone(c, j);
                            Set<String> capable = new HashSet<>();
                            for (Node n : info.getNodes()) capable.add(n.getId());
                            for (Node n : nodes) {
                                JSONObject existing = j.data.getJSONObject("nodes").optJSONObject(n.getId());
                                if (existing != null && existing.optBoolean("cleared")) continue;
                                JSONObject request = j.request(n.getId(), j.revoked() ? "revoke" : "reset");
                                save(c, j);
                                if (capable.contains(n.getId())) send(c, n.getId(), j.control(request));
                            }
                            save(c, j); deleteLegacy(c);
                            if (!j.allCleared()) schedule(c);
                        }
                    } catch (Exception ignored) { /* no remote success claim */ }
                }).addOnFailureListener(error -> schedule(c))
        ).addOnFailureListener(error -> schedule(c));
    }

    public static void receiveAck(Context context, String node, byte[] bytes) {
        if (bytes == null || bytes.length > 4096) return;
        Context c = context.getApplicationContext();
        synchronized (LOCK) {
            try {
                CrewLifeV2Journal j = read(c);
                JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                if ("challenge".equals(message.optString("op"))) {
                    if (!j.challenge(node, message)) return;
                    // A reset for a revoked local owner must never be sent after logout.
                    JSONObject request = j.data.getJSONObject("nodes").getJSONObject(node);
                    if ("reset".equals(request.optString("op"))
                            && (j.revoked() || !WatchHealthConsent.read(c).allowsAnyHealth()
                                || WatchHealthConsent.isRevocationPending(c))) return;
                    save(c, j); // the Wear nonce is durable BEFORE replying with reset/revoke
                    send(c, node, j.control(request));
                    return;
                }
                if (!j.ack(node, message)) return;
                save(c, j); retries = 0;
                // Full consent revocation is cleared only by publisher's separate routine cleanup.
                c.sendBroadcast(new android.content.Intent(MainActivity.ACTION_WATCH_SYNC_REQUEST).setPackage(c.getPackageName()));
            } catch (Exception ignored) { /* unknown/stale/wrong-node ACK cannot authorize values */ }
        }
    }
    static boolean remoteCleared(Context c) {
        synchronized (LOCK) { try { return read(c).revoked() && read(c).allCleared(); } catch (Exception e) { return false; } }
    }
    private static void send(Context c, String node, JSONObject control) {
        Wearable.getMessageClient(c).sendMessage(node, CrewLifeV2Protocol.CONTROL_PATH, control.toString().getBytes(StandardCharsets.UTF_8))
                .addOnFailureListener(error -> schedule(c));
    }
    private static void deleteLegacy(Context c) {
        Wearable.getDataClient(c).deleteDataItems(new Uri.Builder().scheme("wear").path(CrewLifeWatchPublisher.CREWLIFE_PATH).build())
                .addOnFailureListener(error -> schedule(c));
    }
    private static void put(Context c, JSONObject payload, String stream, long revision, String stamp, CrewLifeWatchPublisher.Callback callback) throws Exception {
        // Called under LOCK after all owner/consent/ACK checks. Async completion is fenced too.
        PutDataMapRequest request = PutDataMapRequest.create(CrewLifeV2Protocol.PATH);
        request.getDataMap().putString(CrewLifeV2Protocol.DATA_KEY, payload.toString());
        Wearable.getDataClient(c).putDataItem(request.asPutDataRequest().setUrgent()).addOnSuccessListener(item -> {
            synchronized (LOCK) {
                try {
                    if (!same(c, stream, revision, stamp)) {
                        CrewLifeV2Journal current = read(c);
                        if (current.revoked()) putTombstone(c, current);
                        callback.onResult(false, "superseded", "Publicação substituída; confirmação remota pendente."); return;
                    }
                    callback.onResult(true, "queued_v2", "Item recebido pelo Data Layer; aplicação no relógio não confirmada.");
                } catch (Exception ignored) { callback.onResult(false, "journal_unavailable", "Estado indisponível."); }
            }
        }).addOnFailureListener(error -> { schedule(c); callback.onResult(false, "data_layer_error", "Envio não confirmado."); });
    }
    private static void putTombstone(Context c, CrewLifeV2Journal j) throws Exception {
        PutDataMapRequest request = PutDataMapRequest.create(CrewLifeV2Protocol.PATH);
        request.getDataMap().putString(CrewLifeV2Protocol.DATA_KEY, j.tombstone().toString());
        Wearable.getDataClient(c).putDataItem(request.asPutDataRequest().setUrgent()).addOnFailureListener(error -> schedule(c));
    }
    private static void schedule(Context c) {
        synchronized (LOCK) {
            if (retryScheduled || retries >= 4) return;
            long delay = new long[]{1000, 5000, 30000, 120000}[retries++];
            retryScheduled = true;
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                synchronized (LOCK) { retryScheduled = false; }
                retry(c);
            }, delay);
        }
    }
}
