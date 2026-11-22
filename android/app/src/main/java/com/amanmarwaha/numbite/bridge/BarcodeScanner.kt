package com.amanmarwaha.numbite.bridge

import android.app.Activity
import android.content.Context
import android.os.Build
import android.util.Log
import android.view.HapticFeedbackConstants
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** What scanning a barcode ended with (ScanOutcome in BarcodeScanner.swift). */
sealed interface ScanOutcome {
    data class Code(val digits: String) : ScanOutcome
    data object Cancelled : ScanOutcome
    /** The person refused the camera. */
    data object Denied : ScanOutcome
    /** This phone can't scan (no Google Play services, or Google's scanner can't be had). */
    data object Unavailable : ScanOutcome
}

/** Reads a product barcode with the camera. The picture never leaves the phone. */
interface BarcodeScanning {
    suspend fun scan(): ScanOutcome
}

/** The digits a product barcode becomes, the same as the iPhone gives the page. Pure, unit-tested. */
object BarcodeDigits {
    /** EAN-13, EAN-8, UPC-A/E: 8 to 14 digits (the page checks it again, web/lib/mm/native.ts and its barcode rules). */
    fun isProductCode(value: String): Boolean = value.length in 8..14 && value.all { it in '0'..'9' }

    /**
     * The iPhone's scanner reads a UPC-A code as an EAN-13 that starts with 0 (it only knows EAN-13, EAN-8 and UPC-E); Google's gives the 12 digits. The page is
     * handed the same thing either way. Null when it isn't a product code.
     */
    fun forPage(raw: String?, format: Int): String? {
        val digits = raw ?: return null
        val code = if (format == Barcode.FORMAT_UPC_A && digits.length == 12) "0$digits" else digits
        return code.takeIf { isProductCode(it) }
    }
}

/**
 * Google's own barcode scanner (Google code scanner, in Google Play services): a full-screen camera screen with Google's flashlight and auto zoom, shown over the
 * app, returning the first EAN-13, EAN-8, UPC-A or UPC-E code it reads, as the iPhone's VisionKit scanner does. It asks for the camera itself, so the app does not.
 * One scan at a time. Where Google Play services can't provide it, the answer is "unavailable" and the page says so and offers the typed number.
 */
class GmsBarcodeScanner(private val context: Context, private val activityProvider: () -> Activity?) : BarcodeScanning {
    private var scanning = false

    override suspend fun scan(): ScanOutcome {
        // one scanner at a time: a second request while one is open would only fail
        if (scanning) return ScanOutcome.Unavailable
        val activity = activityProvider() ?: return ScanOutcome.Unavailable
        if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) != ConnectionResult.SUCCESS) return ScanOutcome.Unavailable
        scanning = true
        try {
            val options = GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
                .enableAutoZoom()
                .build()
            return suspendCancellableCoroutine { continuation ->
                GmsBarcodeScanning.getClient(activity, options).startScan()
                    .addOnSuccessListener { barcode ->
                        val code = BarcodeDigits.forPage(barcode.rawValue, barcode.format)
                        if (code != null) {
                            activity.window?.decorView?.performHapticFeedback(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
                            continuation.resume(ScanOutcome.Code(code))
                        } else {
                            continuation.resume(ScanOutcome.Unavailable)
                        }
                    }
                    .addOnCanceledListener { continuation.resume(ScanOutcome.Cancelled) }
                    .addOnFailureListener { error ->
                        Log.w(TAG, "The scanner ended with an error", error)
                        continuation.resume(
                            when ((error as? MlKitException)?.errorCode) {
                                MlKitException.CODE_SCANNER_CANCELLED -> ScanOutcome.Cancelled
                                MlKitException.CODE_SCANNER_CAMERA_PERMISSION_NOT_GRANTED -> ScanOutcome.Denied
                                else -> ScanOutcome.Unavailable
                            },
                        )
                    }
            }
        } finally {
            scanning = false
        }
    }

    private companion object { const val TAG = "NumbiteScanner" }
}
