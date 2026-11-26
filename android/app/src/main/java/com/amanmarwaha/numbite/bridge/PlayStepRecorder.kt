package com.amanmarwaha.numbite.bridge

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.edit
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.fitness.FitnessLocal
import com.google.android.gms.fitness.FitnessStatusCodes
import com.google.android.gms.fitness.LocalRecordingClient
import com.google.android.gms.fitness.data.LocalDataPoint
import com.google.android.gms.fitness.data.LocalDataType
import com.google.android.gms.fitness.data.LocalField
import com.google.android.gms.fitness.request.LocalDataReadRequest
import com.google.android.gms.tasks.Task
import kotlinx.coroutines.suspendCancellableCoroutine
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** The phone's real step counter for the bridge: Google Play services' Recording API, Android's "Physical activity" permission and the app's own Settings page. */
fun androidStepCounter(context: Context, permissions: PermissionBroker): StepCounting {
    val app = context.applicationContext
    val prefs = app.getSharedPreferences(STEP_PREFS, Context.MODE_PRIVATE)
    return RecordingStepCounter(
        recorder = PlayStepRecorder(app),
        permission = AndroidActivityPermission(app, permissions, prefs),
        memory = PrefsStepMemory(prefs),
        openAppSettings = { openAppDetails(app) },
    )
}

/**
 * Google Play services' on-phone step recording (the Recording API on mobile, com.google.android.gms:play-services-fitness; founder approved the library
 * 2026-11-26, CLAUDE.md rule 6). No Google account and no Google Fit: Google Play services records the phone's steps for the app and keeps ten days on the phone.
 * Steps need Google Play services 24.15 or later ([LocalRecordingClient.LOCAL_RECORDING_CLIENT_STEPS_MIN_VERSION_CODE]); older, or none (some phones sold
 * without Google), is "unavailable" and the page shows nothing.
 */
class PlayStepRecorder(private val context: Context) : StepRecorder {
    private val client: LocalRecordingClient by lazy { FitnessLocal.getLocalRecordingClient(context) }

    override fun isAvailable(): Boolean = try {
        GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(context, LocalRecordingClient.LOCAL_RECORDING_CLIENT_STEPS_MIN_VERSION_CODE) == ConnectionResult.SUCCESS
    } catch (e: Exception) {
        Log.w(TAG, "Google Play services could not be checked", e)
        false
    }

    // Called only once RecordingStepCounter has seen the permission held (or asked for it); a SecurityException if it went since is handled there ("denied").
    @SuppressLint("MissingPermission")
    override suspend fun subscribe() {
        call { client.subscribe(LocalDataType.TYPE_STEP_COUNT_DELTA) }
    }

    override suspend fun unsubscribe() {
        call { client.unsubscribe(LocalDataType.TYPE_STEP_COUNT_DELTA) }
    }

    override suspend fun steps(start: Instant, end: Instant): Int {
        // One read for one calendar day (StepDays.ranges; a day the clocks change is 23 or 25 hours): every bucket and point in it is added up, so a 25-hour
        // day that Google splits into two buckets is still one day here.
        val request = LocalDataReadRequest.Builder()
            .aggregate(LocalDataType.TYPE_STEP_COUNT_DELTA)
            .bucketByTime(1, TimeUnit.DAYS)
            .setTimeRange(start.toEpochMilli(), end.toEpochMilli(), TimeUnit.MILLISECONDS)
            .build()
        val response = call { client.readData(request) }
        // an aggregated read answers in buckets; the plain data sets are only a fallback (never both, so nothing is counted twice)
        val sets = response.buckets.flatMap { it.dataSets }.ifEmpty { response.dataSets }
        return sumSteps(sets.flatMap { it.dataPoints }.map(::stepsIn))
    }

    /** A point's step count (an aggregated step point has the one field "steps"). */
    private fun stepsIn(point: LocalDataPoint): Int = try {
        point.getValue(LocalField.FIELD_STEPS).asInt()
    } catch (e: Exception) {
        Log.w(TAG, "A step point had no step count", e)
        0
    }

    /** Waits for Google's task. "No recording for this app" becomes [StepsNotRecording]; a missing permission stays a SecurityException. */
    private suspend fun <T> call(start: () -> Task<T>): T {
        val result = runCatching { start().await() }
        val error = result.exceptionOrNull() ?: return result.getOrThrow()
        val cause = (error as? java.util.concurrent.ExecutionException)?.cause ?: error
        if (cause is ApiException && cause.statusCode == FitnessStatusCodes.API_EXCEPTION) throw StepsNotRecording()
        throw cause
    }

    private companion object { const val TAG = "NumbiteSteps" }
}

/** Google's task as a suspend call (the same small wait the barcode scanner uses; no extra library). */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
        val error = task.exception
        when {
            error != null -> continuation.resumeWithException(error)
            task.isCanceled -> continuation.cancel()
            else -> continuation.resume(task.result)
        }
    }
}

/**
 * Android's "Physical activity" permission (ACTIVITY_RECOGNITION, Android 10 and later), asked only when the person taps "Turn on step counting". Android 9 and
 * older have no such question: Google Play services' own permission is given at install (the manifest's com.google.android.gms.permission.ACTIVITY_RECOGNITION).
 */
class AndroidActivityPermission(
    private val context: Context,
    private val permissions: PermissionBroker,
    private val prefs: SharedPreferences,
) : ActivityPermission {
    override val canAsk: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    override fun state(): String = when {
        !canAsk -> "granted"
        PermissionBroker.isGranted(context, Manifest.permission.ACTIVITY_RECOGNITION) -> "granted"
        // asked before and not held: Android's question was answered no (or the switch was turned off in Settings)
        prefs.getBoolean(ASKED, false) -> "denied"
        else -> "notDetermined"
    }

    override suspend fun request(): Boolean {
        if (!canAsk) return true
        val granted = permissions.request(Manifest.permission.ACTIVITY_RECOGNITION)
        prefs.edit { putBoolean(ASKED, true) }
        return granted
    }
}

/** When the current recording began, in the app's own preferences on this phone (no count is ever kept). Removed when counting stops. */
class PrefsStepMemory(private val prefs: SharedPreferences) : StepMemory {
    override var since: Instant?
        get() = prefs.getLong(SINCE, 0L).takeIf { it > 0L }?.let(Instant::ofEpochMilli)
        set(value) {
            prefs.edit { if (value == null) remove(SINCE) else putLong(SINCE, value.toEpochMilli()) }
        }
}

/** The app's page in Android's Settings (App info, where Permissions › Physical activity is). */
private fun openAppDetails(context: Context) {
    try {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    } catch (e: Exception) {
        Log.w("NumbiteSteps", "Could not open the app's settings", e)
    }
}

private const val STEP_PREFS = "numbite_steps"
private const val ASKED = "asked"
private const val SINCE = "since"
