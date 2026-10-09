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
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private encrypted cache restricted to the exact normalized logistics schema. */
public final class CrewCheckMyCrewCareSecureStore {
    private static final String PREFS = "crewcheck_mycrewcare_v3_secure";
    private static final String KEY_ALIAS = "crewcheck_mycrewcare_v3_aes";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int MAX_BYTES = 256 * 1024;
    private static final int MAX_FACTS = 240;
    private static final int MAX_TEXT = 512;

    private static final Set<String> ROOT_KEYS = keys(
            "schemaVersion", "scope", "syncedAt", "emptyConfirmed", "facts"
    );
    private static final Set<String> SCOPE_KEYS = keys(
            "accountId", "rosterId", "rosterRevision", "providerSubject"
    );
    private static final Set<String> HOTEL_FACT_KEYS = keys(
            "schemaVersion", "accountId", "rosterId", "rosterRevision", "observedAt",
            "source", "status", "providerRecordId", "stayId", "rosterEventId",
            "airport", "pairingId", "kind", "hotelName", "hotelAddress", "hotelPhone",
            "reservationStartAt", "reservationEndAt", "contentFingerprint"
    );
    private static final Set<String> PICKUP_FACT_KEYS = keys(
            "schemaVersion", "accountId", "rosterId", "rosterRevision", "observedAt",
            "source", "status", "providerRecordId", "stayId", "rosterEventId",
            "airport", "pairingId", "kind", "hotelName", "timeZone", "pickupAt",
            "pickupLocation", "transportProvider", "transportPhone", "transitMinutes",
            "contentFingerprint"
    );

    private final SharedPreferences preferences;

    public CrewCheckMyCrewCareSecureStore(Context context) {
        if (context == null) throw new IllegalArgumentException("context-required");
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
        final String suffix;
        try { suffix = suffix(accountId); } catch (RuntimeException error) { return null; }
        String iv = preferences.getString("iv_" + suffix, null);
        String payload = preferences.getString("payload_" + suffix, null);
        if (iv == null || payload == null) return null;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
            );
            cipher.updateAAD(suffix.getBytes(StandardCharsets.UTF_8));
            byte[] clear = cipher.doFinal(Base64.decode(payload, Base64.NO_WRAP));
            if (clear.length == 0 || clear.length > MAX_BYTES) throw new IllegalStateException("invalid-size");
            String raw = new String(clear, StandardCharsets.UTF_8);
            if (!valid(accountId, raw)) throw new IllegalStateException("invalid-cache");
            return raw;
        } catch (Exception error) {
            clear(accountId);
            return null;
        }
    }

    public synchronized boolean clear(String accountId) {
        final String suffix;
        try { suffix = suffix(accountId); } catch (RuntimeException error) { return false; }
        return preferences.edit().remove("iv_" + suffix).remove("payload_" + suffix).commit();
    }

    static boolean valid(String accountId, String rawJson) {
        try {
            JSONObject root = new JSONObject(rawJson);
            if (!onlyKeys(root, ROOT_KEYS)
                    || root.optInt("schemaVersion", -1) != 1
                    || !instant(root.optString("syncedAt"))
                    || !(root.opt("emptyConfirmed") instanceof Boolean)) return false;

            JSONObject scope = root.optJSONObject("scope");
            JSONArray facts = root.optJSONArray("facts");
            if (scope == null || !onlyKeys(scope, SCOPE_KEYS)
                    || facts == null || facts.length() > MAX_FACTS) return false;

            String account = requiredText(scope, "accountId", MAX_TEXT);
            String roster = requiredText(scope, "rosterId", MAX_TEXT);
            String revision = requiredText(scope, "rosterRevision", MAX_TEXT);
            String subject = requiredText(scope, "providerSubject", MAX_TEXT);
            if (!safeAccount(accountId).equals(account)
                    || roster.isEmpty() || revision.isEmpty() || subject.isEmpty()) return false;

            for (int index = 0; index < facts.length(); index += 1) {
                JSONObject fact = facts.optJSONObject(index);
                if (!validFact(fact, account, roster, revision)) return false;
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static boolean validFact(JSONObject fact, String account, String roster, String revision) {
        if (fact == null) return false;
        String kind = fact.optString("kind");
        Set<String> expected = "hotel".equals(kind) ? HOTEL_FACT_KEYS
                : ("pickup".equals(kind) ? PICKUP_FACT_KEYS : null);
        if (expected == null || !onlyKeys(fact, expected)
                || fact.optInt("schemaVersion", -1) != 1
                || !"mycrewcare".equals(fact.optString("source"))
                || !validStatus(fact.optString("status"))
                || !account.equals(requiredText(fact, "accountId", MAX_TEXT))
                || !roster.equals(requiredText(fact, "rosterId", MAX_TEXT))
                || !revision.equals(requiredText(fact, "rosterRevision", MAX_TEXT))
                || requiredText(fact, "stayId", MAX_TEXT).isEmpty()
                || requiredText(fact, "rosterEventId", MAX_TEXT).isEmpty()
                || !requiredText(fact, "airport", 3).matches("[A-Z]{3}")
                || requiredText(fact, "pairingId", MAX_TEXT).isEmpty()
                || requiredText(fact, "hotelName", 240).isEmpty()
                || !instant(fact.optString("observedAt"))
                || !requiredText(fact, "contentFingerprint", 128).matches("[0-9a-f]{16,128}")
                || !nullableText(fact, "providerRecordId", 180)) return false;

        if ("hotel".equals(kind)) {
            return nullableText(fact, "hotelAddress", 320)
                    && nullableText(fact, "hotelPhone", 80)
                    && nullableInstant(fact, "reservationStartAt")
                    && nullableInstant(fact, "reservationEndAt");
        }
        return !requiredText(fact, "timeZone", 100).isEmpty()
                && instant(fact.optString("pickupAt"))
                && nullableText(fact, "pickupLocation", 240)
                && nullableText(fact, "transportProvider", 180)
                && nullableText(fact, "transportPhone", 80)
                && nullableMinutes(fact.opt("transitMinutes"));
    }

    private static boolean validStatus(String value) {
        return "published".equals(value) || "changed".equals(value) || "cancelled".equals(value);
    }

    private static boolean nullableMinutes(Object value) {
        if (value == null || value == JSONObject.NULL) return true;
        if (!(value instanceof Number)) return false;
        double number = ((Number) value).doubleValue();
        return number == Math.rint(number) && number >= 0 && number <= 360;
    }

    private static boolean nullableInstant(JSONObject object, String key) {
        Object value = object.opt(key);
        return value == null || value == JSONObject.NULL || instant(String.valueOf(value));
    }

    private static boolean nullableText(JSONObject object, String key, int max) {
        Object value = object.opt(key);
        return value == null || value == JSONObject.NULL || validText(String.valueOf(value), max);
    }

    private static String requiredText(JSONObject object, String key, int max) {
        Object value = object.opt(key);
        if (!(value instanceof String)) return "";
        String result = ((String) value).trim();
        return validText(result, max) ? result : "";
    }

    private static boolean validText(String value, int max) {
        if (value == null || value.isEmpty() || value.length() > max) return false;
        for (int index = 0; index < value.length(); index += 1) {
            char current = value.charAt(index);
            if (current < 0x20 || current == 0x7f) return false;
        }
        return true;
    }

    private static boolean onlyKeys(JSONObject object, Set<String> allowed) {
        if (object.length() != allowed.size()) return false;
        Iterator<String> iterator = object.keys();
        while (iterator.hasNext()) if (!allowed.contains(iterator.next())) return false;
        return true;
    }

    private static boolean instant(String value) {
        return value != null && value.matches(
                "\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})"
        );
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
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

    private static String suffix(String accountId) {
        String value = safeAccount(accountId);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (int index = 0; index < 16; index += 1) {
                result.append(String.format(Locale.ROOT, "%02x", digest[index]));
            }
            return result.toString();
        } catch (Exception error) {
            throw new IllegalStateException("account-hash-failed", error);
        }
    }

    private static String safeAccount(String value) {
        String result = value == null ? "" : value.trim();
        if (!validText(result, MAX_TEXT)) throw new IllegalArgumentException("invalid-account-id");
        return result;
    }

    private static Set<String> keys(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }
}
