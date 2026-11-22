package com.amanmarwaha.numbite.billing

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/** The debug-only fake (src/debug). Its answers are JSON, so these need a real org.json on the unit-test classpath and are skipped without one. */
class FakePurchaseServiceTest {
    @Before
    fun needsOrgJson() = assumeTrue("org.json isn't on the unit-test classpath", Fixtures.orgJsonWorks())

    private fun tokens(o: JSONObject): List<String> = o.getJSONArray("purchases").let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("token") } }

    @Test
    fun productsAreTheTwoPlansInPounds() = runBlocking {
        val answer = FakePurchaseService(purchaseDelayMs = 0).products(listOf(BasePlan.ANNUAL.planId, BasePlan.MONTHLY.planId, "com.amanmarwaha.numbite.pro.annual"))
        val list = answer.getJSONArray("products")
        assertEquals(2, list.length())
        assertEquals(listOf("£49.99", "year", "Annual"), listOf("price", "period", "name").map { list.getJSONObject(0).getString(it) })
        assertEquals(listOf("£4.99", "month", "Monthly"), listOf("price", "period", "name").map { list.getJSONObject(1).getString(it) })
        assertEquals(BasePlan.ANNUAL.planId, list.getJSONObject(0).getString("id"))
    }

    @Test
    fun aPurchaseGivesAMadeUpTokenThatPassesThePagesTokenShapeAndIsKept() = runBlocking {
        val fake = FakePurchaseService(purchaseDelayMs = 0)
        val bought = fake.purchase(BasePlan.MONTHLY.planId)
        val token = tokens(bought).single()
        assertTrue(PlayMapping.isPlausibleToken(token))
        assertEquals("com.amanmarwaha.numbite.premium", bought.getJSONArray("purchases").getJSONObject(0).getString("productId"))
        assertEquals(listOf(token), tokens(fake.entitlements()))
        assertEquals(listOf(token), tokens(fake.restore()))
    }

    @Test
    fun aSecondPurchaseReplacesTheFirstLikeAPlanChange() = runBlocking {
        val fake = FakePurchaseService(purchaseDelayMs = 0)
        val first = tokens(fake.purchase(BasePlan.MONTHLY.planId)).single()
        val second = tokens(fake.purchase(BasePlan.ANNUAL.planId)).single()
        assertTrue(first != second)
        assertEquals(listOf(second), tokens(fake.entitlements()))
    }

    @Test
    fun acknowledgeIsRecordedAndAnUnknownTokenIsStillDone() = runBlocking {
        val fake = FakePurchaseService(purchaseDelayMs = 0)
        val token = tokens(fake.purchase(BasePlan.ANNUAL.planId)).single()
        assertTrue(fake.acknowledge(token).getBoolean("done"))
        assertEquals(listOf(token), fake.acknowledgedTokens)
        assertTrue(fake.acknowledge("not-held").getBoolean("done"))
        assertEquals("unavailable", fake.acknowledge("bad token").getString("error"))
    }

    @Test
    fun theOutcomeCanBePendingCancelledOrUnavailable() = runBlocking {
        var outcome = FakePurchaseService.Outcome.PENDING
        val fake = FakePurchaseService(purchaseDelayMs = 0, outcome = { outcome })
        assertTrue(fake.purchase(BasePlan.ANNUAL.planId).getBoolean("pending"))
        outcome = FakePurchaseService.Outcome.CANCELLED
        assertEquals("cancelled", fake.purchase(BasePlan.ANNUAL.planId).getString("error"))
        outcome = FakePurchaseService.Outcome.UNAVAILABLE
        assertEquals("unavailable", fake.purchase(BasePlan.ANNUAL.planId).getString("error"))
        assertEquals(0, fake.entitlements().getJSONArray("purchases").length())
        assertEquals("unavailable", FakePurchaseService(purchaseDelayMs = 0).purchase("nope").getString("error"))
    }

    @Test
    fun manageIsDoneAndOutcomeParsingFallsBackToPurchased() = runBlocking {
        assertTrue(FakePurchaseService(purchaseDelayMs = 0).manage().getBoolean("done"))
        assertEquals(FakePurchaseService.Outcome.PENDING, FakePurchaseService.Outcome.parse("pending"))
        assertEquals(FakePurchaseService.Outcome.PURCHASED, FakePurchaseService.Outcome.parse(null))
        assertEquals(FakePurchaseService.Outcome.PURCHASED, FakePurchaseService.Outcome.parse("whatever"))
    }
}
