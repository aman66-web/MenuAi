package com.amanmarwaha.numbite.billing

import android.app.Activity
import android.content.Context
import org.json.JSONObject

/** Answers every question with "unavailable": what the app falls back to if Play Billing can't be used at all. */
class UnavailablePurchaseService : PurchaseService {
    private fun unavailable() = JSONObject().put("error", "unavailable")
    override suspend fun products(ids: List<String>) = unavailable()
    override suspend fun purchase(productId: String) = unavailable()
    override suspend fun entitlements() = unavailable()
    override suspend fun restore() = unavailable()
    override suspend fun manage() = unavailable()
    override suspend fun acknowledge(token: String) = unavailable()
}

/**
 * The one place the app asks for its [PurchaseService]: Google Play Billing ([PlayBillingService], one instance for the whole process). Asking again after a
 * rotation is fine: it hands back the same service and only swaps the Activity it uses for Play's purchase sheet and for opening Play's subscription screen (so
 * pass an `activityProvider` that reads the current Activity from a holder, e.g. a WeakReference, and don't call it from a short-lived scope).
 *
 * A DEBUG build can be switched to [FakePurchaseService] (no Play, no money) with `adb`: docs/ANDROID_BILLING.md "Testing without Play". The fake's code is in
 * the debug source set only (`src/debug`), and `src/release` has an empty twin of [DebugPurchaseServices]: a release build doesn't contain the fake at all.
 */
fun createPurchaseService(appContext: Context, activityProvider: () -> Activity?): PurchaseService =
    DebugPurchaseServices.create(appContext) ?: PlayBillingService.shared(appContext, activityProvider)
