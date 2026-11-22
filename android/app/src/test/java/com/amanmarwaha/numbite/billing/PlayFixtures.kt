package com.amanmarwaha.numbite.billing

import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.ProductDetails.RecurrenceMode
import com.android.billingclient.api.Purchase.PurchaseState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import org.json.JSONObject

/** Test data and a fake Play connection shared by the billing tests. */
internal object Fixtures {
    const val ANNUAL_TOKEN = "offer-token-annual"
    const val MONTHLY_TOKEN = "offer-token-monthly"

    fun phase(price: String, period: String, micros: Long = 1_000_000, recurrence: Int = RecurrenceMode.INFINITE_RECURRING, cycles: Int = 0) =
        PlayPhase(micros, price, period, recurrence, cycles)

    fun offer(base: String, token: String, offerId: String? = null, vararg phases: PlayPhase) = PlayOffer(base, offerId, token, phases.toList())

    /** The subscription as the Play Console sets it up: base plans annual (£49.99 / P1Y) and monthly (£4.99 / P1M), no trial. */
    fun product(offers: List<PlayOffer> = standardOffers()) = PlayProduct(PlayIds.SUBSCRIPTION_ID, "Numbite Premium", offers)

    fun standardOffers() = listOf(
        offer("annual", ANNUAL_TOKEN, null, phase("£49.99", "P1Y", 49_990_000)),
        offer("monthly", MONTHLY_TOKEN, null, phase("£4.99", "P1M", 4_990_000)),
    )

    fun purchase(
        token: String,
        state: Int = PurchaseState.PURCHASED,
        acknowledged: Boolean = false,
        products: List<String> = listOf(PlayIds.SUBSCRIPTION_ID),
        autoRenewing: Boolean = true,
    ) = PlayPurchase(products, token, state, acknowledged, autoRenewing)

    /** True when org.json really works (it needs `testImplementation("org.json:json:...")`; the Android jar's own org.json throws "not mocked" in unit tests). */
    fun orgJsonWorks(): Boolean = try {
        JSONObject().put("a", 1).toString() == "{\"a\":1}"
    } catch (e: Throwable) {
        false
    }
}

/** A Play connection that does what the test says. */
internal class FakeBackend : BillingBackend {
    data class Launch(val offerToken: String, val change: PlanChange?)

    var listener: ((Int, List<PlayPurchase>) -> Unit)? = null
    var connectCode = BillingResponseCode.OK
    var hangConnect = false
    var connects = 0
    var reconnects = 0
    var reconnectCode = BillingResponseCode.OK

    var products: List<PlayProduct> = listOf(Fixtures.product())
    var productsCode = BillingResponseCode.OK
    var productQueries = 0

    var purchases = mutableListOf<PlayPurchase>()
    var purchasesCode = BillingResponseCode.OK

    var launchCode = BillingResponseCode.OK
    val launches = java.util.Collections.synchronizedList(mutableListOf<Launch>())

    /** What Play does right after the sheet is launched (deliver a result, change what is held ...). */
    var onLaunch: (FakeBackend) -> Unit = {}

    /** When set, launch waits for it (a sheet that stays open). */
    var launchGate: CompletableDeferred<Unit>? = null

    var ackCode = BillingResponseCode.OK
    val acks = java.util.Collections.synchronizedList(mutableListOf<String>())

    override fun setUpdateListener(listener: (code: Int, purchases: List<PlayPurchase>) -> Unit) {
        this.listener = listener
    }

    fun deliver(code: Int, vararg delivered: PlayPurchase) = listener!!.invoke(code, delivered.toList())

    override suspend fun ensureReady(timeoutMs: Long): Int {
        connects++
        if (hangConnect) awaitCancellation()
        return connectCode
    }

    override suspend fun reconnect(timeoutMs: Long): Int {
        reconnects++
        return reconnectCode
    }

    override suspend fun queryProducts(productId: String): ProductsResult {
        productQueries++
        return ProductsResult(productsCode, products)
    }

    override suspend fun queryPurchases(): PurchasesResult = PurchasesResult(purchasesCode, purchases.toList())

    override suspend fun launch(activity: android.app.Activity, product: PlayProduct, offerToken: String, change: PlanChange?): Int {
        launches.add(Launch(offerToken, change))
        launchGate?.await()
        onLaunch(this)
        return launchCode
    }

    override suspend fun acknowledge(token: String): Int {
        acks.add(token)
        return ackCode
    }
}
