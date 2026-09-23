package com.crewcheck.app
import android.app.Activity
import android.webkit.WebView
import androidx.work.WorkManager
import java.io.File
import java.security.KeyStore
/** Store builds contain neither Samsung SDK nor a health-reading channel before approval. */
class SamsungWellnessBridge(private val activity: Activity, webView: WebView) {
    fun install() {
        WorkManager.getInstance(activity).cancelUniqueWork("crewlife-samsung-read")
        activity.getSharedPreferences("crewlife_samsung_consent_v1", 0).edit().clear().commit()
        File(activity.noBackupFilesDir, "crewlife-samsung.enc").delete()
        try { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry("crewlife_samsung_cache_v1") } catch (_: Exception) {}
    }
    fun setForeground(value: Boolean) {}
    fun navigationStarted() {}
    fun destroy() {}
}
