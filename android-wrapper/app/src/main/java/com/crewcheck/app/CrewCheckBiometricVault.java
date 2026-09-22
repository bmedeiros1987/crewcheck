package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Local biometric vault for the CrewCheck Android app.
 *
 * Stores only the current session token, encrypted with an Android Keystore key that
 * requires strong biometric authentication for every crypto operation. Passwords are
 * never accepted, persisted or reconstructed here.
 */
public final class CrewCheckBiometricVault {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "crewcheck_biometric_session_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private static final String PREFS = "crewcheck_biometric_v1";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_PAYLOAD = "payload";
    private static final String KEY_IV = "iv";

    private final Context context;
    private final SharedPreferences prefs;

    public CrewCheckBiometricVault(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public boolean isEnabled() {
        return prefs.getBoolean(KEY_ENABLED, false)
                && !prefs.getString(KEY_PAYLOAD, "").isBlank()
                && !prefs.getString(KEY_IV, "").isBlank();
    }

    public Cipher prepareEnrollmentCipher() throws Exception {
        SecretKey key = getOrCreateKey();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        return cipher;
    }

    public Cipher prepareUnlockCipher() throws Exception {
        String ivText = prefs.getString(KEY_IV, "");
        if (ivText == null || ivText.isBlank()) {
            throw new IllegalStateException("Credencial biométrica ausente.");
        }
        SecretKey key = getExistingKey();
        if (key == null) {
            clear();
            throw new IllegalStateException("Chave biométrica indisponível.");
        }
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        try {
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    key,
                    new GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP))
            );
        } catch (KeyPermanentlyInvalidatedException invalidated) {
            clear();
            throw invalidated;
        }
        return cipher;
    }

    public void storeToken(String token, Cipher authenticatedCipher) throws Exception {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Sessão vazia.");
        }
        if (authenticatedCipher == null) {
            throw new IllegalArgumentException("Cifra biométrica ausente.");
        }
        byte[] encrypted = authenticatedCipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        byte[] iv = authenticatedCipher.getIV();
        if (iv == null || iv.length == 0) {
            throw new IllegalStateException("IV biométrico ausente.");
        }
        prefs.edit()
                .putString(KEY_PAYLOAD, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .putBoolean(KEY_ENABLED, true)
                .apply();
    }

    public String readToken(Cipher authenticatedCipher) throws Exception {
        if (!isEnabled()) throw new IllegalStateException("Biometria não habilitada.");
        if (authenticatedCipher == null) throw new IllegalArgumentException("Cifra biométrica ausente.");
        String payload = prefs.getString(KEY_PAYLOAD, "");
        byte[] decoded = Base64.decode(payload, Base64.NO_WRAP);
        byte[] clear = authenticatedCipher.doFinal(decoded);
        String token = new String(clear, StandardCharsets.UTF_8).trim();
        if (token.isBlank()) throw new IllegalStateException("Sessão biométrica vazia.");
        return token;
    }

    public void clear() {
        prefs.edit().clear().apply();
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
        }
    }

    private SecretKey getExistingKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        return existing instanceof SecretKey ? (SecretKey) existing : null;
    }

    private SecretKey getOrCreateKey() throws Exception {
        SecretKey existing = getExistingKey();
        if (existing != null) return existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                    0,
                    KeyProperties.AUTH_BIOMETRIC_STRONG
            );
        } else {
            // API 26-29: -1 means authentication is required for every use.
            builder.setUserAuthenticationValidityDurationSeconds(-1);
        }

        generator.init(builder.build());
        return generator.generateKey();
    }
}
