package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private encrypted cache for normalized logistics facts. */
public final class CrewCheckMyCrewCareSecureStore {
    private static final String PREFS = "crewcheck_mycrewcare_v3_secure";
    private static final String KEY_ALIAS = "crewcheck_mycrewcare_v3_aes";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int MAX_BYTES = 256 * 1024;
    private final SharedPreferences preferences;

    public CrewCheckMyCrewCareSecureStore(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public synchronized boolean save(String accountId, String rawJson) {
        byte[] clear = rawJson == null ? new byte[0] : rawJson.getBytes(StandardCharsets.UTF_8);
        if (clear.length == 0 || clear.length > MAX_BYTES || !valid(accountId, rawJson)) return false;
        String suffix = suffix(accountId);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(suffix.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(clear);
            return preferences.edit()
                    .putString("iv_" + suffix, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .putString("payload_" + suffix, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .commit();
        } catch (Exception error) {
            return false;
        }
    }

    public synchronized String load(String accountId) {
        String suffix;
        try { suffix = suffix(accountId); } catch (RuntimeException error) { return null; }
        String iv = preferences.getString("iv_" + suffix, null);
        String payload = preferences.getString("payload_" + suffix, null);
        if (iv == null || payload == null) return null;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            cipher.updateAAD(suffix.getBytes(StandardCharsets.UTF_8));
            byte[] clear = cipher.doFinal(Base64.decode(payload, Base64.NO_WRAP));
            String raw = new String(clear, StandardCharsets.UTF_8);
            if (clear.length == 0 || clear.length > MAX_BYTES || !valid(accountId, raw)) throw new IllegalStateException();
            return raw;
        } catch (Exception error) {
            clear(accountId);
            return null;
        }
    }

    public synchronized boolean clear(String accountId) {
        String suffix;
        try { suffix = suffix(accountId); } catch (RuntimeException error) { return false; }
        return preferences.edit().remove("iv_" + suffix).remove("payload_" + suffix).commit();
    }

    static boolean valid(String accountId, String rawJson) {
        try {
            JSONObject root = new JSONObject(rawJson);
            JSONObject scope = root.optJSONObject("scope");
            JSONArray facts = root.optJSONArray("facts");
            if (root.length() != 5 || root.optInt("schemaVersion", -1) != 1 || scope == null || facts == null || facts.length() > 240) return false;
            if (!accountId.trim().equals(scope.optString("accountId")) || scope.length() != 4) return false;
            for (int index = 0; index < facts.length(); index += 1) {
                JSONObject fact = facts.optJSONObject(index);
                if (fact == null || fact.optInt("schemaVersion", -1) != 1 || !"mycrewcare".equals(fact.optString("source"))) return false;
                if (!accountId.trim().equals(fact.optString("accountId")) || fact.optString("stayId").isEmpty()) return false;
                String kind = fact.optString("kind");
                if (!("hotel".equals(kind) || "pickup".equals(kind))) return false;
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private static String suffix(String accountId) {
        String value = accountId == null ? "" : accountId.trim();
        if (value.isEmpty() || value.length() > 512) throw new IllegalArgumentException("invalid-account-id");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (int index = 0; index < 16; index += 1) result.append(String.format(Locale.ROOT, "%02x", digest[index]));
            return result.toString();
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
