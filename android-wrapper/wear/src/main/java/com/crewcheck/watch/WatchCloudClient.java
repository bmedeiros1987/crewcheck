package com.crewcheck.watch;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Busca a projeção na nuvem quando o celular não está por perto. Uma requisição por vez,
 * com ETag: sem mudança o servidor responde 304 sem corpo. Nunca troca um snapshot mais
 * novo (por exemplo, recebido agora pelo Bluetooth) por um mais antigo da nuvem.
 */
public final class WatchCloudClient {
    /** Endereço fixo: a credencial vem do celular, o servidor não. */
    static final String SNAPSHOT_URL = "https://crewcheck.online/api/watch/cloud/snapshot";
    private static final int TIMEOUT_MS = 10_000;

    public enum Result { UPDATED, UNCHANGED, EMPTY, UNPAIRED, NOT_PAIRED_HERE, STALE, REJECTED, FAILED }

    /** Relógio do celular pode adiantar um pouco; mais que isso é geração futura. */
    static final long MAX_CLOCK_SKEW_MS = 5 * 60_000L;
    /** Mesma janela máxima que o celular usa ao montar a projeção (watchContext.validWindow). */
    static final long MAX_VALIDITY_MS = 6 * 60 * 60_000L;

    public interface Transport {
        Response get(String url, String authorization, String ifNoneMatch) throws Exception;
    }

    public static final class Response {
        final int status;
        final String etag;
        final String body;

        public Response(int status, String etag, String body) {
            this.status = status;
            this.etag = etag;
            this.body = body;
        }
    }

    static Transport transport = WatchCloudClient::httpGet;

    private WatchCloudClient() {
    }

    /** Bloqueante: chamar fora da thread principal. */
    public static Result fetch(Context context, long nowEpochMs) {
        Context app = context.getApplicationContext();
        WatchCloudCredentialStore credentials = new WatchCloudCredentialStore(app);
        WatchCloudCredentialStore.Pairing pairing = credentials.current();
        if (pairing == null) return Result.NOT_PAIRED_HERE;
        String etag = credentials.etag();
        Response response;
        try {
            response = transport.get(SNAPSHOT_URL, "Bearer " + pairing.credential, etag);
        } catch (Exception error) {
            return Result.FAILED;
        }
        // Tudo daqui em diante só vale para o pareamento que fez a requisição: logout ou
        // outra conta durante a rede tornam a resposta velha, inclusive um 401.
        synchronized (WatchCloudCredentialStore.LOCK) {
            if (!credentials.isCurrent(pairing.generation)) return Result.STALE;
            credentials.markFetched(nowEpochMs);
            switch (response.status) {
                case 304:
                    return Result.UNCHANGED;
                case 204:
                    return Result.EMPTY;
                case 401:
                    forgetPairing(app);
                    return Result.UNPAIRED;
                case 200:
                    break;
                default:
                    return Result.FAILED;
            }
            try {
                JSONObject payload = new JSONObject(response.body == null ? "" : response.body);
                JSONObject snapshot = payload.optJSONObject("snapshot");
                if (snapshot == null) return Result.FAILED;
                String json = snapshot.toString();
                if (json.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_SNAPSHOT_BYTES) return Result.REJECTED;
                long generatedAt = snapshot.optLong("generatedAtEpochMs", 0L);
                long validUntil = snapshot.optLong("validUntilEpochMs", 0L);
                if (generatedAt <= 0L || generatedAt > nowEpochMs + MAX_CLOCK_SKEW_MS
                        || validUntil < generatedAt || validUntil - generatedAt > MAX_VALIDITY_MS) return Result.REJECTED;
                // A escala da nuvem precisa ser da conta deste pareamento e passar pela regra de conta.
                if (!snapshot.optString("account", "").equals(pairing.owner)
                        || !WatchAccountGuard.admit(app, pairing.owner, generatedAt)) return Result.REJECTED;
                SecureSnapshotStore store = new SecureSnapshotStore(app);
                WatchContextSnapshot current = store.load();
                // Mesma conta: um resumo mais antigo da nuvem não troca o mais novo do Bluetooth.
                if (current != null && current.generatedAtEpochMs >= generatedAt) {
                    if (response.etag != null) credentials.saveEtag(response.etag);
                    return Result.UNCHANGED;
                }
                WatchContextSnapshot saved = store.save(json);
                if (response.etag != null) credentials.saveEtag(response.etag);
                WatchNotificationCenter.postForSnapshot(app, saved);
                return Result.UPDATED;
            } catch (Exception error) {
                return Result.FAILED;
            }
        }
    }

    /**
     * Credencial nova vinda do celular. A regra de conta roda antes de gravar: outra conta
     * (ou a primeira, sobre cache legado sem dono) apaga escala, avisos e o pareamento
     * anterior; em seguida agenda a periódica e uma busca já.
     */
    public static boolean acceptCredential(Context context, String credential) {
        Context app = context.getApplicationContext();
        java.util.regex.Matcher match = credential == null ? null : WatchCloudCredentialStore.CREDENTIAL.matcher(credential);
        if (match == null || !match.matches()) return false;
        synchronized (WatchCloudCredentialStore.LOCK) {
            WatchAccountGuard.credentialFor(app, match.group(1));
            if (new WatchCloudCredentialStore(app).save(credential) == WatchCloudCredentialStore.SaveResult.REJECTED) return false;
        }
        WatchCloudSyncJob.schedulePeriodic(app);
        WatchCloudSyncJob.fetchSoon(app);
        return true;
    }

    /** Logout, troca de conta ou credencial recusada: nada da conta fica no relógio. */
    public static void forgetPairing(Context context) {
        Context app = context.getApplicationContext();
        synchronized (WatchCloudCredentialStore.LOCK) {
            new WatchCloudCredentialStore(app).clear();
            new SecureSnapshotStore(app).clear();
            WatchNotificationCenter.clear(app);
            WatchCloudSyncJob.cancel(app);
        }
    }

    private static Response httpGet(String url, String authorization, String ifNoneMatch) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Authorization", authorization);
            connection.setRequestProperty("Accept", "application/json");
            if (ifNoneMatch != null) connection.setRequestProperty("If-None-Match", ifNoneMatch);
            int status = connection.getResponseCode();
            String body = null;
            if (status == 200) {
                try (InputStream input = connection.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[4096];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (out.size() + read > 64 * 1024) throw new IllegalStateException("Resposta grande demais.");
                        out.write(buffer, 0, read);
                    }
                    body = out.toString(StandardCharsets.UTF_8.name());
                }
            }
            return new Response(status, connection.getHeaderField("ETag"), body);
        } finally {
            connection.disconnect();
        }
    }
}
