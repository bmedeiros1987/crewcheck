package com.crewcheck.app

import android.app.Activity
import android.net.Uri
import android.os.Build
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

/** Only exact first-party HTTPS main frames receive this message channel. No JavascriptInterface health access. */
class SamsungWellnessBridge(private val activity: Activity, private val webView: WebView) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var generation = 0L
    private var job: Job? = null
    fun install() {
        if (!BuildConfig.SAMSUNG_WELLNESS_ENABLED) SamsungWellnessWorker.disconnect(activity)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val origins = setOf("https://crewcheck.online", "https://www.crewcheck.online", "https://crewcheck.onrender.com")
        WebViewCompat.addWebMessageListener(webView, "CrewCheckSamsung", origins) { _, message, origin, mainFrame, reply ->
            if (!mainFrame || origin.toString().trimEnd('/') !in origins) return@addWebMessageListener
            val raw = message.data ?: return@addWebMessageListener
            if (raw.length > 4096) return@addWebMessageListener
            val request = try { JSONObject(raw) } catch (_: Exception) { return@addWebMessageListener }
            val id = request.optString("requestId")
            if (!id.matches(Regex("[a-zA-Z0-9-]{1,80}")) || request.optInt("version") != 1) return@addWebMessageListener
            val action = request.optString("action")
            val epoch = ++generation
            job?.cancel()
            if (action == "disconnect") {
                SamsungWellnessWorker.disconnect(activity)
                reply.postMessage(JSONObject().put("requestId", id).put("ok", true).toString())
                return@addWebMessageListener
            }
            job = scope.launch {
                val response = JSONObject().put("requestId", id).put("ok", true)
                try {
                    val available = BuildConfig.SAMSUNG_WELLNESS_ENABLED && Build.VERSION.SDK_INT >= 29
                    response.put("available", available)
                    if (available) withTimeout(40000) {
                        val owner = request.optString("owner")
                        require(owner.matches(Regex("[a-f0-9]{64}")))
                        var consent = SamsungWellnessStorage.consent(activity)
                        if (consent != null && consent!!.owner != owner) { SamsungWellnessWorker.disconnect(activity); consent = null }
                        val reader = SamsungWellnessReader(activity)
                        when(action) {
                            "status" -> {
                                consent?.let { c ->
                                    if (reader.allowed(c.keys) != c.keys) { SamsungWellnessWorker.disconnect(activity); consent = null }
                                    else response.put("metrics", SamsungWellnessStorage.cached(activity, c))
                                }
                            }
                            "permissions" -> {
                                val list = request.optJSONArray("keys") ?: JSONArray()
                                require(list.length() in 1..6)
                                val keys = (0 until list.length()).map { list.getString(it) }.toSet()
                                require(keys.all { it in SamsungWellnessReader.types })
                                SamsungWellnessWorker.disconnect(activity)
                                val granted = reader.store.requestPermissions(SamsungWellnessReader.permissions(keys), activity)
                                ensureActive()
                                check(epoch == generation)
                                val allowed = keys.filter { granted.contains(SamsungWellnessReader.permissions(setOf(it)).first()) }.toSet()
                                if (allowed.isNotEmpty()) consent = SamsungWellnessStorage.connect(activity, owner, allowed, false)
                                else consent = null
                            }
                            "background" -> {
                                val c = consent ?: error("No consent")
                                check(reader.allowed(c.keys) == c.keys)
                                ensureActive(); check(epoch == generation)
                                consent = SamsungWellnessStorage.connect(activity, owner, c.keys, request.optBoolean("enabled", false))
                                SamsungWellnessWorker.schedule(activity, consent!!.background)
                            }
                            "read" -> {
                                val c = consent ?: error("No consent")
                                check(reader.allowed(c.keys) == c.keys)
                                val metrics = reader.read(c.keys)
                                ensureActive(); check(epoch == generation && SamsungWellnessStorage.consent(activity) == c)
                                if (c.background) SamsungWellnessStorage.save(activity, c, metrics)
                                response.put("metrics", metrics).put("syncedAt", System.currentTimeMillis())
                            }
                            else -> error("Unsupported operation")
                        }
                        response.put("keys", JSONArray(consent?.keys?.toList() ?: emptyList<String>()))
                            .put("background", consent?.background ?: false)
                    }
                } catch (e: CancellationException) { throw e }
                catch (_: Exception) {
                    if (epoch == generation) SamsungWellnessWorker.disconnect(activity)
                    response.put("ok", false).put("code", "samsung_unavailable_or_permission_required")
                }
                if (epoch == generation && !activity.isFinishing && originMatches(origin)) reply.postMessage(response.toString())
            }
        }
    }
    private fun originMatches(origin: Uri): Boolean = try {
        val current = Uri.parse(webView.url)
        current.scheme == origin.scheme && current.host == origin.host && current.port == origin.port
    } catch (_: Exception) { false }
    fun navigationStarted() { generation++; job?.cancel() }
    fun destroy() { generation++; scope.cancel() }
}
