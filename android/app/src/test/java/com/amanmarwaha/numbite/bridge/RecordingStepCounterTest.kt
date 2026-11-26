package com.amanmarwaha.numbite.bridge

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Steps on Android through Google Play services' Recording API (RecordingStepCounter.kt), with a pretend recorder: it keeps only the steps taken while it is
 * recording for the app, as the real one does, and forgets them all when the app stops it. StepsBridgeTest covers the bridge's replies.
 */
class RecordingStepCounterTest {
    private val london = ZoneId.of("Europe/London")
    private fun at(day: Int, hour: Int, minute: Int = 0, month: Int = 11): ZonedDateTime = ZonedDateTime.of(2026, month, day, hour, minute, 0, 0, london)

    /** Google Play services, pretend: `walk` adds steps at a moment; only those taken while recording count. */
    private class FakeRecorder(var available: Boolean = true, private val clock: () -> Instant) : StepRecorder {
        var recordingSince: Instant? = null
        var subscribes = 0
        var unsubscribes = 0
        var reads = 0
        /** Throws this from every read (a missing permission, a broken service). */
        var failReads: Exception? = null
        /** Fails only the read of the day starting at this moment. */
        var failDayStarting: Instant? = null
        private val steps = mutableListOf<Pair<Instant, Int>>()

        fun walk(at: ZonedDateTime, count: Int) {
            if (recordingSince?.let { !at.toInstant().isBefore(it) } == true) steps += at.toInstant() to count
        }

        /** Google Play services lost the recording (its data cleared): nothing kept, nothing recording. */
        fun drop() {
            recordingSince = null
            steps.clear()
        }

        override fun isAvailable() = available
        override suspend fun subscribe() {
            subscribes++
            failReads?.let { if (it is SecurityException) throw it }
            if (recordingSince == null) recordingSince = clock()
        }
        override suspend fun unsubscribe() {
            unsubscribes++
            drop()
        }
        override suspend fun steps(start: Instant, end: Instant): Int {
            reads++
            failReads?.let { throw it }
            if (start == failDayStarting) throw IllegalStateException("Google Play services had a hiccup")
            if (recordingSince == null) throw StepsNotRecording()
            return steps.filter { (moment, _) -> !moment.isBefore(start) && moment.isBefore(end) }.sumOf { it.second }
        }
    }

    private class FakePermission(var state: String = "notDetermined", val answer: Boolean = true, override val canAsk: Boolean = true) : ActivityPermission {
        var questions = 0
        override fun state() = state
        override suspend fun request(): Boolean {
            questions++
            if (state != "denied") state = if (answer) "granted" else "denied"
            return state == "granted"
        }
    }

    private class Memory : StepMemory {
        override var since: Instant? = null
    }

    /** The phone: the counter under test with its pretend parts and a clock the test moves. */
    private inner class Phone(available: Boolean = true, permission: String = "notDetermined", answer: Boolean = true, canAsk: Boolean = true) {
        var now: ZonedDateTime = at(26, 9)
        val recorder = FakeRecorder(available) { now.toInstant() }
        val permission = FakePermission(permission, answer, canAsk)
        val memory = Memory()
        var settingsOpened = 0
        val counter = RecordingStepCounter(recorder, this.permission, memory, { settingsOpened++ }, clock = { now })

        suspend fun steps(days: Int = 7, ask: Boolean = false): StepsOutcome = counter.steps(days, ask)

        fun days(outcome: StepsOutcome) = (outcome as StepsOutcome.Days).days
    }

    @Test fun noGooglePlayServicesMeansNothingIsShownOrAsked() = runBlocking {
        val phone = Phone(available = false)
        assertEquals("unavailable", phone.counter.access())
        assertEquals(StepsOutcome.Unavailable, phone.steps(ask = true))
        phone.counter.stop()
        assertEquals(0, phone.permission.questions)
        assertEquals(0, phone.recorder.subscribes)
        assertEquals(0, phone.recorder.unsubscribes)
    }

    @Test fun nobodyIsAskedUntilTheyTapTurnOn() = runBlocking {
        val phone = Phone()
        assertEquals("notDetermined", phone.counter.access())
        assertEquals(StepsOutcome.NotDetermined, phone.steps(ask = false))
        assertEquals(0, phone.permission.questions)
        assertEquals(0, phone.recorder.subscribes)
        assertNull(phone.memory.since)
    }

    @Test fun turningOnAsksOnceStartsRecordingAndTodayIsAPartialDay() = runBlocking {
        val phone = Phone()
        phone.now = at(26, 9, 30)
        val first = phone.days(phone.steps(ask = true))
        assertEquals(1, phone.permission.questions)
        assertEquals(1, phone.recorder.subscribes)
        assertEquals(listOf(DaySteps("2026-11-26", 0, partial = true)), first)
        assertEquals(phone.now.toInstant(), phone.memory.since)
        assertEquals("granted", phone.counter.access())

        phone.recorder.walk(at(26, 8), 900) // before it was on: never counted
        phone.recorder.walk(at(26, 11), 2300)
        phone.recorder.walk(at(26, 14, 15), 1910)
        phone.now = at(26, 15)
        assertEquals(listOf(DaySteps("2026-11-26", 4210, partial = true)), phone.days(phone.steps()))
        assertEquals(1, phone.permission.questions)
    }

    @Test fun theWeekFillsInDayByDayOldestFirstFromTheFirstDay() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(24, 18)
        phone.steps(ask = true)
        phone.recorder.walk(at(24, 19), 2500)
        phone.recorder.walk(at(25, 7), 4000)
        phone.recorder.walk(at(25, 23, 59), 5034)
        phone.recorder.walk(at(26, 0, 1), 10)
        phone.recorder.walk(at(26, 12), 4200)
        phone.now = at(26, 15)
        assertEquals(
            listOf(DaySteps("2026-11-24", 2500, partial = true), DaySteps("2026-11-25", 9034), DaySteps("2026-11-26", 4210)),
            phone.days(phone.steps()),
        )
        // a week later every day is whole
        phone.now = at(3, 12, month = 12)
        val week = phone.days(phone.steps())
        assertEquals(listOf("2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"), week.map { it.date })
        assertTrue(week.none { it.partial })
    }

    @Test fun aDayWhenTheClocksGoBackCountsAllTwentyFiveHours() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(24, 12, month = 10)
        phone.steps(ask = true)
        phone.recorder.walk(at(25, 0, 30, month = 10), 100)
        phone.recorder.walk(ZonedDateTime.of(2026, 10, 25, 1, 30, 0, 0, london).withLaterOffsetAtOverlap(), 50) // the second 1:30
        phone.recorder.walk(at(25, 23, 30, month = 10), 20)
        phone.now = at(26, 12, month = 10)
        assertEquals(DaySteps("2026-10-25", 170), phone.days(phone.steps()).single { it.date == "2026-10-25" })
    }

    @Test fun saidNo() = runBlocking {
        val phone = Phone(answer = false)
        assertEquals(StepsOutcome.Denied, phone.steps(ask = true))
        assertEquals(0, phone.recorder.subscribes)
        assertEquals("denied", phone.counter.access())
        assertEquals(StepsOutcome.Denied, phone.steps(ask = false))
        // tapping again: Android answers no at once (no second question here), still denied
        assertEquals(StepsOutcome.Denied, phone.steps(ask = true))
        phone.counter.openSettings()
        assertEquals(1, phone.settingsOpened)
    }

    @Test fun thePermissionTurnedOffAndBackOnInSettingsStartsANewFirstDay() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(20, 10)
        phone.steps(ask = true)
        // Physical activity switched off in Settings: Android ends the recording and forgets it
        phone.permission.state = "denied"
        phone.recorder.drop()
        phone.now = at(25, 10)
        assertEquals(StepsOutcome.Denied, phone.steps())
        assertNull(phone.memory.since)
        // and on again
        phone.permission.state = "granted"
        phone.now = at(26, 9)
        assertEquals(listOf(DaySteps("2026-11-26", 0, partial = true)), phone.days(phone.steps()))
        assertEquals(phone.now.toInstant(), phone.memory.since)
    }

    @Test fun aRecordingGooglePlayServicesDroppedStartsAgain() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(20, 10)
        phone.steps(ask = true)
        phone.recorder.drop() // e.g. Google Play services' storage cleared while the app was closed
        phone.now = at(26, 9)
        val days = phone.days(phone.steps())
        assertEquals(listOf(DaySteps("2026-11-26", 0, partial = true)), days)
        assertEquals(phone.now.toInstant(), phone.memory.since)
        assertTrue(phone.recorder.recordingSince != null)
    }

    @Test fun everyReadKeepsTheRecordingGoing() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.steps(ask = true)
        phone.now = phone.now.plusMinutes(2)
        phone.steps()
        phone.now = phone.now.plusMinutes(2)
        phone.steps()
        assertEquals(3, phone.recorder.subscribes)
    }

    @Test fun aMissingPermissionReportedByGooglePlayServicesIsDenied() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.steps(ask = true)
        phone.recorder.failReads = SecurityException("ACTIVITY_RECOGNITION")
        phone.now = phone.now.plusHours(1)
        assertEquals(StepsOutcome.Denied, phone.steps())
        assertNull(phone.memory.since)
        // Android 9 and older: nothing to switch on in Settings, so the page shows nothing
        val old = Phone(permission = "granted", canAsk = false)
        old.recorder.failReads = SecurityException("no permission")
        assertEquals(StepsOutcome.Unavailable, old.steps(ask = true))
    }

    @Test fun anyOtherFailureIsUnavailableAndADayThatFailsIsLeftOut() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(24, 10)
        phone.steps(ask = true)
        phone.recorder.walk(at(24, 11), 100)
        phone.recorder.walk(at(26, 11), 300)
        phone.recorder.failDayStarting = at(25, 0).toInstant()
        phone.now = at(26, 12)
        assertEquals(listOf(DaySteps("2026-11-24", 100, partial = true), DaySteps("2026-11-26", 300)), phone.days(phone.steps()))
        phone.recorder.failReads = IllegalStateException("Google Play services is updating")
        assertEquals(StepsOutcome.Days(emptyList()), phone.steps())
    }

    @Test fun stopEndsTheRecordingAndTurningOnAgainStartsAFreshFirstDay() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(22, 10)
        phone.steps(ask = true)
        phone.recorder.walk(at(23, 10), 5000)
        phone.now = at(24, 10)
        phone.counter.stop()
        assertEquals(1, phone.recorder.unsubscribes)
        assertNull(phone.memory.since)
        phone.now = at(26, 9)
        val again = phone.days(phone.steps(ask = true))
        assertEquals(listOf(DaySteps("2026-11-26", 0, partial = true)), again) // the 23rd is not shown again
        assertEquals(0, phone.permission.questions) // already allowed: no question
    }

    @Test fun androidNineHasNoQuestion() = runBlocking {
        val phone = Phone(permission = "granted", canAsk = false)
        assertEquals("granted", phone.counter.access())
        assertEquals(listOf(DaySteps("2026-11-26", 0, partial = true)), phone.days(phone.steps(ask = true)))
        assertEquals(0, phone.permission.questions)
    }

    @Test fun aClockSetBackBeforeTheFirstDayStartsAgainFromNow() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(26, 9)
        phone.steps(ask = true)
        phone.now = at(25, 9) // the phone's clock was put back a day
        assertEquals(listOf(DaySteps("2026-11-25", 0, partial = true)), phone.days(phone.steps()))
        assertEquals(phone.now.toInstant(), phone.memory.since)
    }

    @Test fun midnightExactlyIsAWholeEmptyDayNotAnError() = runBlocking {
        val phone = Phone(permission = "granted")
        phone.now = at(25, 9)
        phone.steps(ask = true)
        phone.now = at(26, 0)
        val days = phone.days(phone.steps())
        assertEquals(DaySteps("2026-11-26", 0), days.last())
    }

    @Test fun stepValuesAreAddedSafely() {
        assertEquals(0, sumSteps(emptyList()))
        assertEquals(4210, sumSteps(listOf(4000, 210, -5)))
        assertEquals(Int.MAX_VALUE, sumSteps(listOf(Int.MAX_VALUE, 1)))
    }

    @Test fun theBridgeAnswersWithTheRecordingCounter() = runBlocking {
        val phone = Phone()
        phone.now = at(26, 9, 30)
        val reply = StepDays.reply(phone.steps(ask = true))
        assertEquals("""{"steps":[{"date":"2026-11-26","steps":0,"partial":true}]}""", reply.toString())
        assertEquals("""{"permission":"notDetermined"}""", StepDays.reply(Phone().steps(ask = false)).toString())
        assertEquals("""{"error":"denied"}""", StepDays.reply(Phone(answer = false).steps(ask = true)).toString())
        assertEquals("""{"error":"unavailable"}""", StepDays.reply(Phone(available = false).steps(ask = true)).toString())
    }
}
