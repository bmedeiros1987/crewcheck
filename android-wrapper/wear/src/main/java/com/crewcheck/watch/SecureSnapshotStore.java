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

    public synchronized WatchContextSnapshot save(String rawJson) {
        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(rawJson);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(snapshot.toJson().toString().getBytes(StandardCharsets.UTF_8));
            preferences.edit()
                    .putString(KEY_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .putString(KEY_PAYLOAD, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .apply();
            requestComplicationUpdate();
            return snapshot;
        } catch (Exception error) {
            throw new IllegalStateException("Não foi possível proteger o snapshot local.", error);
        }
    }

    public synchronized WatchContextSnapshot load() {
        String ivText = preferences.getString(KEY_IV, null);
        String payloadText = preferences.getString(KEY_PAYLOAD, null);
        if (ivText == null || payloadText == null) return null;

        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            byte[] iv = Base64.decode(ivText, Base64.NO_WRAP);
            byte[] payload = Base64.decode(payloadText, Base64.NO_WRAP);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            String raw = new String(cipher.doFinal(payload), StandardCharsets.UTF_8);
            return WatchContextSnapshot.fromJson(raw);
        } catch (Exception error) {
            clear();
            return null;
        }
    }

    public synchronized void clear() {
        preferences.edit().remove(KEY_IV).remove(KEY_PAYLOAD).apply();
        requestComplicationUpdate();
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

    private void requestComplicationUpdate() {
        try {
            ComplicationDataSourceUpdateRequester.create(
                    context,
                    new ComponentName(context, CrewCheckComplicationService.class)
            ).requestUpdateAll();
        } catch (Exception ignored) {
            // The app still works when no complication is configured.
        }
    }
}
