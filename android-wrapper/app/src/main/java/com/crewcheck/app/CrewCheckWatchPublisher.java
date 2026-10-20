package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Sends only an allow-listed, presentation-ready roster projection to the paired watch.
 * The watch never receives login tokens, CPF, e-mail, crew name or hotel room numbers.
 */
public final class CrewCheckWatchPublisher {
    public static final String SNAPSHOT_PATH = "/crewcheck/watch/context/v1";
    public static final String REQUEST_SYNC_PATH = "/crewcheck/watch/request-sync/v1";
    public static final String DATA_KEY_SNAPSHOT_JSON = "snapshotJson";

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

    private static final Object LOCK=new Object();
    private static final String JOURNAL="operational_transport_v1";
    private static final String ROOT="/crewcheck/watch/session/";
    private static final String CHALLENGE_REQUEST=ROOT+"challenge-request/v1";
    private static final String CHALLENGE=ROOT+"challenge/v1";
    private static final String ADMIT=ROOT+"admit/v1";
    private static final String ACK=ROOT+"ack/v1";
    private static final String REVOKE=ROOT+"revoke/v1";
    private static final String REVOKE_ACK=ROOT+"revoke-ack/v1";
    private static boolean persistenceUncertain;
    private static String runtimeLease="";
    private static final String ENVELOPE="transportEnvelopeJson";
    private static String document="";
    private static String nonce() {
        byte[] bytes=new byte[32]; new java.security.SecureRandom().nextBytes(bytes);
        StringBuilder out=new StringBuilder();
        for(byte b:bytes) out.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
        return out.toString();
    }
    private static JSONObject state(Context c) throws Exception {
        String raw=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(JOURNAL,null);
        if(raw==null) return new JSONObject().put("version",1).put("outbox",new JSONArray());
        JSONObject j=new JSONObject(raw);
        if(j.getInt("version")!=1 || j.optJSONArray("outbox")==null || j.getJSONArray("outbox").length()>16
                || (j.has("leaseId") && !j.getString("leaseId").matches("[0-9a-f]{64}")))
            throw new IllegalStateException("Invalid phone journal");
        return j;
    }
    private static void commit(Context c,JSONObject j) {
        if(!c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(JOURNAL,j.toString())
                .remove(LAST_SNAPSHOT).commit()) {
            persistenceUncertain=true; document="";
            throw new IllegalStateException("Phone journal commit uncertain; replay blocked");
        }
    }
    public static boolean revoke(Context context,String lease) {
        synchronized(LOCK) {
            try {
                JSONObject j=state(context);
                if(lease!=null && !lease.equals(j.optString("leaseId"))) return false;
                if(!j.optBoolean("active",false)) {retryRevocations(context);return true;}
                JSONArray outbox=j.getJSONArray("outbox");
                if(outbox.length()>=16) throw new IllegalStateException("Reserved revoke capacity missing");
                long revision=Math.addExact(Long.parseLong(j.getString("revision")),1);
                // Even a pending admission might have reached the receiver before its ACK.
                String node=j.optString("node", "");
                if(!node.isEmpty()) {
                    String command=new JSONObject().put("transportVersion",1).put("operation","revoke")
                            .put("leaseId",j.getString("leaseId")).put("revision",Long.toString(revision))
                            .put("requestId",nonce()).toString();
                    outbox.put(new JSONObject().put("node",node).put("command",command));
                }
                j.put("revision",Long.toString(revision)).put("active",false).put("admitted",false);
                j.remove("snapshot");j.remove("envelope");
                commit(context,j);
                retryRevocations(context);
                return true;
            } catch(Exception error) {
                persistenceUncertain=true;document="";
                return false;
            }
        }
    }
    public static void retryRevocations(Context c) {
        synchronized(LOCK) {
            if(persistenceUncertain) return;
            try {
                JSONArray entries=state(c).getJSONArray("outbox");
                for(int i=0;i<entries.length();i++) {
                    JSONObject entry=entries.getJSONObject(i);
                    Wearable.getMessageClient(c).sendMessage(entry.getString("node"),REVOKE,
                            entry.getString("command").getBytes(StandardCharsets.UTF_8));
                }
            }catch(Exception ignored){}
        }
    }
    private static void revokeAck(Context c,String node,byte[] bytes) {
        synchronized(LOCK) {
            if(persistenceUncertain || bytes==null || bytes.length>1024) return;
            try {
                JSONObject ack=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                if(ack.length()!=6 || ack.getInt("transportVersion")!=1 || !"revoke".equals(ack.getString("operation"))) return;
                String status=ack.getString("status");
                if(!"cleared".equals(status) && !"not_current".equals(status)) return;
                JSONObject j=state(c);JSONArray outbox=j.getJSONArray("outbox"),remaining=new JSONArray();
                boolean matched=false;
                for(int i=0;i<outbox.length();i++) {
                    JSONObject entry=outbox.getJSONObject(i),command=new JSONObject(entry.getString("command"));
                    boolean same=node.equals(entry.getString("node"))
                            &&command.getString("leaseId").equals(ack.getString("leaseId"))
                            &&command.getString("revision").equals(ack.getString("revision"))
                            &&command.getString("requestId").equals(ack.getString("requestId"));
                    if(same) matched=true;else remaining.put(entry);
                }
                if(!matched) return;
                j.put("outbox",remaining).put("lastRevokeDisposition",ack);
                commit(c,j);
            }catch(Exception ignored){}
        }
    }
    public static String localStatus(Context c) {
        synchronized(LOCK) {
            if(persistenceUncertain) return "persistence_uncertain";
            try {return state(c).getJSONArray("outbox").length()>=16?"pending_revocations_capacity":"local_only";}
            catch(Exception error){return "invalid_journal";}
        }
    }
    public static String navigation(Context c) {
        synchronized(LOCK) { revoke(c,null); document=persistenceUncertain?"":nonce(); return document; }
    }
    public static String admitHost(Context context,String doc) {
        synchronized(LOCK) {
            if(persistenceUncertain || doc==null || doc.isEmpty() || !doc.equals(document)) return "";
            try {
                JSONObject previous=state(context);
                if(previous.optBoolean("active",false) && !revoke(context,previous.getString("leaseId"))) return "";
                previous=state(context);
                if(previous.getJSONArray("outbox").length()>=16) return "";
                JSONObject j=new JSONObject().put("version",1).put("outbox",previous.getJSONArray("outbox"))
                        .put("active",true).put("leaseId",nonce()).put("document",doc)
                        .put("requestId",nonce()).put("revision","0").put("admitted",false);
                commit(context,j);
                runtimeLease=j.getString("leaseId");
                begin(context,j.getString("leaseId"));
                return j.getString("leaseId");
            } catch(Exception error) { return ""; }
        }
    }
    private static boolean live(JSONObject j,String lease) {
        return !persistenceUncertain && j.optBoolean("active",false) && lease!=null && lease.equals(j.optString("leaseId")) && !document.isEmpty()
                && document.equals(j.optString("document"));
    }
    private static void begin(Context c,String lease) {
        Context app=c.getApplicationContext();
        Wearable.getNodeClient(app).getConnectedNodes().addOnSuccessListener(nodes -> {
            synchronized(LOCK) {
                try {
                    JSONObject j=state(app);
                    if(!live(j,lease)) return;
                    if(nodes.size()!=1) { revoke(app,lease); return; }
                    String node=nodes.get(0).getId(); j.put("node",node); commit(app,j);
                    JSONObject request=new JSONObject().put("transportVersion",1).put("operation","admit")
                            .put("requestId",j.getString("requestId")).put("leaseId",lease);
                    Wearable.getMessageClient(app).sendMessage(node,CHALLENGE_REQUEST,
                            request.toString().getBytes(StandardCharsets.UTF_8));
                } catch(Exception ignored) {}
            }
        });
    }
    public static boolean sessionMessage(Context c,String node,String path,byte[] bytes) {
        if(REVOKE_ACK.equals(path)) {revokeAck(c,node,bytes);return true;}
        if(!CHALLENGE.equals(path) && !ACK.equals(path)) return false;
        if(bytes==null || bytes.length==0 || bytes.length>1024) return true;
        Wearable.getNodeClient(c).getConnectedNodes().addOnSuccessListener(nodes -> {
            synchronized(LOCK) {
                try {
                    JSONObject incoming=new JSONObject(new String(bytes,StandardCharsets.UTF_8)), j=state(c);
                    String lease=incoming.getString("leaseId");
                    if(!live(j,lease) || nodes.size()!=1 || !node.equals(nodes.get(0).getId())
                            || !node.equals(j.optString("node")) || incoming.getInt("transportVersion")!=1
                            || !"admit".equals(incoming.getString("operation"))
                            || !j.getString("requestId").equals(incoming.getString("requestId"))) return;
                    String challenge=incoming.getString("receiverChallenge");
                    if(!challenge.matches("[0-9a-f]{64}")) return;
                    if(CHALLENGE.equals(path)) {
                        j.put("receiverChallenge",challenge); commit(c,j);
                        Wearable.getMessageClient(c).sendMessage(node,ADMIT,bytes);
                    } else if(challenge.equals(j.optString("receiverChallenge"))
                            && "admitted".equals(incoming.optString("status"))) {
                        j.put("admitted",true); commit(c,j); resend(c,j);
                    }
                } catch(Exception ignored) {}
            }
        });
        return true;
    }
    public static void publish(Context context,String rawJson,String lease,Callback callback) {
        Callback cb=callback==null?(ok,code,message)->{}:callback;
        synchronized(LOCK) {
            try {
                JSONObject j=state(context);
                if(!live(j,lease)) { cb.onResult(false,"revoked_lease","Host admission required"); return; }
                String snapshot=sanitize(rawJson);
                JSONObject payload=new JSONObject(snapshot);
                if(payload.getLong("validUntilEpochMs")<=System.currentTimeMillis()
                        || payload.getLong("generatedAtEpochMs")>System.currentTimeMillis())
                    throw new IllegalArgumentException("Expired snapshot");
                long revision=Math.addExact(Long.parseLong(j.getString("revision")),1);
                StringBuilder digest=new StringBuilder();
                for(byte value:java.security.MessageDigest.getInstance("SHA-256").digest(snapshot.getBytes(StandardCharsets.UTF_8)))
                    digest.append(String.format(java.util.Locale.ROOT,"%02x",value & 255));
                String envelope=new JSONObject().put("transportVersion",1).put("leaseId",lease)
                        .put("revision",Long.toString(revision)).put("snapshotSha256",digest.toString()).toString();
                j.put("revision",Long.toString(revision)).put("snapshot",snapshot).put("envelope",envelope);
                commit(context,j);
                if(j.optBoolean("admitted",false)) resend(context,j);
                cb.onResult(true,"accepted_locally","Queued locally; not a remote receipt");
            } catch(Exception error) { cb.onResult(false,"invalid_snapshot",safeMessage(error)); }
        }
    }
    /** Old callers cannot silently acquire the current host lease. */
    public static void publish(Context context,String rawJson,Callback callback) {
        if(callback!=null) callback.onResult(false,"host_admission_required","Explicit captured lease required");
    }
    private static void resend(Context c,JSONObject j) throws Exception {
        if(persistenceUncertain || !runtimeLease.equals(j.optString("leaseId")) || !j.optBoolean("active",false) || !j.optBoolean("admitted",false) || !j.has("snapshot") || !j.has("envelope")) return;
        String raw=j.getString("snapshot");
        if(new JSONObject(raw).getLong("validUntilEpochMs")<=System.currentTimeMillis()) return;
        PutDataMapRequest request=PutDataMapRequest.create(SNAPSHOT_PATH);
        request.getDataMap().putString(DATA_KEY_SNAPSHOT_JSON,raw);
        request.getDataMap().putString(ENVELOPE,j.getString("envelope"));
        // Exact cached bytes/revision/dates: background replay never manufactures freshness.
        Wearable.getDataClient(c).putDataItem(request.asPutDataRequest().setUrgent());
    }
    public static void republishLast(Context context) {
        synchronized(LOCK) {
            try { retryRevocations(context); resend(context,state(context)); } catch(Exception ignored) {}
        }
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
