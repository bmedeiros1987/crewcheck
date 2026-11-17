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

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Cache AES-GCM para bem-estar e rotina, separado do operacional de propósito.
 *
 * Chave própria no Keystore: revogar saúde (apagar este store) não derruba a
 * escala, e vice-versa. Mesmo desenho do {@link SecureSnapshotStore}.
 */
public final class WellbeingStore {
    private static final String PREFS = "crewcheck_watch_wellbeing";
    private static final String KEY_ALIAS = "crewcheck_watch_wellbeing_aes_v1";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private static final String CREWLIFE_PAYLOAD = "crewlife_payload_v1";
    private static final String CREWLIFE_IV = "crewlife_iv_v1";
    private static final String ROUTINE_PAYLOAD = "routine_payload_v1";
    private static final String ROUTINE_IV = "routine_iv_v1";

    private static final String V2_PAYLOAD = "crewlife_payload_v2";
    private static final String V2_IV = "crewlife_iv_v2";
    private static final String FENCE = "crewlife_fence_v2";
    private static final String MIGRATED = "crewlife_migrated_v2";
    private static final Object HEALTH_LOCK = new Object();
    private final Context context;
    private final SharedPreferences preferences;

    public WellbeingStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Legacy input cannot prove source validity. It never replaces v2 or revives its old cache. */
    public void rejectLegacyCrewLife() {
        synchronized (HEALTH_LOCK) { migrateHealth(); }
    }

    public void registerChangeListener(SharedPreferences.OnSharedPreferenceChangeListener listener) {
        preferences.registerOnSharedPreferenceChangeListener(listener);
    }
    public void unregisterChangeListener(SharedPreferences.OnSharedPreferenceChangeListener listener) {
        preferences.unregisterOnSharedPreferenceChangeListener(listener);
    }
    private void migrateHealth() {
        if (preferences.getBoolean(MIGRATED, false)) return;
        if (!preferences.edit().remove(CREWLIFE_IV).remove(CREWLIFE_PAYLOAD)
                .remove(V2_IV).remove(V2_PAYLOAD).putBoolean(MIGRATED, true).commit())
            throw new IllegalStateException("CrewLife migration not persisted.");
        requestUpdate(CrewLifeComplicationService.class);
    }
    private org.json.JSONObject fence() throws Exception {
        try {
            org.json.JSONObject state=new org.json.JSONObject(preferences.getString(FENCE, "{}"));
            boolean hasPayload=preferences.contains(V2_PAYLOAD),hasIv=preferences.contains(V2_IV);
            boolean hasLegacy=preferences.contains(CREWLIFE_PAYLOAD)||preferences.contains(CREWLIFE_IV);
            CrewLifeFence.validateJournal(state);
            if(hasLegacy || hasPayload!=hasIv || ((hasPayload||hasIv)&&!CrewLifeFence.canReadCiphertext(state)))
                throw new IllegalArgumentException("Ciphertext and receiver journal disagree.");
            return state;
        } catch (org.json.JSONException | IllegalArgumentException corruptJournal) {
            // Missing/partial/corrupt journal cannot infer a generation from ciphertext.
            SharedPreferences.Editor edit=preferences.edit().remove(FENCE).remove(V2_IV).remove(V2_PAYLOAD)
                    .remove(CREWLIFE_IV).remove(CREWLIFE_PAYLOAD);
            if(!commitHealth(edit)) throw new IllegalStateException("CrewLife journal recovery not persisted.");
            requestUpdate(CrewLifeComplicationService.class);
            return new org.json.JSONObject();
        }
    }
    /** ACK is returned only after one durable transaction clears values and persists the fence. */
    public String applyCrewLifeControl(String raw, String sourceNode) {
        synchronized (HEALTH_LOCK) {
            migrateHealth();
            try {
                CrewLifeFence result = CrewLifeFence.control(fence(), raw, sourceNode);
                persistHealth(result);
                return result.ack;
            } catch (Exception error) {
                clearCrewLife();
                return null;
            }
        }
    }
    public void applyCrewLifeData(String raw, String sourceNode, long now) {
        synchronized (HEALTH_LOCK) {
            migrateHealth();
            try { persistHealth(CrewLifeFence.data(fence(), raw, sourceNode, now)); }
            catch (Exception error) { clearCrewLife(); }
        }
    }
    private boolean commitHealth(SharedPreferences.Editor edit) { return edit.commit(); }
    private void persistHealth(CrewLifeFence result) throws Exception {
        SharedPreferences.Editor edit = preferences.edit().putString(FENCE, result.state.toString());
        if (result.clearValues) edit.remove(V2_IV).remove(V2_PAYLOAD).remove(CREWLIFE_IV).remove(CREWLIFE_PAYLOAD);
        if (result.snapshot != null) putEncrypted(edit, V2_IV, V2_PAYLOAD, result.snapshot.toJson().toString());
        if (!commitHealth(edit)) throw new IllegalStateException("CrewLife state not persisted.");
        requestUpdate(CrewLifeComplicationService.class);
    }

    public synchronized RoutineSnapshot saveRoutine(String rawJson) {
        RoutineSnapshot snapshot = RoutineSnapshot.fromJson(rawJson);
        try {
            write(ROUTINE_IV, ROUTINE_PAYLOAD, snapshot.toJson().toString());
        } catch (Exception error) {
            throw new IllegalStateException("Não foi possível proteger a rotina local.", error);
        }
        requestUpdate(RoutineComplicationService.class);
        return snapshot;
    }

    public CrewLifeSnapshot loadCrewLife() {
        synchronized (HEALTH_LOCK) {
            migrateHealth();
            String raw = read(V2_IV, V2_PAYLOAD);
            if (raw == null) return null;
            try {
                long now = System.currentTimeMillis();
                CrewLifeSnapshot snapshot = CrewLifeSnapshot.fromJson(raw, now);
                org.json.JSONObject fence = fence();
                if (!snapshot.streamId.equals(fence.optString("streamId")) || snapshot.revision != fence.optLong("revision")
                        || fence.optBoolean("revoked") || !snapshot.hasAny(now)) {
                    clearCrewLife();
                    return null;
                }
                return snapshot;
            } catch (Exception error) { clearCrewLife(); return null; }
        }
    }

    public synchronized RoutineSnapshot loadRoutine() {
        String raw = read(ROUTINE_IV, ROUTINE_PAYLOAD);
        if (raw == null) return null;
        try {
            return RoutineSnapshot.fromJson(raw);
        } catch (Exception error) {
            clearRoutine();
            return null;
        }
    }

    /** Revogar bem-estar não pode derrubar a escala: só este store é apagado. */
    public void clearCrewLife() {
        synchronized (HEALTH_LOCK) {
            if (!preferences.edit().remove(CREWLIFE_IV).remove(CREWLIFE_PAYLOAD)
                    .remove(V2_IV).remove(V2_PAYLOAD).commit())
                throw new IllegalStateException("CrewLife cleanup not persisted.");
            requestUpdate(CrewLifeComplicationService.class);
        }
    }

    public synchronized void clearRoutine() {
        preferences.edit().remove(ROUTINE_IV).remove(ROUTINE_PAYLOAD).apply();
        requestUpdate(RoutineComplicationService.class);
    }

    public synchronized void clearAll() {
        clearCrewLife();
        clearRoutine();
    }

    private void write(String ivKey, String payloadKey, String plain) throws Exception {
        SharedPreferences.Editor edit = preferences.edit();
        putEncrypted(edit, ivKey, payloadKey, plain);
        edit.apply();
    }
    private void putEncrypted(SharedPreferences.Editor edit, String ivKey, String payloadKey, String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        edit.putString(ivKey, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(payloadKey, Base64.encodeToString(encrypted, Base64.NO_WRAP));
    }

    private String read(String ivKey, String payloadKey) {
        String ivText = preferences.getString(ivKey, null);
        String payloadText = preferences.getString(payloadKey, null);
        if (ivText == null || payloadText == null) return null;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            byte[] iv = Base64.decode(ivText, Base64.NO_WRAP);
            byte[] payload = Base64.decode(payloadText, Base64.NO_WRAP);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(payload), StandardCharsets.UTF_8);
        } catch (Exception error) {
            return null;
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

    private void requestUpdate(Class<?> service) {
        try {
            ComplicationDataSourceUpdateRequester.create(context, new ComponentName(context, service))
                    .requestUpdateAll();
        } catch (Exception ignored) {
            // Funciona igual quando nenhuma complicação está configurada.
        }
    }
}
