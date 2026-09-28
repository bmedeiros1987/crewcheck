package com.crewcheck.life;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class LifeSummaryStore {
    private static final String PREFS = "crewlife_companion_summary";
    private static final String KEY_CIPHERTEXT = "summary_ciphertext";
    private static final String KEY_IV = "summary_iv";
    private static final String LEGACY_JSON = "summary_json";
    private static final String KEY_ALIAS = "crewlife_companion_summary_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private LifeSummaryStore() {}

    static void save(Context context, JSONObject summary) {
        if (summary == null) return;
        try {
            SecretKey key = getOrCreateKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encrypted = cipher.doFinal(summary.toString().getBytes(StandardCharsets.UTF_8));

            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .putString(KEY_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .remove(LEGACY_JSON)
                    .apply();
        } catch (Exception ignored) {
            // Fail closed: never persist sensitive summary in plaintext when encryption fails.
        }
    }

    static String read(Context context) {
        try {
            String ciphertext = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_CIPHERTEXT, "");
            String iv = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_IV, "");

            if (!ciphertext.isBlank() && !iv.isBlank()) {
                SecretKey key = getOrCreateKey();
                Cipher cipher = Cipher.getInstance(TRANSFORMATION);
                cipher.init(
                        Cipher.DECRYPT_MODE,
                        key,
                        new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
                );
                byte[] plain = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP));
                return new String(plain, StandardCharsets.UTF_8);
            }

            // One-time compatibility migration from early development builds.
            String legacy = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(LEGACY_JSON, "");
            if (legacy != null && !legacy.isBlank()) {
                try {
                    save(context, new JSONObject(legacy));
                    return legacy;
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {
            clear(context);
        }
        return "";
    }

    static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {}
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
        );
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}
