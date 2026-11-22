package com.amanmarwaha.numbite.billing

import com.amanmarwaha.numbite.billing.Fixtures.ANNUAL_TOKEN
import com.amanmarwaha.numbite.billing.Fixtures.MONTHLY_TOKEN
import com.amanmarwaha.numbite.billing.Fixtures.offer
import com.amanmarwaha.numbite.billing.Fixtures.phase
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingFlowParams.SubscriptionUpdateParams.ReplacementMode
import com.android.billingclient.api.ProductDetails.RecurrenceMode
import com.android.billingclient.api.Purchase.PurchaseState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.json.JSONObject
import org.junit.Assume.assumeTrue
import org.junit.Test

class PlayPlansTest {
    // ---- plan ids ----

    @Test
    fun planIdsAreSubscriptionColonBasePlan() {
        assertEquals("com.amanmarwaha.numbite.premium:annual", BasePlan.ANNUAL.planId)
        assertEquals("com.amanmarwaha.numbite.premium:monthly", BasePlan.MONTHLY.planId)
        assertEquals(BasePlan.ANNUAL, BasePlan.parse("com.amanmarwaha.numbite.premium:annual"))
        assertEquals(BasePlan.MONTHLY, BasePlan.parse("com.amanmarwaha.numbite.premium:monthly"))
    }

    @Test
    fun anythingElseIsNotOurPlan() {
        assertNull(BasePlan.parse("com.amanmarwaha.numbite.pro.annual")) // the iPhone's ids
        assertNull(BasePlan.parse("com.amanmarwaha.numbite.premium"))
        assertNull(BasePlan.parse("com.amanmarwaha.numbite.premium:weekly"))
        assertNull(BasePlan.parse(""))
    }

    @Test
    fun onlyOursKeepsTheOrderAndDropsDuplicatesAndStrangers() {
        val ids = listOf(BasePlan.MONTHLY.planId, "nope", BasePlan.ANNUAL.planId, BasePlan.MONTHLY.planId)
        assertEquals(listOf(BasePlan.MONTHLY, BasePlan.ANNUAL), BasePlan.onlyOurs(ids))
        assertEquals(emptyList<BasePlan>(), BasePlan.onlyOurs(emptyList()))
    }

    @Test
    fun manageUrlNamesOurSubscriptionAndPackage() {
        assertEquals(
            "https://play.google.com/store/account/subscriptions?sku=com.amanmarwaha.numbite.premium&package=com.amanmarwaha.numbite",
            PlayIds.MANAGE_URL,
        )
    }

    // ---- replacement mode ----

    @Test
    fun toAnnualTheYearIsChargedNowToMonthlyNothingIsChargedUntilTheYearEnds() {
        assertEquals(ReplacementMode.CHARGE_FULL_PRICE, BasePlan.ANNUAL.replacementMode)
        assertEquals(ReplacementMode.WITHOUT_PRORATION, BasePlan.MONTHLY.replacementMode)
    }

    @Test
    fun replacementModesAreOnesPlayAllowsBetweenAutoRenewingPlansOfOneSubscription() {
        val allowed = setOf(ReplacementMode.CHARGE_FULL_PRICE, ReplacementMode.WITHOUT_PRORATION)
        BasePlan.entries.forEach { assertTrue(it.replacementMode in allowed) }
    }

    // ---- billing period ----

    @Test
    fun onlyAMonthAndAYearAreOurPeriods() {
        assertEquals("month", PlayMapping.periodOf("P1M"))
        assertEquals("year", PlayMapping.periodOf("P1Y"))
        listOf("P1W", "P4W", "P2M", "P3M", "P6M", "P12M", "P2Y", "P1Y6M", "P0D", "", "1M", "p1m").forEach {
            assertNull(it, PlayMapping.periodOf(it))
        }
    }

    // ---- offers ----

    @Test
    fun theRecurringPhaseIsTheLastInfiniteOne() {
        val o = offer(
            "annual", "t", "intro",
            phase("£0.00", "P1W", 0, RecurrenceMode.FINITE_RECURRING, 1),
            phase("£49.99", "P1Y", 49_990_000),
        )
        assertEquals("£49.99", PlayMapping.recurringPhase(o)?.formattedPrice)
        assertNull(PlayMapping.recurringPhase(offer("annual", "t", null, phase("£49.99", "P1Y", 49_990_000, RecurrenceMode.NON_RECURRING))))
    }

    @Test
    fun aFreeFirstPhaseIsATrialAnIntroductoryPriceIsNot() {
        val trial = offer("annual", "t", "trial", phase("£0.00", "P1W", 0, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        val intro = offer("annual", "t", "intro", phase("£1.00", "P1M", 1_000_000, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        val plain = offer("annual", "t", null, phase("£49.99", "P1Y", 49_990_000))
        assertTrue(PlayMapping.hasFreeTrial(trial))
        assertFalse(PlayMapping.hasFreeTrial(intro))
        assertFalse(PlayMapping.hasFreeTrial(plain))
    }

    @Test
    fun theBasePlanWithoutATrialIsChosenAmongSeveralOffers() {
        val trial = offer("annual", "trial-token", "free-week", phase("£0.00", "P1W", 0, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        val base = offer("annual", ANNUAL_TOKEN, null, phase("£49.99", "P1Y", 49_990_000))
        val product = Fixtures.product(listOf(trial, base, offer("monthly", MONTHLY_TOKEN, null, phase("£4.99", "P1M", 4_990_000))))
        assertEquals(ANNUAL_TOKEN, PlayMapping.selectOffer(product, BasePlan.ANNUAL)?.offerToken)
        assertEquals(MONTHLY_TOKEN, PlayMapping.selectOffer(product, BasePlan.MONTHLY)?.offerToken)
    }

    @Test
    fun anOfferWithoutATrialBeatsOneWithATrialEvenIfItIsNotTheBasePlan() {
        val trial = offer("annual", "trial-token", null, phase("£0.00", "P1W", 0, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        val discount = offer("annual", "discount-token", "discount", phase("£39.99", "P1Y", 39_990_000, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        val product = Fixtures.product(listOf(trial, discount))
        assertEquals("discount-token", PlayMapping.selectOffer(product, BasePlan.ANNUAL)?.offerToken)
    }

    @Test
    fun whenEveryOfferHasATrialTheOnlyOneThereIsStillUsed() {
        val trial = offer("annual", "trial-token", null, phase("£0.00", "P1W", 0, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        assertEquals("trial-token", PlayMapping.selectOffer(Fixtures.product(listOf(trial)), BasePlan.ANNUAL)?.offerToken)
    }

    @Test
    fun aPlanWithNoUsableOfferHasNone() {
        val prepaid = offer("annual", "t", null, phase("£49.99", "P1Y", 49_990_000, RecurrenceMode.NON_RECURRING))
        assertNull(PlayMapping.selectOffer(Fixtures.product(listOf(prepaid)), BasePlan.ANNUAL))
        assertNull(PlayMapping.selectOffer(Fixtures.product(emptyList()), BasePlan.MONTHLY))
        assertNull(PlayMapping.selectOffer(Fixtures.product(listOf(offer("weekly", "t", null, phase("£1", "P1W")))), BasePlan.MONTHLY))
    }

    // ---- products answer ----

    @Test
    fun bothPlansAreAnsweredWithPlaysPriceAndOurName() {
        val answer = PlayMapping.products(listOf(BasePlan.ANNUAL, BasePlan.MONTHLY), listOf(Fixtures.product()))
        assertEquals(
            listOf(
                ProductAnswer("com.amanmarwaha.numbite.premium:annual", "Annual", "£49.99", "year"),
                ProductAnswer("com.amanmarwaha.numbite.premium:monthly", "Monthly", "£4.99", "month"),
            ),
            answer,
        )
    }

    @Test
    fun theOrderAskedIsKept() {
        val answer = PlayMapping.products(listOf(BasePlan.MONTHLY, BasePlan.ANNUAL), listOf(Fixtures.product()))
        assertEquals(listOf("Monthly", "Annual"), answer.map { it.name })
    }

    @Test
    fun theShownPriceIsTheRecurringOneNotTheTrial() {
        val trial = offer("annual", "t", null, phase("£0.00", "P1W", 0, RecurrenceMode.FINITE_RECURRING, 1), phase("£49.99", "P1Y", 49_990_000))
        val answer = PlayMapping.products(listOf(BasePlan.ANNUAL), listOf(Fixtures.product(listOf(trial))))
        assertEquals("£49.99", answer.single().price)
        assertEquals("year", answer.single().period)
    }

    @Test
    fun aPlanWhosePeriodIsNotAMonthOrAYearIsLeftOutAndTheOtherStays() {
        val weekly = offer("annual", "t", null, phase("£49.99", "P6M", 49_990_000))
        val monthly = offer("monthly", MONTHLY_TOKEN, null, phase("£4.99", "P1M", 4_990_000))
        val answer = PlayMapping.products(listOf(BasePlan.ANNUAL, BasePlan.MONTHLY), listOf(Fixtures.product(listOf(weekly, monthly))))
        assertEquals(listOf("Monthly"), answer.map { it.name })
    }

    @Test
    fun noSubscriptionFromPlayMeansNoProducts() {
        assertEquals(emptyList<ProductAnswer>(), PlayMapping.products(listOf(BasePlan.ANNUAL), emptyList()))
        val other = PlayProduct("some.other.product", "Other", Fixtures.standardOffers())
        assertEquals(emptyList<ProductAnswer>(), PlayMapping.products(listOf(BasePlan.ANNUAL), listOf(other)))
    }

    @Test
    fun aBlankPriceIsNeverShown() {
        val blank = offer("annual", "t", null, phase("", "P1Y", 49_990_000))
        assertEquals(emptyList<ProductAnswer>(), PlayMapping.products(listOf(BasePlan.ANNUAL), listOf(Fixtures.product(listOf(blank)))))
    }

    // ---- purchases ----

    @Test
    fun onlyOurPaidPurchasesAreEntitlementsUnacknowledgedOnesToo() {
        val paid = Fixtures.purchase("paid", acknowledged = true)
        val fresh = Fixtures.purchase("fresh", acknowledged = false)
        val pending = Fixtures.purchase("pending", state = PurchaseState.PENDING)
        val unspecified = Fixtures.purchase("unspecified", state = PurchaseState.UNSPECIFIED_STATE)
        val other = Fixtures.purchase("other", products = listOf("some.other.product"))
        assertEquals(listOf(paid, fresh), PlayMapping.paid(listOf(paid, fresh, pending, unspecified, other)))
        assertEquals(listOf(pending), PlayMapping.pending(listOf(paid, fresh, pending, unspecified, other)))
    }

    @Test
    fun theSameTokenIsNeverListedTwice() {
        val a = Fixtures.purchase("same")
        assertEquals(1, PlayMapping.paid(listOf(a, a.copy(acknowledged = true))).size)
    }

    @Test
    fun playsUpdateCodesBecomeOurOutcomes() {
        val paid = Fixtures.purchase("paid")
        val pending = Fixtures.purchase("pending", state = PurchaseState.PENDING)
        assertEquals(PurchaseUpdate.Purchased(listOf(paid)), PlayMapping.classifyUpdate(BillingResponseCode.OK, listOf(paid, pending)))
        assertEquals(PurchaseUpdate.Pending, PlayMapping.classifyUpdate(BillingResponseCode.OK, listOf(pending)))
        assertEquals(PurchaseUpdate.Failed, PlayMapping.classifyUpdate(BillingResponseCode.OK, emptyList()))
        assertEquals(PurchaseUpdate.Failed, PlayMapping.classifyUpdate(BillingResponseCode.OK, listOf(Fixtures.purchase("x", products = listOf("other")))))
        assertEquals(PurchaseUpdate.Cancelled, PlayMapping.classifyUpdate(BillingResponseCode.USER_CANCELED, emptyList()))
        assertEquals(PurchaseUpdate.AlreadyOwned, PlayMapping.classifyUpdate(BillingResponseCode.ITEM_ALREADY_OWNED, emptyList()))
        listOf(
            NO_ANSWER_IN_TIME, BillingResponseCode.FEATURE_NOT_SUPPORTED, BillingResponseCode.SERVICE_DISCONNECTED,
            BillingResponseCode.SERVICE_UNAVAILABLE, BillingResponseCode.BILLING_UNAVAILABLE, BillingResponseCode.ITEM_UNAVAILABLE,
            BillingResponseCode.DEVELOPER_ERROR, BillingResponseCode.ERROR, BillingResponseCode.ITEM_NOT_OWNED, BillingResponseCode.NETWORK_ERROR,
        ).forEach { assertEquals("code $it", PurchaseUpdate.Failed, PlayMapping.classifyUpdate(it, listOf(paid))) }
    }

    @Test
    fun aTokenIsPlausibleWhenItUsesOnlyTheCharactersPlayUses() {
        assertTrue(PlayMapping.isPlausibleToken("abc.DEF-123_xyz"))
        assertTrue(PlayMapping.isPlausibleToken("a".repeat(4000)))
        assertFalse(PlayMapping.isPlausibleToken(""))
        assertFalse(PlayMapping.isPlausibleToken("a".repeat(4001)))
        assertFalse(PlayMapping.isPlausibleToken("has space"))
        assertFalse(PlayMapping.isPlausibleToken("quote\""))
        assertFalse(PlayMapping.isPlausibleToken("é"))
    }

    // ---- the page's JSON (needs a real org.json on the test classpath, see docs/ANDROID_BILLING.md) ----

    private fun keysOf(o: JSONObject): Set<String> = o.keys().asSequence().toSet()

    @Test
    fun answersHaveTheShapesInTheBridgeContract() {
        assumeTrue("org.json isn't on the unit-test classpath", Fixtures.orgJsonWorks())

        val products = Answer.Products(listOf(ProductAnswer("id", "Annual", "£49.99", "year"))).toJson()
        assertEquals(setOf("products"), keysOf(products))
        val product = products.getJSONArray("products").getJSONObject(0)
        assertEquals(setOf("id", "name", "price", "period"), keysOf(product))
        assertEquals(listOf("id", "Annual", "£49.99", "year"), listOf("id", "name", "price", "period").map { product.getString(it) })

        val purchases = Answer.Purchases(listOf(Fixtures.purchase("tok-1"), Fixtures.purchase("tok-2"))).toJson()
        assertEquals(setOf("purchases"), keysOf(purchases))
        val list = purchases.getJSONArray("purchases")
        assertEquals(2, list.length())
        assertEquals(setOf("productId", "token"), keysOf(list.getJSONObject(0)))
        assertEquals("com.amanmarwaha.numbite.premium", list.getJSONObject(0).getString("productId"))
        assertEquals(listOf("tok-1", "tok-2"), listOf(0, 1).map { list.getJSONObject(it).getString("token") })
        assertEquals(0, Answer.Purchases(emptyList()).toJson().getJSONArray("purchases").length())

        assertEquals(setOf("pending"), keysOf(Answer.Pending.toJson()))
        assertTrue(Answer.Pending.toJson().getBoolean("pending"))
        assertEquals("cancelled", Answer.Cancelled.toJson().getString("error"))
        assertEquals("unavailable", Answer.Unavailable.toJson().getString("error"))
        assertEquals(setOf("done"), keysOf(Answer.Done.toJson()))
        assertTrue(Answer.Done.toJson().getBoolean("done"))
    }
}
