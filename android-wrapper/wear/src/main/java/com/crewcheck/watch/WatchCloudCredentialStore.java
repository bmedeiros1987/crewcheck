package com.crewcheck.watch;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Credencial que o celular entrega para o relógio buscar a escala direto na nuvem.
 * Fica cifrada com chave própria do Android Keystore, como o snapshot; ETag, conta
 * (hash do servidor) e geração não são segredo e ficam em claro.
 *
 * Toda troca (novo pareamento, logout) avança a geração. Uma busca só aplica efeitos
 * (snapshot, ETag, limpeza, jobs, notificações) se a geração capturada antes da rede
 * ainda for a atual, sob {@link #LOCK}.
 */
public final class WatchCloudCredentialStore {
    static final Pattern CREDENTIAL = Pattern.compile("^cw1\\.([0-9a-f]{32})\\.[A-Za-z0-9_-]{43}$");
    /** Serializa trocas de pareamento com os efeitos de uma busca concluída. */
    static final Object LOCK = new Object();
    private static final String PREFS = "crewcheck_watch_cloud";
    private static final String KEY_PAYLOAD = "credential_payload_v1";
    private static final String KEY_IV = "credential_iv_v1";
    private static final String KEY_ETAG = "etag_v1";
    private static final String KEY_LAST_FETCH = "last_fetch_epoch_ms_v1";
    private static final String KEY_GENERATION = "generation_v1";
    private static final String KEY_OWNER = "owner_v1";
    private static final String KEY_ALIAS = "crewcheck_watch_cloud_aes_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final SharedPreferences preferences;

    public WatchCloudCredentialStore(Context context) {
        this.preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Pareamento vigente: credencial, conta e geração lidas juntas. */
    public static final class Pairing {
        public final String credential;
        public final String owner;
        public final long generation;

        Pairing(String credential, String owner, long generation) {
            this.credential = credential;
            this.owner = owner;
            this.generation = generation;
        }
    }

    public enum SaveResult { REJECTED, SAME_ACCOUNT, NEW_ACCOUNT }

    /**
     * Guarda a credencial e avança a geração. NEW_ACCOUNT quando ela é de outra conta
     * que a anterior: quem chama apaga o que era da conta antiga.
     */
    public SaveResult save(String credential) {
        java.util.regex.Matcher match = credential == null ? null : CREDENTIAL.matcher(credential);
        if (match == null || !match.matches()) return SaveResult.REJECTED;
        String owner = match.group(1);
        synchronized (LOCK) {
            try {
                Cipher cipher = Cipher.getInstance(TRANSFORMATION);
                cipher.init(Cipher.ENCRYPT_MODE, key());
                byte[] encrypted = cipher.doFinal(credential.getBytes(StandardCharsets.UTF_8));
                String previousOwner = preferences.getString(KEY_OWNER, null);
                // Nova credencial = novo pareamento: o ETag antigo não vale mais.
                preferences.edit()
                        .putString(KEY_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                        .putString(KEY_PAYLOAD, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                        .putString(KEY_OWNER, owner)
                        .putLong(KEY_GENERATION, generation() + 1)
                        .remove(KEY_ETAG)
                        .commit();
                return previousOwner != null && !previousOwner.equals(owner) ? SaveResult.NEW_ACCOUNT : SaveResult.SAME_ACCOUNT;
            } catch (Exception error) {
                return SaveResult.REJECTED;
            }
        }
    }

    public Pairing current() {
        synchronized (LOCK) {
            String credential = load();
            return credential == null ? null : new Pairing(credential, preferences.getString(KEY_OWNER, null), generation());
        }
    }

    public boolean isCurrent(long generation) {
        synchronized (LOCK) {
            return load() != null && generation() == generation;
        }
    }

    public long generation() {
        return preferences.getLong(KEY_GENERATION, 0L);
    }

    public String load() {
        String iv = preferences.getString(KEY_IV, null), payload = preferences.getString(KEY_PAYLOAD, null);
        if (iv == null || payload == null) return null;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            String credential = new String(cipher.doFinal(Base64.decode(payload, Base64.NO_WRAP)), StandardCharsets.UTF_8);
            return CREDENTIAL.matcher(credential).matches() ? credential : null;
        } catch (Exception error) {
            clear();
            return null;
        }
    }

    /** Esquece o pareamento; a geração avança e nunca volta, para invalidar buscas em voo. */
    public void clear() {
        synchronized (LOCK) {
            long next = generation() + 1;
            preferences.edit().clear().putLong(KEY_GENERATION, next).commit();
        }
    }

    public String etag() { return preferences.getString(KEY_ETAG, null); }
    public void saveEtag(String etag) { preferences.edit().putString(KEY_ETAG, etag).apply(); }
    public long lastFetchEpochMs() { return preferences.getLong(KEY_LAST_FETCH, 0L); }
    public void markFetched(long epochMs) { preferences.edit().putLong(KEY_LAST_FETCH, epochMs).apply(); }

    private SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
