package com.amanmarwaha.numbite.bridge

import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.time.ZonedDateTime
import kotlin.coroutines.cancellation.CancellationException

/**
 * Steps on Android (founder 2026-11-26: "the app should also track peoples steps too"; "Yes, add it" to Google's Recording API). Since Android 9 an app that is
 * not on screen can't read the step sensor, so the app asks Google Play services to record steps for it (the Recording API on mobile: no Google account, kept
 * on the phone for ten days, never sent anywhere) and reads the days back when the page asks. The rules live here, tested with a pretend recorder
 * (RecordingStepCounterTest); Google's own calls are in PlayStepRecorder.kt.
 *
 * - Android's "Physical activity" question is shown only when the person taps "Turn on step counting" (`ask`), never at launch.
 * - Recording starts then, so the first day is counted from that moment ("partial") and the days before it are not sent at all (the page says "Not counted").
 * - "Stop counting steps" (and Clear data) stops recording; Google Play services then forgets what it recorded for the app.
 * - The app remembers only when recording began ([StepMemory.since]), never a count: the counts are handed to the page and kept nowhere.
 */
class RecordingStepCounter(
    private val recorder: StepRecorder,
    private val permission: ActivityPermission,
    private val memory: StepMemory,
    private val openAppSettings: () -> Unit,
    private val clock: () -> ZonedDateTime = { ZonedDateTime.now() },
) : StepCounting {
    /** One read, turn-on or stop at a time: `since` and the recording change together. */
    private val lock = Mutex()

    override suspend fun access(): String {
        if (!recorder.isAvailable()) return "unavailable"
        val state = permission.state()
        // Android ends the recording when the permission goes, so the next turn-on starts a new first day
        if (state != "granted") memory.since = null
        return state
    }

    override suspend fun steps(days: Int, ask: Boolean): StepsOutcome = lock.withLock {
        if (!recorder.isAvailable()) return@withLock StepsOutcome.Unavailable
        val state = permission.state()
        if (state != "granted") {
            memory.since = null
            if (!ask) return@withLock if (state == "notDetermined") StepsOutcome.NotDetermined else StepsOutcome.Denied
            if (!permission.request()) return@withLock StepsOutcome.Denied
        }
        try {
            read(StepDays.clamp(days))
        } catch (e: CancellationException) {
            throw e
        } catch (_: SecurityException) {
            // Google Play services says the permission is missing after all. On Android 9 and older there is nothing to turn on in Settings.
            memory.since = null
            if (permission.canAsk) StepsOutcome.Denied else StepsOutcome.Unavailable
        } catch (e: Exception) {
            Log.w(TAG, "Steps could not be read", e)
            StepsOutcome.Unavailable
        }
    }

    override suspend fun stop() = lock.withLock {
        memory.since = null
        if (!recorder.isAvailable()) return@withLock
        try {
            recorder.unsubscribe()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Step recording could not be stopped", e)
        }
    }

    override fun openSettings() = openAppSettings()

    private suspend fun read(days: Int): StepsOutcome {
        val now = clock()
        val at = now.toInstant()
        val since = memory.since
        if (since == null || since.isAfter(at)) return StepsOutcome.Days(startRecording(days, now))
        return try {
            val found = count(days, now, since)
            keepRecording()
            StepsOutcome.Days(found)
        } catch (_: StepsNotRecording) {
            // Google Play services dropped the recording (its data was cleared, or the permission went and came back while the app was closed): start again
            StepsOutcome.Days(startRecording(days, now))
        }
    }

    /** Turning on (or starting again): recording begins now, so today is a first, partial day. */
    private suspend fun startRecording(days: Int, now: ZonedDateTime): List<DaySteps> {
        recorder.subscribe()
        memory.since = now.toInstant()
        return count(days, now, now.toInstant())
    }

    /** Subscribing again is nothing when the recording is there, and brings it back if Google Play services dropped it without saying so. */
    private suspend fun keepRecording() {
        try {
            recorder.subscribe()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Step recording could not be renewed", e)
        }
    }

    /**
     * The days from the one recording began in to today, oldest first. A day Google Play services can't answer for is left out (the page says "Not counted").
     * Today is always there (`since` is never after now): at the moment of turning on, today's range ends exactly when recording begins.
     */
    private suspend fun count(days: Int, now: ZonedDateTime, since: Instant): List<DaySteps> {
        val ranges = StepDays.ranges(days, now)
        return ranges.filterIndexed { index, range -> range.end.isAfter(since) || index == ranges.lastIndex }.mapNotNull { range ->
            val steps = if (range.end.isAfter(range.start)) stepsOrNull(range) else 0
            steps?.let { DaySteps(range.key, it, partial = since.isAfter(range.start)) }
        }
    }

    private suspend fun stepsOrNull(range: StepDays.Range): Int? = try {
        recorder.steps(range.start, range.end).coerceAtLeast(0)
    } catch (e: CancellationException) {
        throw e
    } catch (e: StepsNotRecording) {
        throw e
    } catch (e: SecurityException) {
        throw e
    } catch (e: Exception) {
        Log.w(TAG, "One day's steps could not be read", e)
        null
    }

    private companion object { const val TAG = "NumbiteSteps" }
}

/** Google Play services' step recording for this app (the Recording API on mobile), behind an interface so [RecordingStepCounter] is tested without a phone. */
interface StepRecorder {
    /** Google Play services is on this phone and new enough to record steps. */
    fun isAvailable(): Boolean
    /** Starts recording steps for the app; nothing happens if it already is. Throws SecurityException without the permission. */
    suspend fun subscribe()
    /** Stops recording; Google Play services then forgets what it recorded for the app. */
    suspend fun unsubscribe()
    /** The steps recorded from `start` to `end`. Throws [StepsNotRecording] when nothing is recording for the app, SecurityException without the permission. */
    suspend fun steps(start: Instant, end: Instant): Int
}

/** Google Play services has no recording for the app (it was never started, or it was dropped). */
class StepsNotRecording : Exception("No step recording for the app")

/** Android's "Physical activity" permission (ACTIVITY_RECOGNITION). */
interface ActivityPermission {
    /** False on Android 9 and older, where the permission is given at install and there is no question and no switch in Settings. */
    val canAsk: Boolean
    /** "granted", "denied" or "notDetermined" (never asked). Never asks. */
    fun state(): String
    /** Shows Android's question (Android answers "no" at once if the person said no twice); true when the permission is held afterwards. */
    suspend fun request(): Boolean
}

/** All the app keeps about step counting: when the current recording began. Never a count. */
interface StepMemory {
    var since: Instant?
}

/** The step values of one read, added up: a negative value counts as nothing, and the total never wraps round. */
fun sumSteps(values: Iterable<Int>): Int = values.sumOf { it.coerceAtLeast(0).toLong() }.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
