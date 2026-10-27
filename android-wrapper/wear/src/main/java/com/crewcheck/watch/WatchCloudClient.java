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

    public enum Result { UPDATED, UNCHANGED, EMPTY, UNPAIRED, NOT_PAIRED_HERE, FAILED }

    /** Resposta HTTP mínima; os testes trocam a rede por uma implementação falsa. */
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
        String credential = credentials.load();
        if (credential == null) return Result.NOT_PAIRED_HERE;
        try {
            Response response = transport.get(SNAPSHOT_URL, "Bearer " + credential, credentials.etag());
            credentials.markFetched(nowEpochMs);
            switch (response.status) {
                case 304:
                    return Result.UNCHANGED;
                case 204:
                    return Result.EMPTY;
                case 401:
                    // Logout, troca de conta ou novo pareamento: esquecer credencial e escala.
                    credentials.clear();
                    new SecureSnapshotStore(app).clear();
                    WatchCloudSyncJob.cancel(app);
                    return Result.UNPAIRED;
                case 200:
                    break;
                default:
                    return Result.FAILED;
            }
            JSONObject payload = new JSONObject(response.body == null ? "" : response.body);
            JSONObject snapshot = payload.optJSONObject("snapshot");
            if (snapshot == null) return Result.FAILED;
            String json = snapshot.toString();
            if (json.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_SNAPSHOT_BYTES) return Result.FAILED;
            SecureSnapshotStore store = new SecureSnapshotStore(app);
            WatchContextSnapshot current = store.load();
            if (current != null && current.generatedAtEpochMs >= snapshot.optLong("generatedAtEpochMs", 0L)) {
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
