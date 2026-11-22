package com.amanmarwaha.numbite.billing

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** A plan change: the purchase being replaced and how the new one is charged. */
internal data class PlanChange(val oldToken: String, val replacementMode: Int)

internal data class ProductsResult(val code: Int, val products: List<PlayProduct>)
internal data class PurchasesResult(val code: Int, val purchases: List<PlayPurchase>)

/**
 * The little part of Google Play's BillingClient that PlayBillingService uses, so the state machine (one purchase at a time, late purchases, plan changes,
 * time-outs) is tested with a fake and no Play connection. Every answer is Play's `BillingResponseCode` (0 = OK); nothing here throws for a Play failure.
 */
internal interface BillingBackend {
    /** Where Play's `onPurchasesUpdated` goes: set once, before any call. */
    fun setUpdateListener(listener: (code: Int, purchases: List<PlayPurchase>) -> Unit)

    /** Connects if needed and waits at most [timeoutMs] for a ready connection: OK, or Play's failure code (NO_ANSWER_IN_TIME when it didn't answer in time). */
    suspend fun ensureReady(timeoutMs: Long): Int

    /** Drops the connection and makes a fresh one ("Restore purchases"). */
    suspend fun reconnect(timeoutMs: Long): Int

    suspend fun queryProducts(productId: String): ProductsResult

    suspend fun queryPurchases(): PurchasesResult

    /** Opens Google Play's purchase sheet. The result is only whether it opened; the outcome comes through the update listener. */
    suspend fun launch(activity: Activity, product: PlayProduct, offerToken: String, change: PlanChange?): Int

    suspend fun acknowledge(token: String): Int
}

/**
 * The real thing: one BillingClient for the whole process, connected on first use, reconnecting by itself (`enableAutoServiceReconnection`). Never touched in a
 * unit test (it needs Play); PlayBillingService is.
 */
internal class RealBillingBackend(
    context: Context,
    private val log: (String) -> Unit,
) : BillingBackend {
    private val appContext = context.applicationContext
    private val lock = Any()
    private var client: BillingClient? = null
    private var connecting: CompletableDeferred<Int>? = null
    private var connectingSince = 0L

    @Volatile
    private var updateListener: ((Int, List<PlayPurchase>) -> Unit)? = null

    override fun setUpdateListener(listener: (code: Int, purchases: List<PlayPurchase>) -> Unit) {
        updateListener = listener
    }

    private fun newClient(): BillingClient = BillingClient.newBuilder(appContext)
        .setListener { result, purchases ->
            updateListener?.invoke(result.responseCode, purchases.orEmpty().map { it.toPlay() })
        }
        // Library 8 wants one-time-product pending purchases switched on whatever is sold; we sell only a subscription, so it changes nothing.
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    override suspend fun ensureReady(timeoutMs: Long): Int {
        var start: BillingClient? = null
        val wait: CompletableDeferred<Int>
        synchronized(lock) {
            var current = client ?: newClient().also { client = it }
            if (current.isReady) return BillingResponseCode.OK
            val existing = connecting
            if (existing != null && !existing.isCompleted && SystemClock.elapsedRealtime() - connectingSince < STALE_CONNECT_MS) {
                wait = existing
            } else {
                if (existing != null) {
                    // an attempt that never answered: start again with a new client (a closed one can't be reused)
                    runCatching { current.endConnection() }
                    current = newClient().also { client = it }
                }
                wait = CompletableDeferred()
                connecting = wait
                connectingSince = SystemClock.elapsedRealtime()
                start = current
            }
        }
        if (start != null) {
            try {
                start.startConnection(object : BillingClientStateListener {
                    override fun onBillingSetupFinished(result: BillingResult) {
                        log("connect: code=${result.responseCode}")
                        finishConnecting(wait, result.responseCode)
                    }

                    // automatic reconnection is on: the library reconnects when the next call is made
                    override fun onBillingServiceDisconnected() {
                        log("disconnected")
                    }
                })
            } catch (e: RuntimeException) {
                log("connect: ${e.javaClass.simpleName}")
                finishConnecting(wait, BillingResponseCode.ERROR)
            }
        }
        return withTimeoutOrNull(timeoutMs) { wait.await() } ?: NO_ANSWER_IN_TIME
    }

    /** The attempt is over (answered, or failed to start): whoever waits on it is released and the next call may try again. */
    private fun finishConnecting(attempt: CompletableDeferred<Int>, code: Int) {
        synchronized(lock) { if (connecting === attempt) connecting = null }
        attempt.complete(code)
    }

    override suspend fun reconnect(timeoutMs: Long): Int {
        val abandoned = synchronized(lock) {
            runCatching { client?.endConnection() }
            client = null
            connecting.also { connecting = null }
        }
        abandoned?.complete(BillingResponseCode.SERVICE_DISCONNECTED)
        return ensureReady(timeoutMs)
    }

    private fun readyClient(): BillingClient? = synchronized(lock) { client?.takeIf { it.isReady } }

    override suspend fun queryProducts(productId: String): ProductsResult {
        val c = readyClient() ?: return ProductsResult(BillingResponseCode.SERVICE_DISCONNECTED, emptyList())
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                ),
            )
            .build()
        return suspendCancellableCoroutine { cont ->
            c.queryProductDetailsAsync(params) { result, found ->
                if (cont.isActive) cont.resume(ProductsResult(result.responseCode, found.productDetailsList.map { it.toPlay() }))
            }
        }
    }

    override suspend fun queryPurchases(): PurchasesResult {
        val c = readyClient() ?: return PurchasesResult(BillingResponseCode.SERVICE_DISCONNECTED, emptyList())
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        return suspendCancellableCoroutine { cont ->
            c.queryPurchasesAsync(params) { result, found ->
                if (cont.isActive) cont.resume(PurchasesResult(result.responseCode, found.map { it.toPlay() }))
            }
        }
    }

    override suspend fun launch(activity: Activity, product: PlayProduct, offerToken: String, change: PlanChange?): Int {
        val c = readyClient() ?: return BillingResponseCode.SERVICE_DISCONNECTED
        val details = product.handle as? ProductDetails ?: return BillingResponseCode.DEVELOPER_ERROR
        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).setOfferToken(offerToken).build()),
            )
        if (change != null) {
            flow.setSubscriptionUpdateParams(
                BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                    .setOldPurchaseToken(change.oldToken)
                    .setSubscriptionReplacementMode(change.replacementMode)
                    .build(),
            )
        }
        val params = flow.build()
        // Play wants launchBillingFlow on the main thread; everything else here stays off it
        return withContext(Dispatchers.Main.immediate) { c.launchBillingFlow(activity, params).responseCode }
    }

    override suspend fun acknowledge(token: String): Int {
        val c = readyClient() ?: return BillingResponseCode.SERVICE_DISCONNECTED
        val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build()
        return suspendCancellableCoroutine { cont ->
            c.acknowledgePurchase(params) { result -> if (cont.isActive) cont.resume(result.responseCode) }
        }
    }

    private companion object {
        /** A connection attempt that hasn't answered after this long is abandoned and made again. */
        const val STALE_CONNECT_MS = 60_000L
    }
}

private fun ProductDetails.toPlay() = PlayProduct(
    productId = productId,
    name = name,
    offers = subscriptionOfferDetails.orEmpty().map { offer ->
        PlayOffer(
            basePlanId = offer.basePlanId,
            offerId = offer.offerId,
            offerToken = offer.offerToken,
            phases = offer.pricingPhases.pricingPhaseList.map {
                PlayPhase(it.priceAmountMicros, it.formattedPrice, it.billingPeriod, it.recurrenceMode, it.billingCycleCount)
            },
        )
    },
    handle = this,
)

private fun Purchase.toPlay() = PlayPurchase(
    products = products.orEmpty(),
    token = purchaseToken,
    state = purchaseState,
    acknowledged = isAcknowledged,
    autoRenewing = isAutoRenewing,
)
