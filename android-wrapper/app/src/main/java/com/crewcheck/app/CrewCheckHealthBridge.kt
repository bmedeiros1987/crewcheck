package com.crewcheck.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Ponte local-first do CrewCheck Life.
 *
 * Usa WebMessageListener com allowlist de origem e rejeita mensagens de iframes. Lê somente
 * resumos autorizados do Health Connect; nenhum registro bruto é enviado ao servidor.
 */
class CrewCheckHealthBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val permissionContract by lazy { PermissionController.createRequestPermissionResultContract() }
    private var installed = false

    companion object {
        const val REQUEST_CODE = 4747
        private const val CONSENT_VERSION = "1.0"
        private const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"
        private const val JS_OBJECT_NAME = "AndroidCrewCheckHealth"
        private val TRUSTED_ORIGINS = setOf("https://crewcheck.online", "https://www.crewcheck.online")

        private val PERMISSIONS = setOf(
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        )
    }

    /** Deve ser chamado antes de WebView.loadUrl(). */
    fun install(): Boolean {
        if (installed) return true
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT_NAME, TRUSTED_ORIGINS) {
                _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || !isTrustedOrigin(sourceOrigin)) return@addWebMessageListener
            handleMessage(message.data)
        }
        installed = true
        return true
    }

    private fun isTrustedOrigin(origin: Uri): Boolean {
        if (!origin.scheme.equals("https", ignoreCase = true)) return false
        if (origin.port != -1 && origin.port != 443) return false
        return when (origin.host?.lowercase()) {
            "crewcheck.online", "www.crewcheck.online" -> true
            else -> false
        }
    }

    private fun handleMessage(raw: String?) {
        if (raw.isNullOrBlank() || raw.length > 2048) return
        try {
            val request = JSONObject(raw)
            when (request.optString("action")) {
                "status" -> refreshStatus()
                "requestPermissions" -> requestPermissions(request)
                "readSummary" -> readSummary(request)
                "revokePermissions" -> revokePermissions()
                else -> dispatchError("Ação Health Connect não reconhecida.")
            }
        } catch (_: Exception) {
            dispatchError("Mensagem Health Connect inválida.")
        }
    }

    private fun hasCurrentConsent(request: JSONObject): Boolean =
        request.optString("consentVersion") == CONSENT_VERSION && request.optBoolean("consentAccepted", false)

    private fun clientOrNull(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(activity) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(activity)
        } else null

    private fun availabilityJson(): JSONObject {
        val status = HealthConnectClient.getSdkStatus(activity)
        val availability = when (status) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }
        return JSONObject()
            .put("ok", status == HealthConnectClient.SDK_AVAILABLE)
            .put("platform", "android-health-connect")
            .put("availability", availability)
            .put("requiredCount", PERMISSIONS.size)
            .put("samsungViaHealthConnect", true)
            .put("localOnly", true)
            .put("originRestricted", true)
            .put("message", when (availability) {
                "available" -> "Health Connect disponível. Permissões ainda precisam ser conferidas."
                "update_required" -> "Instale ou atualize o Health Connect para continuar."
                else -> "Health Connect indisponível neste aparelho. Use a entrada manual."
            })
    }

    private fun refreshStatus() {
        val client = clientOrNull()
        if (client == null) {
            dispatch("crewcheck:health-status", availabilityJson())
            return
        }
        scope.launch { dispatchPermissionStatus(client) }
    }

    private fun requestPermissions(request: JSONObject) {
        if (!hasCurrentConsent(request)) {
            dispatch("crewcheck:health-status", availabilityJson().put("ok", false).put("message", "Ative o CrewCheck Life antes de autorizar dados."))
            return
        }
        if (clientOrNull() == null) {
            openProviderUpdateIfNeeded()
            dispatch("crewcheck:health-status", availabilityJson())
            return
        }
        activity.runOnUiThread {
            try {
                val intent = permissionContract.createIntent(activity, PERMISSIONS)
                activity.startActivityForResult(intent, REQUEST_CODE)
            } catch (error: Exception) {
                dispatch("crewcheck:health-status", availabilityJson().put("ok", false).put("message", error.message ?: "Não foi possível abrir as permissões."))
            }
        }
    }

    private fun readSummary(request: JSONObject) {
        if (!hasCurrentConsent(request)) return
        val client = clientOrNull() ?: return
        val days = request.optInt("days", 7).coerceIn(1, 30)
        scope.launch { readSummaryInternal(client, days) }
    }

    private fun revokePermissions() {
        val client = clientOrNull() ?: return
        scope.launch {
            try {
                client.permissionController.revokeAllPermissions()
                dispatch("crewcheck:health-status", availabilityJson().put("availability", "permission_required").put("grantedCount", 0).put("allGranted", false).put("message", "Permissões revogadas no Health Connect."))
            } catch (error: Exception) {
                dispatchError("Não foi possível revogar as permissões: ${error.message ?: "erro desconhecido"}")
            }
        }
    }

    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        try { permissionContract.parseResult(resultCode, data) } catch (_: Exception) {}
        val client = clientOrNull()
        if (client != null) scope.launch {
            dispatchPermissionStatus(client)
            readSummaryInternal(client, 7)
        }
        return true
    }

    private suspend fun dispatchPermissionStatus(client: HealthConnectClient) {
        try {
            val granted = client.permissionController.getGrantedPermissions()
            val grantedRequired = granted.intersect(PERMISSIONS)
            val allGranted = grantedRequired.containsAll(PERMISSIONS)
            val availability = when {
                allGranted -> "connected"
                grantedRequired.isNotEmpty() -> "partial"
                else -> "permission_required"
            }
            dispatch("crewcheck:health-status", availabilityJson()
                .put("ok", true)
                .put("availability", availability)
                .put("grantedCount", grantedRequired.size)
                .put("allGranted", allGranted)
                .put("grantedPermissions", JSONArray(grantedRequired.sorted()))
                .put("message", if (allGranted) "Health Connect conectado." else "Escolha no Health Connect quais dados deseja compartilhar."))
        } catch (error: Exception) {
            dispatchError("Não foi possível conferir as permissões: ${error.message ?: "erro desconhecido"}")
        }
    }

    private suspend fun readSummaryInternal(client: HealthConnectClient, days: Int) {
        try {
            val granted = client.permissionController.getGrantedPermissions()
            val end = Instant.now()
            val start = end.minus(days.toLong(), ChronoUnit.DAYS)
            val range = TimeRangeFilter.between(start, end)
            val summary = JSONObject()
                .put("ok", true)
                .put("platform", "android-health-connect")
                .put("periodDays", days)
                .put("capturedAt", end.toString())
                .put("localOnly", true)
                .put("originRestricted", true)
                .put("samsungViaHealthConnect", true)

            if (granted.contains(HealthPermission.getReadPermission(StepsRecord::class))) {
                val response = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), range))
                summary.put("steps", response[StepsRecord.COUNT_TOTAL] ?: JSONObject.NULL)
            }

            if (granted.contains(HealthPermission.getReadPermission(DistanceRecord::class))) {
                val response = client.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), range))
                summary.put("distanceMeters", response[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: JSONObject.NULL)
            }

            if (granted.contains(HealthPermission.getReadPermission(ExerciseSessionRecord::class))) {
                val response = client.aggregate(AggregateRequest(setOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL), range))
                summary.put("activityMinutes", response[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes() ?: JSONObject.NULL)
            }

            if (granted.contains(HealthPermission.getReadPermission(SleepSessionRecord::class))) {
                val response = client.readRecords(ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = range,
                    ascendingOrder = false,
                    pageSize = 100,
                ))
                val latest = response.records.maxByOrNull { it.endTime }
                if (latest != null) {
                    val awakeTypes = setOf(
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
                    )
                    val totalMinutes = Duration.between(latest.startTime, latest.endTime).toMinutes()
                    val awakeMinutes = latest.stages
                        .filter { awakeTypes.contains(it.stage) }
                        .sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }
                    summary
                        .put("sleepMinutes", (totalMinutes - awakeMinutes).coerceAtLeast(0))
                        .put("sleepStart", latest.startTime.toString())
                        .put("sleepEnd", latest.endTime.toString())
                        .put("sleepSource", sourceLabel(latest.metadata.dataOrigin.packageName))
                }
            }

            if (granted.contains(HealthPermission.getReadPermission(RestingHeartRateRecord::class))) {
                val response = client.aggregate(AggregateRequest(setOf(RestingHeartRateRecord.BPM_AVG), range))
                summary.put("restingHeartRateAverage", response[RestingHeartRateRecord.BPM_AVG] ?: JSONObject.NULL)
            }

            dispatch("crewcheck:health-summary", summary)
        } catch (_: SecurityException) {
            dispatch("crewcheck:health-status", availabilityJson().put("availability", "permission_required").put("message", "Uma permissão foi revogada. Revise o Health Connect."))
        } catch (error: Exception) {
            dispatchError("Não foi possível atualizar o resumo local: ${error.message ?: "erro desconhecido"}")
        }
    }

    private fun sourceLabel(packageName: String): String = when (packageName) {
        "com.sec.android.app.shealth" -> "Samsung Health via Health Connect"
        else -> "Health Connect"
    }

    private fun openProviderUpdateIfNeeded() {
        if (HealthConnectClient.getSdkStatus(activity) != HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$HEALTH_CONNECT_PACKAGE")))
            } catch (_: Exception) {
                try { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$HEALTH_CONNECT_PACKAGE"))) } catch (_: Exception) {}
            }
        }
    }

    private fun dispatchError(message: String) {
        dispatch("crewcheck:health-status", availabilityJson().put("ok", false).put("message", message))
    }

    private fun dispatch(eventName: String, payload: JSONObject) {
        val script = "(function(){try{var detail=${payload};window.__crewcheckHealth=detail;window.dispatchEvent(new CustomEvent(${JSONObject.quote(eventName)},{detail:detail}));}catch(e){}})();"
        activity.runOnUiThread {
            try {
                if (!activity.isFinishing && !activity.isDestroyed) webView.evaluateJavascript(script, null)
            } catch (_: Exception) {}
        }
    }

    fun destroy() {
        scope.cancel()
    }
}
