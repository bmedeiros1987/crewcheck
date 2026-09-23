package com.crewcheck.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Consent preferences contain no measurements. Optional cache is encrypted and excluded from backup. */
internal object SamsungWellnessStorage {
    data class Consent(val owner: String, val keys: Set<String>, val background: Boolean, val generation: String)
    private const val PREFS = "crewlife_samsung_consent_v1"
    private const val KEY = "crewlife_samsung_cache_v1"
    private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "crewlife-samsung.enc"))
    @Synchronized fun consent(context: Context): Consent? {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val owner = p.getString("owner", null) ?: return null
        val keys = p.getStringSet("keys", emptySet())!!.toSet().intersect(SamsungWellnessReader.types.keys)
        if (keys.isEmpty()) return null
        return Consent(owner, keys, p.getBoolean("background", false), p.getString("generation", "")!!)
    }
    @Synchronized fun connect(context: Context, owner: String, keys: Set<String>, background: Boolean): Consent {
        clear(context)
        val c = Consent(owner, keys, background, UUID.randomUUID().toString())
        check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("owner", owner)
            .putStringSet("keys", keys).putBoolean("background", background).putString("generation", c.generation).commit())
        return c
    }
    @Synchronized fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
        file(context).delete()
        try { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(KEY) } catch (_: Exception) {}
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Synchronized fun save(context: Context, expected: Consent, metrics: JSONObject): Boolean {
        val current = consent(context)
        if (current != expected || !expected.background) return false
        val payload = JSONObject().put("at", System.currentTimeMillis()).put("generation", expected.generation).put("metrics", metrics)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val bytes = cipher.iv + cipher.doFinal(payload.toString().toByteArray(Charsets.UTF_8))
        val target = file(context)
        val stream = target.startWrite()
        try { stream.write(bytes); target.finishWrite(stream) } catch (e: Exception) { target.failWrite(stream); throw e }
        return true
    }
    @Synchronized fun cached(context: Context, expected: Consent): JSONObject {
        if (consent(context) != expected || !expected.background) return JSONObject()
        return try {
            val bytes = file(context).readFully()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))) }
            val data = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
            val age = System.currentTimeMillis() - data.getLong("at")
            if (age !in 0 until 86400000 || data.optString("generation") != expected.generation) { file(context).delete(); JSONObject() }
            else data.getJSONObject("metrics")
        } catch (_: Exception) { file(context).delete(); JSONObject() }
    }
}
