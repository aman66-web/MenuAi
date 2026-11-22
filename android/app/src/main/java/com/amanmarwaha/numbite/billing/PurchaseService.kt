package com.amanmarwaha.numbite.billing

import org.json.JSONObject

/**
 * The contract between the bridge (MainActivity / NativeBridge) and Google Play Billing, the Android twin of MenuMacros/Services/PurchaseService.swift.
 * The page talks to it through the same bridge actions the iPhone app answers (web/lib/mm/native.ts): iap.products, iap.purchase, iap.entitlements,
 * iap.restore, iap.manage, plus iap.acknowledge. Every function answers with a plain JSON object the page reads (see docs/ANDROID_BUILD.md "Bridge");
 * nothing here ever throws to the caller: a failure is `{"error": "unavailable"}`.
 *
 * Product ids: com.amanmarwaha.numbite.pro.annual and com.amanmarwaha.numbite.pro.monthly (two subscriptions in Play Console, each with one base plan).
 * A purchase the page sends to our server is `{"productId": "...", "token": "<purchaseToken>"}`.
 */
interface PurchaseService {
    /** iap.products {ids}: `{"products":[{"id","name","price","period":"month"|"year"}]}` (price = Play's own localised text, e.g. "£4.99"); `{"error":"unavailable"}` when Play can't be reached. */
    suspend fun products(ids: List<String>): JSONObject

    /** iap.purchase {id}: opens Google Play's own sheet. `{"purchases":[...]}` when bought, `{"pending":true}` while a payment waits, `{"error":"cancelled"}`, `{"error":"unavailable"}`. */
    suspend fun purchase(productId: String): JSONObject

    /** iap.entitlements: the person's current (not expired, not refunded) purchases: `{"purchases":[{"productId","token"}]}` (an empty list is a real answer); `{"error":"unavailable"}` when Play can't be reached. */
    suspend fun entitlements(): JSONObject

    /** iap.restore: the same list as [entitlements] after syncing with Google Play. */
    suspend fun restore(): JSONObject

    /** iap.manage: opens Google Play's own screen for changing or cancelling a subscription. `{"done":true}`. */
    suspend fun manage(): JSONObject

    /** iap.acknowledge {token}: tells Google Play the purchase was delivered (otherwise Google refunds it after 3 days). Called by the page once our server has accepted it. `{"done":true}`. */
    suspend fun acknowledge(token: String): JSONObject
}
