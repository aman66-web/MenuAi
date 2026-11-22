package com.amanmarwaha.numbite.billing

import android.app.Activity
import com.amanmarwaha.numbite.billing.Fixtures.ANNUAL_TOKEN
import com.amanmarwaha.numbite.billing.Fixtures.MONTHLY_TOKEN
import com.amanmarwaha.numbite.billing.Fixtures.purchase
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingFlowParams.SubscriptionUpdateParams.ReplacementMode
import com.android.billingclient.api.Purchase.PurchaseState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/** The state machine behind the page's iap.* calls, against a fake Play connection: no Play, no Android, no org.json (answers are checked as [Answer]). */
class PlayBillingServiceTest {
    private val activity: Activity = Activity()

    private fun service(
        backend: BillingBackend,
        provider: () -> Activity? = { activity },
        memory: PlanMemory = InMemoryPlanMemory(),
        timeouts: BillingTimeouts = BillingTimeouts(connectMs = 300, queryMs = 300, purchaseUiMs = 3_000),
        opener: suspend (Activity?) -> Boolean = { true },
    ) = PlayBillingService(backend, provider, opener, memory, timeouts, Dispatchers.Default)

    private fun paid(vararg tokens: String) = Answer.Purchases(tokens.map { purchase(it) })
    private fun tokensOf(a: Answer) = (a as Answer.Purchases).purchases.map { it.token }
    private fun blocking(block: suspend kotlinx.coroutines.CoroutineScope.() -> Unit) = runBlocking { withTimeout(10_000) { block() } }

    // ---- products ----

    @Test
    fun productsAnswersBothPlans() = blocking {
        val answer = service(FakeBackend()).productsAnswer(listOf(BasePlan.ANNUAL.planId, BasePlan.MONTHLY.planId)) as Answer.Products
        assertEquals(listOf("Annual" to "£49.99", "Monthly" to "£4.99"), answer.products.map { it.name to it.price })
    }

    @Test
    fun productsWithNoOfOurIdsNeedsNoConnection() = blocking {
        val backend = FakeBackend()
        assertEquals(Answer.Products(emptyList()), service(backend).productsAnswer(listOf("com.amanmarwaha.numbite.pro.annual")))
        assertEquals(0, backend.connects)
    }

    @Test
    fun productsIsUnavailableWhenPlayCannotBeConnected() = blocking {
        val backend = FakeBackend().apply { connectCode = BillingResponseCode.BILLING_UNAVAILABLE }
        assertEquals(Answer.Unavailable, service(backend).productsAnswer(listOf(BasePlan.ANNUAL.planId)))
    }

    @Test
    fun productsIsUnavailableWhenTheQueryFails() = blocking {
        val backend = FakeBackend().apply { productsCode = BillingResponseCode.NETWORK_ERROR }
        assertEquals(Answer.Unavailable, service(backend).productsAnswer(listOf(BasePlan.ANNUAL.planId)))
    }

    @Test
    fun aConnectionThatNeverAnswersDoesNotHangTheCall() = blocking {
        val backend = FakeBackend().apply { hangConnect = true }
        val svc = service(backend, timeouts = BillingTimeouts(connectMs = 100, queryMs = 100, purchaseUiMs = 1_000))
        assertEquals(Answer.Unavailable, svc.productsAnswer(listOf(BasePlan.ANNUAL.planId)))
        assertEquals(Answer.Unavailable, svc.entitlementsAnswer())
        assertEquals(Answer.Unavailable, svc.purchaseAnswer(BasePlan.ANNUAL.planId))
        assertEquals(Answer.Unavailable, svc.acknowledgeAnswer("tok"))
    }

    // ---- purchase ----

    @Test
    fun aPurchaseOpensPlaysSheetWithTheBasePlansOfferAndAnswersWithThePaidPurchase() = blocking {
        val backend = FakeBackend().apply { onLaunch = { it.deliver(BillingResponseCode.OK, purchase("new-token")) } }
        val answer = service(backend).purchaseAnswer(BasePlan.ANNUAL.planId)
        assertEquals(paid("new-token"), answer)
        assertEquals(listOf(FakeBackend.Launch(ANNUAL_TOKEN, null)), backend.launches)
    }

    @Test
    fun theMonthlyPlanUsesTheMonthlyOffer() = blocking {
        val backend = FakeBackend().apply { onLaunch = { it.deliver(BillingResponseCode.OK, purchase("m")) } }
        service(backend).purchaseAnswer(BasePlan.MONTHLY.planId)
        assertEquals(MONTHLY_TOKEN, backend.launches.single().offerToken)
    }

    @Test
    fun theResultMayComeAfterLaunchReturns() = blocking {
        val backend = FakeBackend()
        val svc = service(backend)
        val result = async(Dispatchers.Default) { svc.purchaseAnswer(BasePlan.ANNUAL.planId) }
        while (backend.launches.isEmpty()) delay(5)
        backend.deliver(BillingResponseCode.OK, purchase("later"))
        assertEquals(paid("later"), result.await())
    }

    @Test
    fun aPurchaseWithAFreeTrialOfferIsAvoidedWhenAPlainOneExists() = blocking {
        val trial = Fixtures.offer("annual", "trial-token", "free-week", Fixtures.phase("£0.00", "P1W", 0, 2, 1), Fixtures.phase("£49.99", "P1Y", 49_990_000))
        val backend = FakeBackend().apply {
            products = listOf(Fixtures.product(listOf(trial) + Fixtures.standardOffers()))
            onLaunch = { it.deliver(BillingResponseCode.OK, purchase("p")) }
        }
        service(backend).purchaseAnswer(BasePlan.ANNUAL.planId)
        assertEquals(ANNUAL_TOKEN, backend.launches.single().offerToken)
    }

    @Test
    fun aPendingPaymentIsPendingNotAnEntitlement() = blocking {
        val backend = FakeBackend().apply { onLaunch = { it.deliver(BillingResponseCode.OK, purchase("slow", state = PurchaseState.PENDING)) } }
        assertEquals(Answer.Pending, service(backend).purchaseAnswer(BasePlan.MONTHLY.planId))
    }

    @Test
    fun cancellingInPlaysSheetIsCancelled() = blocking {
        val backend = FakeBackend().apply { onLaunch = { it.deliver(BillingResponseCode.USER_CANCELED) } }
        assertEquals(Answer.Cancelled, service(backend).purchaseAnswer(BasePlan.MONTHLY.planId))
    }

    @Test
    fun anyOtherErrorFromPlaysSheetIsUnavailable() = blocking {
        listOf(BillingResponseCode.ERROR, BillingResponseCode.ITEM_UNAVAILABLE, BillingResponseCode.SERVICE_UNAVAILABLE, BillingResponseCode.DEVELOPER_ERROR).forEach { code ->
            val backend = FakeBackend().apply { onLaunch = { it.deliver(code) } }
            assertEquals("code $code", Answer.Unavailable, service(backend).purchaseAnswer(BasePlan.MONTHLY.planId))
        }
    }

    @Test
    fun aSheetThatCannotBeLaunchedIsUnavailable() = blocking {
        val backend = FakeBackend().apply { launchCode = BillingResponseCode.DEVELOPER_ERROR }
        assertEquals(Answer.Unavailable, service(backend).purchaseAnswer(BasePlan.MONTHLY.planId))
    }

    @Test
    fun alreadyOwnedFromTheListenerIsSuccessWithTheOwnedPurchase() = blocking {
        val backend = FakeBackend().apply {
            onLaunch = {
                // Play says it is owned; what is held is the plan asked for, which this phone has no record of
                it.purchases.add(purchase("held"))
                it.deliver(BillingResponseCode.ITEM_ALREADY_OWNED)
            }
        }
        // a held purchase makes it a plan change in the first place; give Play a stale first answer instead
        val first = AtomicInteger()
        val stale = object : BillingBackendDelegate(backend) {
            override suspend fun queryPurchases(): PurchasesResult =
                if (first.getAndIncrement() == 0) PurchasesResult(BillingResponseCode.OK, emptyList()) else backend.queryPurchases()
        }
        assertEquals(paid("held"), service(stale).purchaseAnswer(BasePlan.ANNUAL.planId))
    }

    @Test
    fun alreadyOwnedFromLaunchIsSuccessWithTheOwnedPurchase() = blocking {
        val backend = FakeBackend().apply {
            launchCode = BillingResponseCode.ITEM_ALREADY_OWNED
            onLaunch = { it.purchases.add(purchase("held")) }
        }
        val first = AtomicInteger()
        val stale = object : BillingBackendDelegate(backend) {
            override suspend fun queryPurchases(): PurchasesResult =
                if (first.getAndIncrement() == 0) PurchasesResult(BillingResponseCode.OK, emptyList()) else backend.queryPurchases()
        }
        assertEquals(paid("held"), service(stale).purchaseAnswer(BasePlan.ANNUAL.planId))
    }

    @Test
    fun alreadyOwnedWithNothingHeldIsUnavailable() = blocking {
        val backend = FakeBackend().apply { launchCode = BillingResponseCode.ITEM_ALREADY_OWNED }
        assertEquals(Answer.Unavailable, service(backend).purchaseAnswer(BasePlan.ANNUAL.planId))
    }

    @Test
    fun aPurchaseNeedsAnActivityAndDoesNothingWithoutOne() = blocking {
        val backend = FakeBackend()
        assertEquals(Answer.Unavailable, service(backend, provider = { null }).purchaseAnswer(BasePlan.ANNUAL.planId))
        assertEquals(0, backend.connects)
        assertTrue(backend.launches.isEmpty())
    }

    @Test
    fun aPlanThatIsNotOursIsRefusedWithoutAskingPlay() = blocking {
        val backend = FakeBackend()
        assertEquals(Answer.Unavailable, service(backend).purchaseAnswer("com.amanmarwaha.numbite.pro.annual"))
        assertEquals(Answer.Unavailable, service(backend).purchaseAnswer(""))
        assertEquals(0, backend.connects)
    }

    @Test
    fun noOfferForThePlanIsUnavailable() = blocking {
        val backend = FakeBackend().apply { products = listOf(Fixtures.product(emptyList())) }
        assertEquals(Answer.Unavailable, service(backend).purchaseAnswer(BasePlan.ANNUAL.planId))
        assertTrue(backend.launches.isEmpty())
    }

    @Test
    fun ifPlayCannotSayWhatIsHeldNothingIsLaunched() = blocking {
        val backend = FakeBackend().apply { purchasesCode = BillingResponseCode.SERVICE_UNAVAILABLE }
        assertEquals(Answer.Unavailable, service(backend).purchaseAnswer(BasePlan.ANNUAL.planId))
        assertTrue(backend.launches.isEmpty())
    }

    // ---- one purchase at a time ----

    @Test
    fun aSecondPurchaseWhileOneIsOpenIsUnavailableAndTheFirstIsUnharmed() = blocking {
        val gate = CompletableDeferred<Unit>()
        val backend = FakeBackend().apply { launchGate = gate }
        val svc = service(backend)
        val first = async(Dispatchers.Default) { svc.purchaseAnswer(BasePlan.ANNUAL.planId) }
        while (backend.launches.isEmpty()) delay(5)

        assertEquals(Answer.Unavailable, svc.purchaseAnswer(BasePlan.MONTHLY.planId))
        assertEquals(1, backend.launches.size)

        gate.complete(Unit)
        backend.deliver(BillingResponseCode.OK, purchase("first"))
        assertEquals(paid("first"), first.await())
    }

    @Test
    fun afterOneFinishesTheNextCanStart() = blocking {
        val backend = FakeBackend().apply { onLaunch = { it.deliver(BillingResponseCode.USER_CANCELED) } }
        val svc = service(backend)
        assertEquals(Answer.Cancelled, svc.purchaseAnswer(BasePlan.ANNUAL.planId))
        assertEquals(Answer.Cancelled, svc.purchaseAnswer(BasePlan.MONTHLY.planId))
        assertEquals(2, backend.launches.size)
    }

    @Test
    fun racingPurchasesLaunchExactlyOneSheet() = blocking {
        val gate = CompletableDeferred<Unit>()
        val backend = FakeBackend().apply { launchGate = gate }
        val svc = service(backend)
        val racers = List(8) { async(Dispatchers.Default) { svc.purchaseAnswer(BasePlan.ANNUAL.planId) } }
        // give the losers time to be refused, then let the winner's sheet answer
        while (backend.launches.isEmpty()) delay(5)
        delay(100)
        gate.complete(Unit)
        backend.deliver(BillingResponseCode.OK, purchase("winner"))
        val answers = racers.awaitAll()
        assertEquals(1, backend.launches.size)
        assertEquals(1, answers.count { it is Answer.Purchases })
        assertEquals(7, answers.count { it == Answer.Unavailable })
    }

    @Test
    fun aSheetThatNeverAnswersTimesOutAndFreesTheSlot() = blocking {
        val backend = FakeBackend()
        val svc = service(backend, timeouts = BillingTimeouts(connectMs = 300, queryMs = 300, purchaseUiMs = 150))
        assertEquals(Answer.Unavailable, svc.purchaseAnswer(BasePlan.ANNUAL.planId))
        backend.onLaunch = { it.deliver(BillingResponseCode.OK, purchase("ok")) }
        assertEquals(paid("ok"), svc.purchaseAnswer(BasePlan.ANNUAL.planId))
    }

    @Test
    fun ifTheCallerIsCancelledTheSlotIsFreedAndALateResultIsKeptForTheNextEntitlementsCheck() = blocking {
        val backend = FakeBackend()
        val svc = service(backend)
        val changed = AtomicInteger()
        svc.onPurchasesChanged = { changed.incrementAndGet() }

        val caller = launch(Dispatchers.Default) { svc.purchaseAnswer(BasePlan.ANNUAL.planId) }
        while (backend.launches.isEmpty()) delay(5)
        caller.cancelAndJoin() // e.g. the Activity's scope was cancelled by a rotation

        // Play's sheet finishes anyway, with nobody waiting
        val late = purchase("late-token")
        backend.deliver(BillingResponseCode.OK, late)
        assertEquals(1, changed.get())
        // Play's own list may not have it yet: the late purchase is still returned
        assertEquals(listOf("late-token"), tokensOf(svc.entitlementsAnswer()))
        // and the slot is free again
        backend.onLaunch = { it.deliver(BillingResponseCode.USER_CANCELED) }
        assertEquals(Answer.Cancelled, svc.purchaseAnswer(BasePlan.ANNUAL.planId))
    }

    // ---- changing plan ----

    @Test
    fun holdingAnotherPlanAsksPlayForAChangeToAnnualChargedAtOnce() = blocking {
        val backend = FakeBackend().apply {
            purchases.add(purchase("monthly-token"))
            onLaunch = { it.deliver(BillingResponseCode.OK, purchase("annual-token")) }
        }
        val memory = InMemoryPlanMemory().apply { remember("monthly-token", BasePlan.MONTHLY) }
        assertEquals(paid("annual-token"), service(backend, memory = memory).purchaseAnswer(BasePlan.ANNUAL.planId))
        assertEquals(FakeBackend.Launch(ANNUAL_TOKEN, PlanChange("monthly-token", ReplacementMode.CHARGE_FULL_PRICE)), backend.launches.single())
    }

    @Test
    fun holdingAnotherPlanAsksPlayForAChangeToMonthlyWithNothingChargedNow() = blocking {
        val backend = FakeBackend().apply {
            purchases.add(purchase("annual-token"))
            onLaunch = { it.deliver(BillingResponseCode.OK, purchase("monthly-token")) }
        }
        val memory = InMemoryPlanMemory().apply { remember("annual-token", BasePlan.ANNUAL) }
        assertEquals(paid("monthly-token"), service(backend, memory = memory).purchaseAnswer(BasePlan.MONTHLY.planId))
        assertEquals(FakeBackend.Launch(MONTHLY_TOKEN, PlanChange("annual-token", ReplacementMode.WITHOUT_PRORATION)), backend.launches.single())
    }

    @Test
    fun holdingAPurchaseOfUnknownPlanIsAlsoAPlanChangeNeverASecondSubscription() = blocking {
        val backend = FakeBackend().apply {
            purchases.add(purchase("held"))
            onLaunch = { it.deliver(BillingResponseCode.OK, purchase("new")) }
        }
        service(backend).purchaseAnswer(BasePlan.ANNUAL.planId)
        assertEquals("held", backend.launches.single().change?.oldToken)
    }

    @Test
    fun theAutoRenewingPurchaseIsTheOneReplaced() = blocking {
        val backend = FakeBackend().apply {
            purchases.addAll(listOf(purchase("ending", autoRenewing = false), purchase("renewing", autoRenewing = true)))
            onLaunch = { it.deliver(BillingResponseCode.OK, purchase("new")) }
        }
        service(backend).purchaseAnswer(BasePlan.ANNUAL.planId)
        assertEquals("renewing", backend.launches.single().change?.oldToken)
    }

    @Test
    fun askingForThePlanAlreadyHeldBuysNothingAndAnswersWithIt() = blocking {
        val backend = FakeBackend().apply { purchases.add(purchase("mine")) }
        val memory = InMemoryPlanMemory().apply { remember("mine", BasePlan.ANNUAL) }
        assertEquals(paid("mine"), service(backend, memory = memory).purchaseAnswer(BasePlan.ANNUAL.planId))
        assertTrue(backend.launches.isEmpty())
    }

    @Test
    fun aSuccessfulPurchaseIsRememberedSoTheSamePlanIsNotBoughtTwice() = blocking {
        val backend = FakeBackend().apply { onLaunch = { it.deliver(BillingResponseCode.OK, purchase("bought")); it.purchases.add(purchase("bought")) } }
        val svc = service(backend)
        assertEquals(paid("bought"), svc.purchaseAnswer(BasePlan.ANNUAL.planId))
        assertEquals(paid("bought"), svc.purchaseAnswer(BasePlan.ANNUAL.planId))
        assertEquals(1, backend.launches.size)
    }

    @Test
    fun aPendingPaymentAlreadyOpenIsNotStartedAgain() = blocking {
        val backend = FakeBackend().apply { purchases.add(purchase("waiting", state = PurchaseState.PENDING)) }
        assertEquals(Answer.Pending, service(backend).purchaseAnswer(BasePlan.ANNUAL.planId))
        assertTrue(backend.launches.isEmpty())
    }

    // ---- entitlements ----

    @Test
    fun entitlementsAreOurPaidPurchasesIncludingUnacknowledgedOnes() = blocking {
        val backend = FakeBackend().apply {
            purchases.addAll(
                listOf(
                    purchase("acknowledged", acknowledged = true),
                    purchase("fresh", acknowledged = false),
                    purchase("pending", state = PurchaseState.PENDING),
                    purchase("other-product", products = listOf("something.else")),
                ),
            )
        }
        assertEquals(listOf("acknowledged", "fresh"), tokensOf(service(backend).entitlementsAnswer()))
    }

    @Test
    fun noPurchasesIsARealAnswerNotAnError() = blocking {
        assertEquals(Answer.Purchases(emptyList()), service(FakeBackend()).entitlementsAnswer())
    }

    @Test
    fun entitlementsIsUnavailableWhenPlayFails() = blocking {
        assertEquals(Answer.Unavailable, service(FakeBackend().apply { purchasesCode = BillingResponseCode.SERVICE_DISCONNECTED }).entitlementsAnswer())
        assertEquals(Answer.Unavailable, service(FakeBackend().apply { connectCode = BillingResponseCode.ERROR }).entitlementsAnswer())
    }

    @Test
    fun aPurchaseThatArrivedWithNobodyWaitingIsReturnedOnceAndNotDuplicated() = blocking {
        val backend = FakeBackend()
        val svc = service(backend)
        val changed = AtomicInteger()
        svc.onPurchasesChanged = { changed.incrementAndGet() }

        backend.deliver(BillingResponseCode.OK, purchase("outside"))
        assertEquals(1, changed.get())
        assertEquals(listOf("outside"), tokensOf(svc.entitlementsAnswer()))

        // once Play's own list has it, it appears once; the kept copy is gone
        backend.purchases.add(purchase("outside"))
        assertEquals(listOf("outside"), tokensOf(svc.entitlementsAnswer()))
        backend.purchases.clear()
        assertEquals(emptyList<String>(), tokensOf(svc.entitlementsAnswer()))
    }

    @Test
    fun aPendingOrCancelledUpdateWithNobodyWaitingIsIgnored() = blocking {
        val backend = FakeBackend()
        val svc = service(backend)
        val changed = AtomicInteger()
        svc.onPurchasesChanged = { changed.incrementAndGet() }
        backend.deliver(BillingResponseCode.OK, purchase("p", state = PurchaseState.PENDING))
        backend.deliver(BillingResponseCode.USER_CANCELED)
        backend.deliver(BillingResponseCode.ERROR)
        assertEquals(0, changed.get())
        assertEquals(Answer.Purchases(emptyList()), svc.entitlementsAnswer())
    }

    // ---- restore ----

    @Test
    fun restoreConnectsAfreshAndAnswersLikeEntitlements() = blocking {
        val backend = FakeBackend().apply { purchases.add(purchase("held", acknowledged = true)) }
        assertEquals(paid("held").purchases.map { it.token }, tokensOf(service(backend).restoreAnswer()))
        assertEquals(1, backend.reconnects)
    }

    @Test
    fun restoreIsUnavailableWhenTheFreshConnectionFails() = blocking {
        val backend = FakeBackend().apply { reconnectCode = BillingResponseCode.SERVICE_UNAVAILABLE }
        assertEquals(Answer.Unavailable, service(backend).restoreAnswer())
    }

    @Test
    fun restoreLeavesTheConnectionAloneWhileAPurchaseIsOpen() = blocking {
        val gate = CompletableDeferred<Unit>()
        val backend = FakeBackend().apply { launchGate = gate }
        val svc = service(backend)
        val open = async(Dispatchers.Default) { svc.purchaseAnswer(BasePlan.ANNUAL.planId) }
        while (backend.launches.isEmpty()) delay(5)

        svc.restoreAnswer()
        assertEquals(0, backend.reconnects)

        gate.complete(Unit)
        backend.deliver(BillingResponseCode.USER_CANCELED)
        open.await()
    }

    // ---- acknowledge ----

    @Test
    fun acknowledgeAsksPlayAndAnswersDone() = blocking {
        val backend = FakeBackend()
        assertEquals(Answer.Done, service(backend).acknowledgeAnswer("tok-1"))
        assertEquals(listOf("tok-1"), backend.acks.toList())
    }

    @Test
    fun acknowledgingAPurchaseThatIsGoneIsDone() = blocking {
        assertEquals(Answer.Done, service(FakeBackend().apply { ackCode = BillingResponseCode.ITEM_NOT_OWNED }).acknowledgeAnswer("gone"))
        // some other failure code, and Play no longer lists it
        assertEquals(Answer.Done, service(FakeBackend().apply { ackCode = BillingResponseCode.DEVELOPER_ERROR }).acknowledgeAnswer("gone"))
    }

    @Test
    fun acknowledgingAnAlreadyAcknowledgedPurchaseIsDone() = blocking {
        val backend = FakeBackend().apply {
            ackCode = BillingResponseCode.DEVELOPER_ERROR
            purchases.add(purchase("done-before", acknowledged = true))
        }
        assertEquals(Answer.Done, service(backend).acknowledgeAnswer("done-before"))
    }

    @Test
    fun aFailedAcknowledgeOfAPurchaseStillOpenIsUnavailable() = blocking {
        val backend = FakeBackend().apply {
            ackCode = BillingResponseCode.SERVICE_UNAVAILABLE
            purchases.add(purchase("open", acknowledged = false))
        }
        assertEquals(Answer.Unavailable, service(backend).acknowledgeAnswer("open"))
        // and when Play can't even say what is held
        val blind = FakeBackend().apply { ackCode = BillingResponseCode.NETWORK_ERROR; purchasesCode = BillingResponseCode.NETWORK_ERROR }
        assertEquals(Answer.Unavailable, service(blind).acknowledgeAnswer("open"))
    }

    @Test
    fun aTokenThatCouldNotBeOneIsRefusedWithoutAskingPlay() = blocking {
        val backend = FakeBackend()
        assertEquals(Answer.Unavailable, service(backend).acknowledgeAnswer(""))
        assertEquals(Answer.Unavailable, service(backend).acknowledgeAnswer("has space"))
        assertEquals(0, backend.connects)
    }

    @Test
    fun nothingEverAcknowledgesOnItsOwn() = blocking {
        val backend = FakeBackend().apply {
            purchases.add(purchase("fresh", acknowledged = false))
            onLaunch = { it.deliver(BillingResponseCode.OK, purchase("bought", acknowledged = false)) }
        }
        val svc = service(backend)
        svc.productsAnswer(listOf(BasePlan.ANNUAL.planId))
        svc.entitlementsAnswer()
        svc.restoreAnswer()
        svc.purchaseAnswer(BasePlan.ANNUAL.planId)
        backend.deliver(BillingResponseCode.OK, purchase("outside"))
        svc.entitlementsAnswer()
        assertTrue("acknowledged on its own: ${backend.acks}", backend.acks.isEmpty())
    }

    // ---- manage ----

    @Test
    fun manageOpensPlaysSubscriptionScreenWithTheCurrentActivity() = blocking {
        var seen: Activity? = null
        val svc = service(FakeBackend(), opener = { seen = it; true })
        assertEquals(Answer.Done, svc.manageAnswer())
        assertEquals(activity, seen)
    }

    @Test
    fun manageWorksWithoutAnActivityAndSaysUnavailableIfNothingCanOpenIt() = blocking {
        var seen: Activity? = activity
        val svc = service(FakeBackend(), provider = { null }, opener = { seen = it; true })
        assertEquals(Answer.Done, svc.manageAnswer())
        assertNull(seen)
        assertEquals(Answer.Unavailable, service(FakeBackend(), opener = { false }).manageAnswer())
    }

    // ---- the public contract never throws ----

    @Test
    fun aBackendThatThrowsStillGivesAnAnswerNeverAnException() = blocking {
        val exploding = object : BillingBackendDelegate(FakeBackend()) {
            override suspend fun ensureReady(timeoutMs: Long): Int = throw IllegalStateException("boom")
        }
        val svc = service(exploding)
        // the guarded public calls would convert to JSON (needs org.json); the logic functions let it through to that guard
        val failed = runCatching { svc.entitlementsAnswer() }
        assertTrue(failed.isFailure)
        if (Fixtures.orgJsonWorks()) {
            assertEquals("""{"error":"unavailable"}""", svc.entitlements().toString())
            assertEquals("""{"error":"unavailable"}""", svc.purchase(BasePlan.ANNUAL.planId).toString())
        }
    }

    /** Forwards everything to another backend; a test overrides one call. */
    private open class BillingBackendDelegate(private val inner: FakeBackend) : BillingBackend {
        override fun setUpdateListener(listener: (code: Int, purchases: List<PlayPurchase>) -> Unit) = inner.setUpdateListener(listener)
        override suspend fun ensureReady(timeoutMs: Long) = inner.ensureReady(timeoutMs)
        override suspend fun reconnect(timeoutMs: Long) = inner.reconnect(timeoutMs)
        override suspend fun queryProducts(productId: String) = inner.queryProducts(productId)
        override suspend fun queryPurchases() = inner.queryPurchases()
        override suspend fun launch(activity: Activity, product: PlayProduct, offerToken: String, change: PlanChange?) =
            inner.launch(activity, product, offerToken, change)
        override suspend fun acknowledge(token: String) = inner.acknowledge(token)
    }
}
