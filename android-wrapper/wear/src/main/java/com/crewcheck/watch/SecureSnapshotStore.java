package com.crewcheck.watch;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.MessageDigest;
import java.util.Set;
import org.json.JSONObject;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private AES-GCM cache backed by a non-exportable Android Keystore key. */
public final class SecureSnapshotStore {
    private static final String PREFS = "crewcheck_watch_secure";
    private static final String KEY_PAYLOAD = "snapshot_payload_v1";
    private static final String KEY_IV = "snapshot_iv_v1";
    private static final String KEY_ALIAS = "crewcheck_watch_snapshot_aes_v1";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final Context context;
    private final SharedPreferences preferences;

    public SecureSnapshotStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static final Object LOCK = new Object();
    private static boolean writeUncertain;
    private static final String JOURNAL = "operational_transport_journal_v1";

    /** Legacy raw network writes cannot bypass transport admission. */
    public WatchContextSnapshot save(String rawJson) {
        throw new IllegalStateException("Operational envelope required");
    }
    private JSONObject readJournal() {
        if(writeUncertain) throw new IllegalStateException("Operational journal persistence uncertain");
        try {
            String sealed = preferences.getString(JOURNAL, null);
            if (sealed == null) throw new IllegalStateException("No journal");
            JSONObject encrypted = new JSONObject(sealed);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128,
                    Base64.decode(encrypted.getString("iv"), Base64.NO_WRAP)));
            JSONObject journal = new JSONObject(new String(cipher.doFinal(
                    Base64.decode(encrypted.getString("payload"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
            if (journal.getInt("version") != 1) throw new IllegalStateException("Journal version");
            decodeState(journal); // Validate the complete fence before exposing cached data.
            return journal;
        } catch (Exception error) {
            if (!preferences.edit().remove(JOURNAL).remove(KEY_IV).remove(KEY_PAYLOAD).commit()) {
                writeUncertain=true;
                throw new IllegalStateException("Cannot invalidate journal", error);
            }
            return new JSONObject();
        }
    }
    private static OperationalReplayFence.Binding binding(JSONObject o) throws Exception {
        return o == null ? null : new OperationalReplayFence.Binding(o.getString("node"),
                o.getString("request"), o.getString("lease"), o.getString("challenge"));
    }
    private static JSONObject encodeBinding(OperationalReplayFence.Binding b) throws Exception {
        return b == null ? null : new JSONObject().put("node",b.node()).put("request",b.request())
                .put("lease",b.lease()).put("challenge",b.challenge());
    }
    private static OperationalReplayFence.State decodeState(JSONObject j) throws Exception {
        if (!j.has("version")) return OperationalReplayFence.State.empty();
        return new OperationalReplayFence.State(binding(j.optJSONObject("active")),
                binding(j.optJSONObject("pending")), Long.parseLong(j.getString("revision")),
                j.getString("digest"), j.getBoolean("revoked"), decodeRevoke(j.optJSONObject("lastRevoke")));
    }
    private static OperationalReplayFence.Revocation decodeRevoke(JSONObject o) throws Exception {
        return o==null?null:new OperationalReplayFence.Revocation(o.getString("node"),o.getString("leaseId"),
                Long.parseLong(o.getString("revision")),o.getString("requestId"));
    }
    private static JSONObject encodeRevoke(OperationalReplayFence.Revocation r) throws Exception {
        return r==null?null:new JSONObject().put("node",r.node()).put("leaseId",r.lease())
                .put("revision",Long.toString(r.revision())).put("requestId",r.request());
    }
    public String revoke(String node,String raw) throws Exception {
        synchronized(LOCK) {
            JSONObject in=new JSONObject(raw);
            if(in.length()!=5 || in.getInt("transportVersion")!=1 || !"revoke".equals(in.getString("operation"))) return null;
            String revision=in.getString("revision");
            if(!revision.matches("[1-9][0-9]{0,18}")) return null;
            OperationalReplayFence.Revocation command=new OperationalReplayFence.Revocation(node,
                    in.getString("leaseId"),Long.parseLong(revision),in.getString("requestId"));
            StringBuilder digest=new StringBuilder();
            for(byte b:MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)))
                digest.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
            OperationalReplayFence.State prior=decodeState(readJournal());
            OperationalReplayFence.RevokeResult result=fence(readJournal()).revoke(command,digest.toString());
            if(result==OperationalReplayFence.RevokeResult.REJECTED) return null;
            if(result==OperationalReplayFence.RevokeResult.CLEARED && !command.equals(prior.lastRevoke())) {
                requestComplicationUpdate();
                // Post only after durable removal; do not replay operational alerts.
                WatchNotificationCenter.clearOperational(context);
            }
            return in.put("status",result==OperationalReplayFence.RevokeResult.CLEARED?"cleared":"not_current").toString();
        }
    }
    private OperationalReplayFence fence(JSONObject journal) throws Exception {
        return new OperationalReplayFence(decodeState(journal), (next, raw) -> {
            JSONObject j = new JSONObject().put("version",1).put("active",encodeBinding(next.active()))
                    .put("pending",encodeBinding(next.pending())).put("revision",Long.toString(next.revision()))
                    .put("digest",next.digest()).put("revoked",next.revoked()).put("lastRevoke",encodeRevoke(next.lastRevoke()));
            String snapshot = OperationalReplayFence.KEEP_CACHE.equals(raw)
                    ? journal.optString("snapshot", "") : raw;
            if (snapshot != null && !snapshot.isEmpty()) j.put("snapshot",snapshot);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE,getOrCreateKey());
            String sealed = new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
                    .put("payload",Base64.encodeToString(cipher.doFinal(j.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP)).toString();
            if (!preferences.edit().putString(JOURNAL,sealed).remove(KEY_IV).remove(KEY_PAYLOAD).commit()) {
                writeUncertain=true;
                throw new IllegalStateException("Journal commit uncertain; no authority exposed");
            }
        },new SecureRandom());
    }
    public void connectionChanged(Set<String> connected) throws Exception {
        synchronized (LOCK) { fence(readJournal()).connectionChanged(connected); }
    }
    public String challenge(String node, String raw, Set<String> connected) throws Exception {
        synchronized (LOCK) {
            JSONObject in = new JSONObject(raw);
            validateHandshake(in);
            OperationalReplayFence.Binding b = fence(readJournal()).challenge(node,
                    in.getString("requestId"),in.getString("leaseId"),connected);
            return b == null ? null : handshake(b).toString();
        }
    }
    public String admit(String node, String raw, Set<String> connected) throws Exception {
        synchronized (LOCK) {
            JSONObject in = new JSONObject(raw); validateHandshake(in);
            OperationalReplayFence.Binding b = new OperationalReplayFence.Binding(node,
                    in.getString("requestId"),in.getString("leaseId"),in.getString("receiverChallenge"));
            OperationalReplayFence.Result result = fence(readJournal()).admit(b,connected);
            if (result == OperationalReplayFence.Result.REJECTED) return null;
            if (result == OperationalReplayFence.Result.ACCEPTED) requestComplicationUpdate();
            return handshake(b).put("status","admitted").toString();
        }
    }
    private static void validateHandshake(JSONObject o) throws Exception {
        if (o.getInt("transportVersion")!=1 || !"admit".equals(o.getString("operation")))
            throw new IllegalArgumentException("Handshake version");
    }
    private static JSONObject handshake(OperationalReplayFence.Binding b) throws Exception {
        return new JSONObject().put("transportVersion",1).put("operation","admit")
                .put("requestId",b.request()).put("leaseId",b.lease()).put("receiverChallenge",b.challenge());
    }
    public OperationalReplayFence.Result accept(String node, String raw, String envelope) throws Exception {
        synchronized (LOCK) {
            if (raw == null || envelope == null || raw.getBytes(StandardCharsets.UTF_8).length > WatchContract.MAX_SNAPSHOT_BYTES
                    || envelope.length() > 1024) return OperationalReplayFence.Result.REJECTED;
            JSONObject e = new JSONObject(envelope);
            if (e.getInt("transportVersion")!=1) return OperationalReplayFence.Result.REJECTED;
            String revision = e.getString("revision");
            if (!revision.matches("[1-9][0-9]{0,18}")) return OperationalReplayFence.Result.REJECTED;
            StringBuilder digestBuilder = new StringBuilder();
            for(byte value:MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)))
                digestBuilder.append(String.format(java.util.Locale.ROOT,"%02x",value & 255));
            String digest=digestBuilder.toString();
            if (!digest.equals(e.getString("snapshotSha256"))) return OperationalReplayFence.Result.REJECTED;
            WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(raw);
            OperationalReplayFence.Result result = fence(readJournal()).snapshot(node,e.getString("leaseId"),
                    Long.parseLong(revision),digest,raw,snapshot.generatedAtEpochMs,snapshot.validUntilEpochMs,System.currentTimeMillis());
            if (result == OperationalReplayFence.Result.ACCEPTED) requestComplicationUpdate();
            return result;
        }
    }
    public String acceptedRevisionKey() {
        synchronized (LOCK) {
            try {
                OperationalReplayFence.State state=decodeState(readJournal());
                return state.active()==null || state.revoked() || state.revision()==0 ? ""
                        :state.active().lease()+":"+state.revision();
            }catch(Exception error){return "";}
        }
    }
    public WatchContextSnapshot load() {
        synchronized (LOCK) {
            try {
                JSONObject j=readJournal();
                OperationalReplayFence.State state=decodeState(j);
                if (state.active()==null || state.revoked()) return null;
                String raw=j.optString("snapshot", "");
                if(raw.isEmpty()) return null;
                WatchContextSnapshot snapshot=WatchContextSnapshot.fromJson(raw);
                return snapshot; // Existing UI/complications apply original expiry to hide stale facts.
            } catch(Exception error) { return null; }
        }
    }

    public void registerChangeListener(SharedPreferences.OnSharedPreferenceChangeListener listener) {
        preferences.registerOnSharedPreferenceChangeListener(listener);
    }
    public void unregisterChangeListener(SharedPreferences.OnSharedPreferenceChangeListener listener) {
        preferences.unregisterOnSharedPreferenceChangeListener(listener);
    }

    public void clear() {
        synchronized (LOCK) {
            try { fence(readJournal()).clear(); requestComplicationUpdate(); }
            catch(Exception error) { throw new IllegalStateException("Cannot clear operational cache",error); }
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    /**
     * Refresca todas as fontes que leem a projeção operacional.
     *
     * Cada provider é uma fonte de dados distinta no seletor do Wear OS, então cada um precisa
     * ser acordado por ComponentName. CrewLife e Rotina ficam de fora de propósito: mudança na
     * escala não deve provocar leitura do canal de saúde.
     */
    private void requestComplicationUpdate() {
        Class<?>[] providers = {
                CrewCheckComplicationService.class,
                NextStepComplicationService.class,
                GateComplicationService.class
        };
        for (Class<?> provider : providers) {
            try {
                ComplicationDataSourceUpdateRequester.create(
                        context,
                        new ComponentName(context, provider)
                ).requestUpdateAll();
            } catch (Exception ignored) {
                // The app still works when no complication is configured.
            }
        }
    }
}
