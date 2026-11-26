package com.amanmarwaha.numbite.bridge

import com.amanmarwaha.numbite.auth.WebSigningIn
import com.amanmarwaha.numbite.billing.PurchaseService
import com.amanmarwaha.numbite.reminders.ReminderPlanItem
import com.amanmarwaha.numbite.session.InMemorySessionStore
import com.amanmarwaha.numbite.web.WebSignInOutcome
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime

/** Steps through the bridge (StepCounter.kt; web/lib/mm/native.ts "steps.*", web/lib/mm/steps.ts; StepsBridgeTests.swift on the iPhone). */
class StepsBridgeTest {
    /** A pretend phone: `access` is what Android says; asking turns "notDetermined" into `answer`. */
    private class FakeSteps(var access: String = "granted", val answer: String = "granted", val days: List<DaySteps> = emptyList()) : StepCounting {
        val reads = mutableListOf<Pair<Int, Boolean>>()
        var stopped = 0
        var settingsOpened = 0
        override suspend fun access() = access
        override suspend fun steps(days: Int, ask: Boolean): StepsOutcome {
            reads += days to ask
            if (access == "notDetermined" && ask) access = answer
            return when (access) {
                "granted" -> StepsOutcome.Days(this.days.takeLast(days))
                "denied" -> StepsOutcome.Denied
                "notDetermined" -> StepsOutcome.NotDetermined
                else -> StepsOutcome.Unavailable
            }
        }
        override suspend fun stop() { stopped++ }
        override fun openSettings() { settingsOpened++ }
    }

    private object NoPurchases : PurchaseService {
        override suspend fun products(ids: List<String>) = BridgeReply.failure("unavailable")
        override suspend fun purchase(productId: String) = BridgeReply.failure("unavailable")
        override suspend fun entitlements() = BridgeReply.failure("unavailable")
        override suspend fun restore() = BridgeReply.failure("unavailable")
        override suspend fun manage() = BridgeReply.failure("unavailable")
        override suspend fun acknowledge(token: String) = BridgeReply.failure("unavailable")
    }

    private fun bridge(steps: StepCounting? = null): NativeBridge {
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val scanner = object : BarcodeScanning { override suspend fun scan() = ScanOutcome.Unavailable }
        val location = object : LocationProviding { override suspend fun currentLocation(onlyIfAllowed: Boolean) = LocationOutcome.Unavailable }
        val sharer = object : Sharing { override suspend fun share(content: ShareContent) = false }
        val webSignIn = object : WebSigningIn { override suspend fun signIn(provider: String) = WebSignInOutcome.Unavailable }
        val notifications = object : NotificationScheduling {
            override suspend fun status() = "denied"
            override suspend fun requestPermission() = "denied"
            override suspend fun replaceReminders(plan: ReminderPlanItem.Parsed) = Unit
            override fun openSettings() = Unit
        }
        val reviews = object : ReviewRequesting { override suspend fun requestReview() = false }
        val device = object : DeviceIdentifying { override fun deviceHash(): String? = null }
        return if (steps == null) {
            // the older set-up, with no step counter
            NativeBridge(scope, scanner, location, sharer, webSignIn, notifications, NoPurchases, reviews, InMemorySessionStore(), device, hideKeyboard = {}, runInPage = {})
        } else {
            NativeBridge(scope, scanner, location, sharer, webSignIn, notifications, NoPurchases, reviews, InMemorySessionStore(), device, steps, hideKeyboard = {}, runInPage = {})
        }
    }

    private fun parse(json: String) = (BridgeRequest.parse(json) as? BridgeRequest.Parsed.Ok)?.request

    @Test fun theRequestsThePageSends() {
        assertEquals(BridgeRequest.StepsStatus("s-1"), parse("""{"id":"s-1","action":"steps.status","payload":{}}"""))
        assertEquals(BridgeRequest.Steps("s-2", 7, true), parse("""{"id":"s-2","action":"steps.get","payload":{"days":7,"ask":true}}"""))
        assertEquals(BridgeRequest.Steps("s-3", 3, false), parse("""{"id":"s-3","action":"steps.get","payload":{"days":3}}"""))
        assertEquals(BridgeRequest.OpenStepSettings("s-4"), parse("""{"id":"s-4","action":"steps.openSettings"}"""))
        assertEquals(BridgeRequest.StopSteps("s-5"), parse("""{"id":"s-5","action":"steps.stop"}"""))
    }

    @Test fun daysAreKeptToOneToSevenAndTheQuestionNeedsExactlyTrue() {
        assertEquals(BridgeRequest.Steps("a", 7, false), parse("""{"id":"a","action":"steps.get","payload":{"days":400}}"""))
        assertEquals(BridgeRequest.Steps("a", 1, false), parse("""{"id":"a","action":"steps.get","payload":{"days":-2}}"""))
        assertEquals(BridgeRequest.Steps("a", 7, false), parse("""{"id":"a","action":"steps.get","payload":{"days":"7","ask":"yes"}}"""))
        assertEquals(BridgeRequest.Steps("a", 7, false), parse("""{"id":"a","action":"steps.get"}"""))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse("""{"id":"a","action":"steps.delete"}"""))
    }

    @Test fun turningOnAsksAndroidOnceThenTheDaysGoBackOldestFirst() = runBlocking {
        val week = listOf(DaySteps("2026-11-24", 2500, partial = true), DaySteps("2026-11-25", 9034), DaySteps("2026-11-26", 4210))
        val steps = FakeSteps(access = "notDetermined", answer = "granted", days = week)
        val bridge = bridge(steps)
        assertEquals("""{"permission":"notDetermined"}""", bridge.handle(BridgeRequest.StepsStatus("a")).toString())
        assertEquals("""{"permission":"notDetermined"}""", bridge.handle(BridgeRequest.Steps("b", 7, false)).toString())
        val reply = bridge.handle(BridgeRequest.Steps("c", 7, true))
        assertEquals(
            """{"steps":[{"date":"2026-11-24","steps":2500,"partial":true},{"date":"2026-11-25","steps":9034},{"date":"2026-11-26","steps":4210}]}""",
            reply.toString(),
        )
        assertEquals("""{"permission":"granted"}""", bridge.handle(BridgeRequest.StepsStatus("d")).toString())
        assertEquals(listOf(7 to false, 7 to true), steps.reads)
    }

    @Test fun saidNoOrNoStepCounter() = runBlocking {
        val refused = bridge(FakeSteps(access = "notDetermined", answer = "denied"))
        assertEquals("""{"error":"denied"}""", refused.handle(BridgeRequest.Steps("a", 7, true)).toString())
        assertEquals("""{"permission":"denied"}""", refused.handle(BridgeRequest.StepsStatus("b")).toString())
        val none = bridge(FakeSteps(access = "unavailable"))
        assertEquals("""{"error":"unavailable"}""", none.handle(BridgeRequest.StepsStatus("c")).toString())
        assertEquals("""{"error":"unavailable"}""", none.handle(BridgeRequest.Steps("d", 7, true)).toString())
        // a bridge made without a step counter answers the same, so the page shows nothing
        val plain = bridge(null)
        assertEquals("""{"error":"unavailable"}""", plain.handle(BridgeRequest.StepsStatus("e")).toString())
        assertEquals("""{"error":"unavailable"}""", plain.handle(BridgeRequest.Steps("f", 7, false)).toString())
    }

    @Test fun openSettingsAndStop() = runBlocking {
        val steps = FakeSteps()
        val bridge = bridge(steps)
        assertEquals("""{"done":true}""", bridge.handle(BridgeRequest.OpenStepSettings("a")).toString())
        assertEquals("""{"done":true}""", bridge.handle(BridgeRequest.StopSteps("b")).toString())
        assertEquals(1, steps.settingsOpened)
        assertEquals(1, steps.stopped)
    }

    @Test fun aNegativeCountIsNeverSent() {
        val reply = StepDays.reply(StepsOutcome.Days(listOf(DaySteps("2026-11-26", -3))))
        assertEquals(0, reply.getJSONArray("steps").getJSONObject(0).getInt("steps"))
        assertFalse(reply.getJSONArray("steps").getJSONObject(0).has("partial"))
        assertNull(JSONObject(reply.toString()).optJSONObject("error"))
    }

    @Test fun theDaysAreTheLastSevenCalendarDaysEndingNow() {
        val now = ZonedDateTime.of(2026, 11, 26, 15, 30, 0, 0, ZoneId.of("Europe/London"))
        val ranges = StepDays.ranges(7, now)
        assertEquals(listOf("2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"), ranges.map { it.key })
        assertEquals(now.toInstant(), ranges.last().end)
        assertEquals(Duration.ofHours(24), Duration.between(ranges.first().start, ranges.first().end))
        assertEquals(7, StepDays.ranges(30, now).size)
        assertEquals(listOf("2026-11-26"), StepDays.ranges(0, now).map { it.key })
    }

    @Test fun aDayWhenTheClocksGoBackIsTwentyFiveHours() {
        val now = ZonedDateTime.of(2026, 10, 26, 12, 0, 0, 0, ZoneId.of("Europe/London"))
        val sunday = StepDays.ranges(2, now).first()
        assertEquals("2026-10-25", sunday.key)
        assertEquals(Duration.ofHours(25), Duration.between(sunday.start, sunday.end))
    }
}
