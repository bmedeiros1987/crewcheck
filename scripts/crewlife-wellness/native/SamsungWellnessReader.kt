package com.crewcheck.app

import android.content.Context
import com.samsung.android.sdk.health.data.HealthDataService
import com.samsung.android.sdk.health.data.data.HealthDataPoint
import com.samsung.android.sdk.health.data.permission.AccessType
import com.samsung.android.sdk.health.data.permission.Permission
import com.samsung.android.sdk.health.data.request.*
import org.json.JSONObject
import java.time.*

/** Read-only adapter, compiled against Samsung Health Data SDK 1.1.0. */
internal class SamsungWellnessReader(context: Context) {
    val store = HealthDataService.getStore(context.applicationContext)
    companion object {
        val types = linkedMapOf(
            "sleepMinutes" to DataTypes.SLEEP, "sleepScore" to DataTypes.SLEEP,
            "skinTemperature" to DataTypes.SKIN_TEMPERATURE, "steps" to DataTypes.STEPS,
            "exerciseMinutes" to DataTypes.EXERCISE, "energyScore" to DataTypes.ENERGY_SCORE)
        fun permissions(keys: Set<String>) = keys.map { Permission.of(types.getValue(it), AccessType.READ) }.toSet()
    }
    suspend fun allowed(keys: Set<String>): Set<String> {
        val grants = store.getGrantedPermissions(permissions(keys))
        return keys.filter { grants.contains(Permission.of(types.getValue(it), AccessType.READ)) }.toSet()
    }
    suspend fun read(keys: Set<String>): JSONObject {
        val now = Instant.now()
        val today = LocalDate.now()
        val instantFilter = InstantTimeFilter.of(now.minus(Duration.ofHours(36)), now)
        val dateFilter = LocalDateFilter.of(today, today.plusDays(1), true, false)
        val out = JSONObject()
        fun put(key: String, value: Number?, at: Instant?) {
            if (key !in keys || value == null || at == null) return
            val v = value.toDouble()
            if (!v.isFinite() || v < 0 || at > now || Duration.between(at, now).toHours() >= 24) return
            val max = when(key) { "steps" -> 200000.0; "sleepMinutes", "exerciseMinutes" -> 1440.0; "skinTemperature" -> 50.0; else -> 100.0 }
            if (v > max || (key == "skinTemperature" && v < 10)) return
            out.put(key, JSONObject().put("value", v).put("observedAt", at.toString()).put("source", "samsung-health"))
        }
        fun latest(points: List<HealthDataPoint>) = points.filter { (it.endTime ?: it.startTime) <= now }
            .maxByOrNull { it.endTime ?: it.startTime }
        if (keys.any { it == "sleepMinutes" || it == "sleepScore" }) {
            val sleep = latest(store.readData(DataTypes.SLEEP.readDataRequestBuilder
                .setInstantTimeFilter(instantFilter).setOrdering(Ordering.DESC).setLimit(100).build()).dataList)
            sleep?.let {
                put("sleepMinutes", it.getValue(DataType.SleepType.DURATION)?.toMinutes(), it.endTime)
                put("sleepScore", it.getValue(DataType.SleepType.SLEEP_SCORE), it.endTime)
            }
        }
        if ("skinTemperature" in keys) {
            val skin = latest(store.readData(DataTypes.SKIN_TEMPERATURE.readDataRequestBuilder
                .setInstantTimeFilter(instantFilter).setOrdering(Ordering.DESC).setLimit(100).build()).dataList)
            skin?.let { put("skinTemperature", it.getValue(DataType.SkinTemperatureType.SKIN_TEMPERATURE), it.endTime ?: it.startTime) }
        }
        if ("energyScore" in keys) {
            val energy = latest(store.readData(DataTypes.ENERGY_SCORE.readDataRequestBuilder
                .setLocalDateFilter(dateFilter).setOrdering(Ordering.DESC).setLimit(10).build()).dataList)
            energy?.let { put("energyScore", it.getValue(DataType.EnergyScoreType.ENERGY_SCORE), it.startTime) }
        }
        if ("steps" in keys) {
            val values = store.aggregateData(DataType.StepsType.TOTAL.requestBuilder
                .setLocalTimeFilter(LocalTimeFilter.of(today.atStartOfDay(), LocalDateTime.now())).build()).dataList.mapNotNull { it.value }
            if (values.isNotEmpty()) put("steps", values.sum(), now)
        }
        if ("exerciseMinutes" in keys) {
            val values = store.aggregateData(DataType.ExerciseType.TOTAL_DURATION.requestBuilder
                .setLocalDateFilter(dateFilter).build()).dataList.mapNotNull { it.value }
            if (values.isNotEmpty()) put("exerciseMinutes", values.sumOf { it.toMinutes() }, now)
        }
        return out
    }
}
