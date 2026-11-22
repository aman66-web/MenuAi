package com.amanmarwaha.numbite.billing

import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingFlowParams.SubscriptionUpdateParams.ReplacementMode
import com.android.billingclient.api.ProductDetails.RecurrenceMode
import com.android.billingclient.api.Purchase.PurchaseState
import org.json.JSONArray
import org.json.JSONObject

/*
 * The pure part of Google Play Billing: ids, plan names, the choice of offer, the mapping of Play's answers to ours. No Android, no Play connection, no
 * org.json except in [Answer.toJson]; everything here is unit-tested (PlayPlansTest). The state machine that uses it is PlayBillingService.
 */

/** Our own answer code for "Play didn't answer in time" (Play's `SERVICE_TIMEOUT` is deprecated in library 8); anything but OK means not ready. */
internal const val NO_ANSWER_IN_TIME = -3

/** The ids as set up in the Play Console (docs/ANDROID_BILLING.md) and as the page and our server know them (docs/ANDROID_BRIDGE.md). */
internal object PlayIds {
    const val PACKAGE_NAME = "com.amanmarwaha.numbite"

    /** The one subscription; its two base plans are [BasePlan]. */
    const val SUBSCRIPTION_ID = "com.amanmarwaha.numbite.premium"

    /** Google Play's own screen for this subscription (change plan, cancel, resubscribe). */
    const val MANAGE_URL = "https://play.google.com/store/account/subscriptions?sku=$SUBSCRIPTION_ID&package=$PACKAGE_NAME"
}

/** The two base plans of the subscription. The page names one `<subscription id>:<base plan id>`. */
internal enum class BasePlan(val baseId: String, val period: String, val fixedName: String) {
    ANNUAL("annual", "year", "Annual"),
    MONTHLY("monthly", "month", "Monthly");

    /** The id the page and the app use: `com.amanmarwaha.numbite.premium:annual`. */
    val planId: String get() = "${PlayIds.SUBSCRIPTION_ID}:$baseId"

    /**
     * How a change from another plan of ours to this one is charged (Play: "when switching plans within the same subscription to an auto-renewing plan from
     * an auto-renewing plan, valid replacement modes are CHARGE_FULL_PRICE and WITHOUT_PRORATION"; docs/ANDROID_BILLING.md explains the choice).
     * To annual: the person pays the year now and the unused part of the month is credited as time. To monthly: nothing is charged now; the monthly price starts
     * when the year they already paid for ends (they lose nothing they paid for).
     */
    val replacementMode: Int
        get() = when (this) {
            ANNUAL -> ReplacementMode.CHARGE_FULL_PRICE
            MONTHLY -> ReplacementMode.WITHOUT_PRORATION
        }

    companion object {
        /** The plan the page named, or null for anything that isn't one of ours. */
        fun parse(planId: String): BasePlan? = entries.firstOrNull { it.planId == planId }

        /** Only our plans, each once, in the order given. */
        fun onlyOurs(ids: List<String>): List<BasePlan> = ids.mapNotNull { parse(it) }.distinct()
    }
}

/** One phase of an offer's price schedule, as Play states it. */
internal data class PlayPhase(
    val priceMicros: Long,
    /** Play's own localised text, e.g. "£4.99". */
    val formattedPrice: String,
    /** ISO 8601: P1M, P1Y, P1W ... */
    val billingPeriod: String,
    /** [RecurrenceMode]: 1 infinite (the plan's own price), 2 finite (a trial or an introductory price), 3 non-recurring (prepaid). */
    val recurrence: Int,
    val cycleCount: Int,
)

/** One offer of a base plan (the base plan itself has `offerId == null`). */
internal data class PlayOffer(val basePlanId: String, val offerId: String?, val offerToken: String, val phases: List<PlayPhase>)

/** A subscription's details. [handle] is Play's own object, kept so the purchase flow can be launched with it; never read outside the Play backend. */
internal class PlayProduct(val productId: String, val name: String, val offers: List<PlayOffer>, val handle: Any? = null)

/** A purchase as Play reports it. Never logged: [token] is the secret. */
internal data class PlayPurchase(
    val products: List<String>,
    val token: String,
    /** [PurchaseState]. */
    val state: Int,
    val acknowledged: Boolean,
    val autoRenewing: Boolean,
) {
    val isOurs: Boolean get() = PlayIds.SUBSCRIPTION_ID in products
    val isPurchased: Boolean get() = state == PurchaseState.PURCHASED
    val isPending: Boolean get() = state == PurchaseState.PENDING
}

/** One entry of `iap.products`. */
internal data class ProductAnswer(val id: String, val name: String, val price: String, val period: String)

/** What the bridge sends back to the page (docs/ANDROID_BRIDGE.md). */
internal sealed interface Answer {
    data class Products(val products: List<ProductAnswer>) : Answer
    data class Purchases(val purchases: List<PlayPurchase>) : Answer
    data object Pending : Answer
    data object Cancelled : Answer
    data object Unavailable : Answer
    data object Done : Answer

    /** The page's JSON. Only the token of a purchase leaves here, and only to the page (which sends it to our server). */
    fun toJson(): JSONObject = when (this) {
        is Products -> JSONObject().put(
            "products",
            JSONArray().also { list ->
                products.forEach { list.put(JSONObject().put("id", it.id).put("name", it.name).put("price", it.price).put("period", it.period)) }
            },
        )
        is Purchases -> JSONObject().put(
            "purchases",
            JSONArray().also { list ->
                purchases.forEach { list.put(JSONObject().put("productId", PlayIds.SUBSCRIPTION_ID).put("token", it.token)) }
            },
        )
        Pending -> JSONObject().put("pending", true)
        Cancelled -> JSONObject().put("error", "cancelled")
        Unavailable -> JSONObject().put("error", "unavailable")
        Done -> JSONObject().put("done", true)
    }
}

/** What Play's purchase listener said, in our words. */
internal sealed interface PurchaseUpdate {
    /** Bought, and Play says paid (PURCHASED state): ours only. */
    data class Purchased(val purchases: List<PlayPurchase>) : PurchaseUpdate

    /** Waiting for a payment to complete (a slow payment method, a family approval). Not an entitlement yet. */
    data object Pending : PurchaseUpdate
    data object Cancelled : PurchaseUpdate

    /** Play says the person already has it: the app then asks Play what they own. */
    data object AlreadyOwned : PurchaseUpdate
    data object Failed : PurchaseUpdate
}

internal object PlayMapping {
    /** "P1M" is a month, "P1Y" a year; every other period (weeks, quarters, 6 months ...) is not one of our two plans. */
    fun periodOf(billingPeriod: String): String? = when (billingPeriod) {
        "P1M" -> "month"
        "P1Y" -> "year"
        else -> null
    }

    /** The phase that is the plan's own price, charged for ever: not a trial, not an introductory price, not a prepaid plan. */
    fun recurringPhase(offer: PlayOffer): PlayPhase? = offer.phases.lastOrNull { it.recurrence == RecurrenceMode.INFINITE_RECURRING }

    /** A free first period (a trial) before the plan's own price. We never sell one: the free week is the account's own (web/lib/payments/freeWeek.ts). */
    fun hasFreeTrial(offer: PlayOffer): Boolean = offer.phases.any { it.priceMicros == 0L && it.recurrence != RecurrenceMode.INFINITE_RECURRING }

    /**
     * The offer to show and to buy for a base plan: the plain base plan (no offer id) without a free trial; else any offer without a free trial; else, only if
     * nothing else exists, the first with a recurring price. Null when the base plan has no usable offer (prepaid, or not on sale).
     */
    fun selectOffer(product: PlayProduct, plan: BasePlan): PlayOffer? {
        val usable = product.offers.filter { it.basePlanId == plan.baseId && recurringPhase(it) != null }
        val withoutTrial = usable.filter { !hasFreeTrial(it) }
        return withoutTrial.firstOrNull { it.offerId == null } ?: withoutTrial.firstOrNull() ?: usable.firstOrNull()
    }

    /**
     * `iap.products`: one entry per requested plan Play knows and can sell, in the order asked. Price is Play's own text of the plan's recurring phase; period
     * from Play's billing period (a plan whose period isn't a month or a year is left out); the name is ours ("Annual"/"Monthly"), because Play's product name
     * is the subscription's (the same for both plans), and the page shows it as each plan's title. Never a trial field.
     */
    fun products(wanted: List<BasePlan>, details: List<PlayProduct>): List<ProductAnswer> {
        val product = details.firstOrNull { it.productId == PlayIds.SUBSCRIPTION_ID } ?: return emptyList()
        return wanted.mapNotNull { plan ->
            val phase = selectOffer(product, plan)?.let { recurringPhase(it) } ?: return@mapNotNull null
            val period = periodOf(phase.billingPeriod) ?: return@mapNotNull null
            if (phase.formattedPrice.isBlank()) return@mapNotNull null
            ProductAnswer(plan.planId, plan.fixedName, phase.formattedPrice, period)
        }
    }

    /** Our purchases that are paid now (PURCHASED state: unacknowledged ones too). Pending and other products are not entitlements. */
    fun paid(purchases: List<PlayPurchase>): List<PlayPurchase> = purchases.filter { it.isOurs && it.isPurchased }.distinctBy { it.token }

    fun pending(purchases: List<PlayPurchase>): List<PlayPurchase> = purchases.filter { it.isOurs && it.isPending }

    /** Play's `onPurchasesUpdated`. */
    fun classifyUpdate(code: Int, purchases: List<PlayPurchase>): PurchaseUpdate = when (code) {
        BillingResponseCode.OK -> {
            val paid = paid(purchases)
            when {
                paid.isNotEmpty() -> PurchaseUpdate.Purchased(paid)
                pending(purchases).isNotEmpty() -> PurchaseUpdate.Pending
                else -> PurchaseUpdate.Failed
            }
        }
        BillingResponseCode.USER_CANCELED -> PurchaseUpdate.Cancelled
        BillingResponseCode.ITEM_ALREADY_OWNED -> PurchaseUpdate.AlreadyOwned
        else -> PurchaseUpdate.Failed
    }

    /** A token as the page and Play have it: `[A-Za-z0-9._-]`, up to 4,000 characters (docs/ANDROID_BRIDGE.md). */
    fun isPlausibleToken(token: String): Boolean = token.isNotEmpty() && token.length <= 4000 && token.all { it.isLetterOrDigit() && it.code < 128 || it == '.' || it == '_' || it == '-' }
}
