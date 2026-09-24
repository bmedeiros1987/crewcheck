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

    private final Context context;
    private final SharedPreferences preferences;

    public WellbeingStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public synchronized CrewLifeSnapshot saveCrewLife(String rawJson) {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.fromJson(rawJson);
        try {
            write(CREWLIFE_IV, CREWLIFE_PAYLOAD, snapshot.toJson().toString());
        } catch (Exception error) {
            throw new IllegalStateException("Não foi possível proteger o CrewLife local.", error);
        }
        requestUpdate(CrewLifeComplicationService.class);
        return snapshot;
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

    public synchronized CrewLifeSnapshot loadCrewLife() {
        if (!WatchEntitlements.crewLife(context)) {
            clearCrewLife();
            return null;
        }
        String raw = read(CREWLIFE_IV, CREWLIFE_PAYLOAD);
        if (raw == null) return null;
        try {
            return CrewLifeSnapshot.fromJson(raw);
        } catch (Exception error) {
            clearCrewLife();
            return null;
        }
    }

    public synchronized RoutineSnapshot loadRoutine() {
        if (!WatchEntitlements.crewLife(context)) {
            clearRoutine();
            return null;
        }
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
    public synchronized void clearCrewLife() {
        preferences.edit().remove(CREWLIFE_IV).remove(CREWLIFE_PAYLOAD).apply();
        requestUpdate(CrewLifeComplicationService.class);
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
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        preferences.edit()
                .putString(ivKey, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(payloadKey, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .apply();
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
