package com.amanmarwaha.numbite.bridge

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** Where the person is, for the Near me map. Used on the phone only: never stored and never sent anywhere (CLAUDE.md rule 4). LocationService.swift on the iPhone. */
sealed interface LocationOutcome {
    data class Found(val latitude: Double, val longitude: Double) : LocationOutcome
    data object Denied : LocationOutcome
    data object Unavailable : LocationOutcome
}

interface LocationProviding {
    /** `onlyIfAllowed`: answer only if the person already said yes (opening the map); never shows the system question. */
    suspend fun currentLocation(onlyIfAllowed: Boolean): LocationOutcome
}

/**
 * The platform LocationManager with only the approximate-location permission (enough to sort nearby branches). The page uses this because inside the app it
 * asks the app for the position (web/app/app/map/page.tsx), exactly as on the iPhone. One system question, the first time they tap "use my location".
 */
class AndroidLocationService(private val context: Context, private val permissions: PermissionBroker) : LocationProviding {
    override suspend fun currentLocation(onlyIfAllowed: Boolean): LocationOutcome {
        if (!hasPermission()) {
            if (onlyIfAllowed) return LocationOutcome.Denied
            if (!permissions.request(Manifest.permission.ACCESS_COARSE_LOCATION)) return LocationOutcome.Denied
        }
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return LocationOutcome.Unavailable
        val found = try {
            withTimeoutOrNull(FIX_TIMEOUT_MILLIS) { fresh(manager) } ?: lastKnown(manager)
        } catch (_: SecurityException) {
            return LocationOutcome.Denied
        } catch (e: Exception) {
            Log.w(TAG, "Location failed", e)
            null
        }
        return found?.let { LocationOutcome.Found(it.latitude, it.longitude) } ?: LocationOutcome.Unavailable
    }

    private fun hasPermission(): Boolean =
        PermissionBroker.isGranted(context, Manifest.permission.ACCESS_COARSE_LOCATION) || PermissionBroker.isGranted(context, Manifest.permission.ACCESS_FINE_LOCATION)

    /** Providers a coarse-only app may use, best first. (GPS needs the precise permission, which the app does not ask for.) */
    private fun providers(manager: LocationManager): List<String> {
        val all = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
            add(LocationManager.NETWORK_PROVIDER)
            if (PermissionBroker.isGranted(context, Manifest.permission.ACCESS_FINE_LOCATION)) add(LocationManager.GPS_PROVIDER)
        }
        return all.filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
    }

    @SuppressLint("MissingPermission")
    private suspend fun fresh(manager: LocationManager): Location? {
        for (provider in providers(manager)) {
            val fix = suspendCancellableCoroutine<Location?> { continuation ->
                val executor = ContextCompat.getMainExecutor(context)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val signal = CancellationSignal()
                    continuation.invokeOnCancellation { signal.cancel() }
                    manager.getCurrentLocation(provider, signal, executor) { continuation.resume(it) }
                } else {
                    val listener = object : LocationListener {
                        override fun onLocationChanged(location: Location) { continuation.resume(location) }
                        @Suppress("OVERRIDE_DEPRECATION") override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) = Unit
                        override fun onProviderDisabled(provider: String) { continuation.resume(null) }
                    }
                    continuation.invokeOnCancellation { manager.removeUpdates(listener) }
                    @Suppress("DEPRECATION")
                    manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                }
            }
            if (fix != null) return fix
        }
        return null
    }

    /** A recent position the system already holds, when no fresh one came in time. */
    @SuppressLint("MissingPermission")
    private fun lastKnown(manager: LocationManager): Location? =
        providers(manager).mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }

    private companion object {
        const val TAG = "NumbiteLocation"
        const val FIX_TIMEOUT_MILLIS = 15_000L
    }
}
