package com.crewcheck.app

import android.content.Context
import android.os.Build
import androidx.work.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeout
import java.util.concurrent.TimeUnit

class SamsungWellnessWorker(context: Context, params: WorkerParameters): CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (!BuildConfig.SAMSUNG_WELLNESS_ENABLED || Build.VERSION.SDK_INT < 29) return Result.success()
        val consent = SamsungWellnessStorage.consent(applicationContext) ?: return Result.success()
        if (!consent.background) return Result.success()
        return try {
            withTimeout(45000) {
                val reader = SamsungWellnessReader(applicationContext)
                if (reader.allowed(consent.keys) != consent.keys) {
                    disconnect(applicationContext)
                    return@withTimeout Result.success()
                }
                val metrics = reader.read(consent.keys)
                // Revocation/account/scope changes during a read prevent stale writes.
                SamsungWellnessStorage.save(applicationContext, consent, metrics)
                Result.success()
            }
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) {
            // Never retain a possibly revoked cache following an access failure.
            if (SamsungWellnessStorage.consent(applicationContext) == consent) disconnect(applicationContext)
            Result.success()
        }
    }
    companion object {
        private const val WORK = "crewlife-samsung-read"
        fun schedule(context: Context, enabled: Boolean) {
            val manager = WorkManager.getInstance(context)
            if (!enabled) { manager.cancelUniqueWork(WORK); return }
            val work = PeriodicWorkRequestBuilder<SamsungWellnessWorker>(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build()).build()
            manager.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, work)
        }
        fun disconnect(context: Context) { SamsungWellnessStorage.clear(context); schedule(context, false) }
    }
}
