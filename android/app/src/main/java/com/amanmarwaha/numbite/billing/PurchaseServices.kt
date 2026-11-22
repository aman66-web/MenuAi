package com.amanmarwaha.numbite.billing

import android.app.Activity
import android.content.Context
import org.json.JSONObject

/** Answers every question with "unavailable": what the app uses until Play Billing is wired in, and when Play can't be reached at all. */
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
 * The one place the app asks for its [PurchaseService]. The Play Billing agent replaces the body (a real PlayBillingService; a FakePurchaseService in a debug build
 * that asks for it); the app shell only ever calls this.
 */
fun createPurchaseService(appContext: Context, activityProvider: () -> Activity?): PurchaseService = UnavailablePurchaseService()
