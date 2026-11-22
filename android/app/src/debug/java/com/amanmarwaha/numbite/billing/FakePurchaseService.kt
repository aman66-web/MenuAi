package com.amanmarwaha.numbite.billing

import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/**
 * A pretend Google Play for DEBUG builds (the iPhone's FakePurchaseService twin): the two plans at their GBP prices, a purchase that "succeeds" after a short
 * delay with a made-up token, and an in-memory list for entitlements, restore and acknowledge. Nothing is bought. Our server rejects the made-up tokens
 * (402 "nothing paid"), which is the expected "not confirmed" path in the page. Lives in `src/debug`: a release build doesn't contain it.
 */
class FakePurchaseService(
    private val purchaseDelayMs: Long = 700,
    private val outcome: () -> Outcome = { Outcome.PURCHASED },
) : PurchaseService {

    enum class Outcome {
        PURCHASED, PENDING, CANCELLED, UNAVAILABLE;

        companion object {
            fun parse(text: String?): Outcome = entries.firstOrNull { it.name.equals(text, ignoreCase = true) } ?: PURCHASED
        }
    }

    private class Owned(val token: String, val plan: BasePlan, var acknowledged: Boolean = false)

    private val lock = Any()
    private val owned = mutableListOf<Owned>()
    private var counter = 0

    /** What the fake has been asked, for tests. */
    val acknowledgedTokens: List<String> get() = synchronized(lock) { owned.filter { it.acknowledged }.map { it.token } }

    override suspend fun products(ids: List<String>): JSONObject {
        val list = JSONArray()
        BasePlan.onlyOurs(ids).forEach { plan ->
            val price = if (plan == BasePlan.ANNUAL) "£49.99" else "£4.99"
            list.put(JSONObject().put("id", plan.planId).put("name", plan.fixedName).put("price", price).put("period", plan.period))
        }
        return JSONObject().put("products", list)
    }

    override suspend fun purchase(productId: String): JSONObject {
        val plan = BasePlan.parse(productId) ?: return unavailable()
        delay(purchaseDelayMs)
        return when (outcome()) {
            Outcome.PURCHASED -> synchronized(lock) {
                // like Google Play, a plan change replaces the old purchase with a new one
                owned.clear()
                val bought = Owned("fake.numbite.purchase.${++counter}", plan)
                owned.add(bought)
                purchases()
            }
            Outcome.PENDING -> JSONObject().put("pending", true)
            Outcome.CANCELLED -> JSONObject().put("error", "cancelled")
            Outcome.UNAVAILABLE -> unavailable()
        }
    }

    override suspend fun entitlements(): JSONObject = synchronized(lock) { purchases() }

    override suspend fun restore(): JSONObject = synchronized(lock) { purchases() }

    override suspend fun manage(): JSONObject = JSONObject().put("done", true)

    override suspend fun acknowledge(token: String): JSONObject {
        if (!PlayMapping.isPlausibleToken(token)) return unavailable()
        synchronized(lock) { owned.firstOrNull { it.token == token }?.acknowledged = true }
        return JSONObject().put("done", true)
    }

    private fun purchases(): JSONObject = JSONObject().put(
        "purchases",
        JSONArray().also { list -> owned.forEach { list.put(JSONObject().put("productId", PlayIds.SUBSCRIPTION_ID).put("token", it.token)) } },
    )

    private fun unavailable() = JSONObject().put("error", "unavailable")
}
