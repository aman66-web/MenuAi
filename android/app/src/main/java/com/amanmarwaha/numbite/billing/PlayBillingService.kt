package com.amanmarwaha.numbite.billing

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.android.billingclient.api.BillingClient.BillingResponseCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/**
 * Optional: tells the app that a purchase arrived with nobody waiting for it (a payment that was pending and completed later, or a purchase made outside the
 * app, e.g. a redeemed code), so the shell can ask the page to look again at once (the iPhone does the same with `numbitePurchasesChanged`). The page asks
 * `iap.entitlements` at start-up and whenever the app comes back to the front anyway; this only makes the news faster. Called from a Play Billing thread.
 */
interface PurchaseUpdateSource {
    var onPurchasesChanged: (() -> Unit)?
}

/** How long each wait may last before the call answers "unavailable" instead of hanging. */
internal data class BillingTimeouts(
    val connectMs: Long = 15_000,
    val queryMs: Long = 15_000,
    /** How long Google Play's own purchase sheet may stay open (the page waits 15 minutes). A result that comes later is kept for the next `iap.entitlements`. */
    val purchaseUiMs: Long = 20 * 60_000,
)

/**
 * Google Play Billing (library 8) behind the page's `iap.*` calls: the Android twin of StoreKitPurchaseService. One process-wide instance ([shared]): one
 * BillingClient, and the purchase that is open lives here, not in the Activity, so a rotation or a recreated Activity doesn't lose it.
 *
 * Play is the source of truth: [entitlements] and [restore] ask it, there is nothing of ours to sync. A purchase is acknowledged only when the page says so
 * ([acknowledge]), after our server has accepted it; this class never acknowledges on its own (Google refunds a purchase that isn't acknowledged in 3 days).
 * Never throws: every failure is `{"error":"unavailable"}`. Logs reason codes only, never a token.
 */
class PlayBillingService internal constructor(
    private val backend: BillingBackend,
    @Volatile internal var activityProvider: () -> Activity?,
    private val openSubscriptions: suspend (Activity?) -> Boolean,
    private val memory: PlanMemory,
    private val timeouts: BillingTimeouts = BillingTimeouts(),
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val log: (String) -> Unit = {},
) : PurchaseService, PurchaseUpdateSource {

    /** The one purchase that may be open. [armed] from just before Play's sheet is launched until it answers. */
    private class Flight {
        val result = CompletableDeferred<PurchaseUpdate>()
        var armed = false
    }

    private val lock = Any()
    private var flight: Flight? = null
    private val unclaimed = LinkedHashMap<String, PlayPurchase>()

    @Volatile
    override var onPurchasesChanged: (() -> Unit)? = null

    init {
        backend.setUpdateListener(::onPurchasesUpdated)
    }

    // ---- the PurchaseService contract: plain JSON, never an exception ----

    override suspend fun products(ids: List<String>): JSONObject = answer { productsAnswer(ids) }
    override suspend fun purchase(productId: String): JSONObject = answer { purchaseAnswer(productId) }
    override suspend fun entitlements(): JSONObject = answer { entitlementsAnswer() }
    override suspend fun restore(): JSONObject = answer { restoreAnswer() }
    override suspend fun manage(): JSONObject = answer { manageAnswer() }
    override suspend fun acknowledge(token: String): JSONObject = answer { acknowledgeAnswer(token) }

    private suspend fun answer(block: suspend () -> Answer): JSONObject = try {
        withContext(dispatcher) { block() }.toJson()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        log("failed: ${e.javaClass.simpleName}")
        Answer.Unavailable.toJson()
    }

    // ---- the logic, in plain types (tested without org.json or Play) ----

    internal suspend fun productsAnswer(ids: List<String>): Answer {
        val wanted = BasePlan.onlyOurs(ids)
        if (wanted.isEmpty()) return Answer.Products(emptyList())
        if (!ready()) return Answer.Unavailable
        val found = withTimeoutOrNull(timeouts.queryMs) { backend.queryProducts(PlayIds.SUBSCRIPTION_ID) }
        if (found == null || found.code != BillingResponseCode.OK) {
            log("products: ${found?.code ?: "timeout"}")
            return Answer.Unavailable
        }
        return Answer.Products(PlayMapping.products(wanted, found.products))
    }

    internal suspend fun purchaseAnswer(planId: String): Answer {
        val plan = BasePlan.parse(planId) ?: return Answer.Unavailable
        val mine = Flight()
        synchronized(lock) {
            if (flight != null) {
                log("purchase: another purchase is open")
                return Answer.Unavailable
            }
            flight = mine
        }
        try {
            return runPurchase(plan, mine)
        } finally {
            synchronized(lock) {
                mine.armed = false
                if (flight === mine) flight = null
            }
        }
    }

    private suspend fun runPurchase(plan: BasePlan, mine: Flight): Answer {
        if (activityProvider() == null) {
            log("purchase: no activity")
            return Answer.Unavailable
        }
        if (!ready()) return Answer.Unavailable

        // What the person holds decides the flow: nothing → a normal purchase; the plan asked for → nothing to buy; another plan of ours → a plan change.
        val held = queryPurchases()?.takeIf { it.code == BillingResponseCode.OK } ?: return Answer.Unavailable
        val paid = PlayMapping.paid(held.purchases)
        var change: PlanChange? = null
        if (paid.isNotEmpty()) {
            val same = paid.firstOrNull { memory.planOf(it.token) == plan }
            if (same != null) {
                log("purchase: already on ${plan.baseId}")
                return Answer.Purchases(listOf(same))
            }
            val replaced = paid.firstOrNull { it.autoRenewing } ?: paid.first()
            change = PlanChange(replaced.token, plan.replacementMode)
        } else if (PlayMapping.pending(held.purchases).isNotEmpty()) {
            log("purchase: a payment is already pending")
            return Answer.Pending
        }

        val found = withTimeoutOrNull(timeouts.queryMs) { backend.queryProducts(PlayIds.SUBSCRIPTION_ID) }
        if (found == null || found.code != BillingResponseCode.OK) {
            log("purchase: products ${found?.code ?: "timeout"}")
            return Answer.Unavailable
        }
        val product = found.products.firstOrNull { it.productId == PlayIds.SUBSCRIPTION_ID }
        val offer = product?.let { PlayMapping.selectOffer(it, plan) }
        if (product == null || offer == null) {
            log("purchase: no offer for ${plan.baseId}")
            return Answer.Unavailable
        }
        val activity = activityProvider() ?: return Answer.Unavailable.also { log("purchase: no activity") }

        synchronized(lock) { mine.armed = true }
        val code = backend.launch(activity, product, offer.offerToken, change)
        if (code != BillingResponseCode.OK) {
            log("purchase: launch code=$code")
            return when (code) {
                BillingResponseCode.USER_CANCELED -> Answer.Cancelled
                BillingResponseCode.ITEM_ALREADY_OWNED -> resolveOwned()
                else -> Answer.Unavailable
            }
        }
        val update = withTimeoutOrNull(timeouts.purchaseUiMs) { mine.result.await() }
        return when (update) {
            is PurchaseUpdate.Purchased -> {
                update.purchases.firstOrNull()?.let { memory.remember(it.token, plan) }
                Answer.Purchases(update.purchases)
            }
            PurchaseUpdate.Pending -> Answer.Pending
            PurchaseUpdate.Cancelled -> Answer.Cancelled
            PurchaseUpdate.AlreadyOwned -> resolveOwned()
            PurchaseUpdate.Failed, null -> Answer.Unavailable
        }
    }

    /** Play says the person already has it: answer with what they hold now. */
    private suspend fun resolveOwned(): Answer {
        val owned = queryPurchases()?.takeIf { it.code == BillingResponseCode.OK } ?: return Answer.Unavailable
        val paid = PlayMapping.paid(owned.purchases)
        return when {
            paid.isNotEmpty() -> Answer.Purchases(paid)
            PlayMapping.pending(owned.purchases).isNotEmpty() -> Answer.Pending
            else -> Answer.Unavailable
        }
    }

    internal suspend fun entitlementsAnswer(): Answer {
        if (!ready()) return Answer.Unavailable
        return currentEntitlements()
    }

    internal suspend fun restoreAnswer(): Answer {
        // while a purchase is open the connection is left alone: Play's sheet answers through it
        if (synchronized(lock) { flight != null }) return entitlementsAnswer()
        val code = withTimeoutOrNull(timeouts.connectMs) { backend.reconnect(timeouts.connectMs) } ?: NO_ANSWER_IN_TIME
        if (code != BillingResponseCode.OK) {
            log("restore: connect code=$code")
            return Answer.Unavailable
        }
        return currentEntitlements()
    }

    /** What Play says is paid now, plus what arrived through the listener with nobody waiting (until Play's own list has caught up). */
    private suspend fun currentEntitlements(): Answer {
        val q = queryPurchases()
        if (q == null || q.code != BillingResponseCode.OK) {
            log("entitlements: ${q?.code ?: "timeout"}")
            return Answer.Unavailable
        }
        val paid = PlayMapping.paid(q.purchases)
        val all = synchronized(lock) {
            val late = unclaimed.values.filter { extra -> paid.none { it.token == extra.token } }
            unclaimed.clear()
            paid + late
        }
        return Answer.Purchases(all)
    }

    internal suspend fun manageAnswer(): Answer = if (openSubscriptions(activityProvider())) Answer.Done else Answer.Unavailable

    internal suspend fun acknowledgeAnswer(token: String): Answer {
        if (!PlayMapping.isPlausibleToken(token)) return Answer.Unavailable
        if (!ready()) return Answer.Unavailable
        val code = withTimeoutOrNull(timeouts.queryMs) { backend.acknowledge(token) } ?: NO_ANSWER_IN_TIME
        if (code == BillingResponseCode.OK || code == BillingResponseCode.ITEM_NOT_OWNED) return Answer.Done
        log("acknowledge: code=$code")
        // Play's answer for a purchase that is already acknowledged, or gone, isn't documented: ask what is held
        val q = queryPurchases()
        if (q != null && q.code == BillingResponseCode.OK) {
            val held = q.purchases.firstOrNull { it.token == token }
            if (held == null || held.acknowledged) return Answer.Done
        }
        return Answer.Unavailable
    }

    // ---- Play's purchase listener ----

    private fun onPurchasesUpdated(code: Int, purchases: List<PlayPurchase>) {
        val update = PlayMapping.classifyUpdate(code, purchases)
        val claimed = synchronized(lock) {
            val open = flight
            if (open != null && open.armed && !open.result.isCompleted) {
                open.result.complete(update)
                true
            } else {
                if (update is PurchaseUpdate.Purchased) update.purchases.forEach { unclaimed[it.token] = it }
                false
            }
        }
        log("update: code=$code ${update.javaClass.simpleName} claimed=$claimed")
        if (!claimed && update is PurchaseUpdate.Purchased) onPurchasesChanged?.invoke()
    }

    // ---- small helpers ----

    private suspend fun ready(): Boolean {
        val code = withTimeoutOrNull(timeouts.connectMs) { backend.ensureReady(timeouts.connectMs) } ?: NO_ANSWER_IN_TIME
        if (code != BillingResponseCode.OK) log("connect: code=$code")
        return code == BillingResponseCode.OK
    }

    private suspend fun queryPurchases(): PurchasesResult? = withTimeoutOrNull(timeouts.queryMs) { backend.queryPurchases() }

    companion object {
        private const val TAG = "NumbiteBilling"
        private val sharedLock = Any()

        @Volatile
        private var shared: PlayBillingService? = null

        /**
         * The process-wide service. Asking again (a new Activity after a rotation) only replaces [activityProvider]; the connection and an open purchase stay.
         * The provider is held until replaced, so it should read the current Activity from a holder (a WeakReference), not capture one.
         */
        fun shared(appContext: Context, activityProvider: () -> Activity?): PlayBillingService {
            val context = appContext.applicationContext ?: appContext
            val service = shared ?: synchronized(sharedLock) {
                shared ?: create(context, activityProvider).also { shared = it }
            }
            service.activityProvider = activityProvider
            return service
        }

        private fun create(context: Context, activityProvider: () -> Activity?): PlayBillingService {
            val log: (String) -> Unit = { Log.d(TAG, it) }
            return PlayBillingService(
                backend = RealBillingBackend(context, log),
                activityProvider = activityProvider,
                openSubscriptions = { activity -> openSubscriptionsScreen(context, activity) },
                memory = PrefsPlanMemory(context),
                log = log,
            )
        }

        /** Google Play's page for our subscription (change plan, cancel, resubscribe): in the foreground Activity's task, or a new task if there is none. */
        private suspend fun openSubscriptionsScreen(context: Context, activity: Activity?): Boolean = withContext(Dispatchers.Main.immediate) {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(PlayIds.MANAGE_URL))
            try {
                if (activity != null) {
                    activity.startActivity(intent)
                } else {
                    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                true
            } catch (e: ActivityNotFoundException) {
                false
            }
        }
    }
}
