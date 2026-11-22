package com.amanmarwaha.numbite.billing

import android.content.Context

/**
 * DEBUG builds only (this file is in `src/debug`; `src/release` has an empty twin): hands out the [FakePurchaseService] when the app's own debug switch is on,
 * a boolean `fake_billing` in the private preferences file `numbite_debug`. Anyone can set it with `adb run-as` on a debuggable build, which a release build
 * never is (docs/ANDROID_BILLING.md "Testing without Play").
 */
internal object DebugPurchaseServices {
    private const val PREFS = "numbite_debug"
    private const val KEY_ON = "fake_billing"
    /** Optional: purchased (default), pending, cancelled or unavailable: what the fake's next purchase ends with. */
    private const val KEY_OUTCOME = "fake_billing_outcome"

    private val lock = Any()

    @Volatile
    private var fake: FakePurchaseService? = null

    fun create(appContext: Context): PurchaseService? {
        val prefs = appContext.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ON, false)) return null
        return fake ?: synchronized(lock) {
            fake ?: FakePurchaseService(outcome = { FakePurchaseService.Outcome.parse(prefs.getString(KEY_OUTCOME, null)) }).also { fake = it }
        }
    }
}
