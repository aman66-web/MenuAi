package com.amanmarwaha.numbite.bridge

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Steps for the page's Steps card and week (founder 2026-11-26: "the app should also track peoples steps too"; web/lib/mm/steps.ts, StepCounter.swift on the iPhone).
 * The counts are handed to the page and kept nowhere by the app: not stored, not sent, not synced. Pure Kotlin here (the day ranges and the reply), unit-tested
 * without a phone; the phone's own counter is behind [StepCounting].
 */

/** One day's steps: the phone's own calendar day ("YYYY-MM-DD", local time). `partial`: counting began part-way through that day. */
data class DaySteps(val date: String, val steps: Int, val partial: Boolean = false)

sealed interface StepsOutcome {
    /** Oldest first. */
    data class Days(val days: List<DaySteps>) : StepsOutcome
    data object NotDetermined : StepsOutcome
    data object Denied : StepsOutcome
    data object Unavailable : StepsOutcome
}

interface StepCounting {
    /** "granted", "denied", "notDetermined" (never asked) or "unavailable" (this phone can't count steps for the app). Never asks. */
    suspend fun access(): String
    /** The last `days` days (1 to 7), oldest first. `ask`: the person just tapped "Turn on step counting", so Android's own question may be shown. */
    suspend fun steps(days: Int, ask: Boolean): StepsOutcome
    /** Step counting turned off in the app: stop recording steps for it. */
    suspend fun stop()
    /** The app's page in Android's Settings (Permissions › Physical activity). */
    fun openSettings()
}

/** A phone that can't count steps for the app (and the tests' default): every answer is "unavailable", so the page shows nothing. */
class NoStepCounter : StepCounting {
    override suspend fun access() = "unavailable"
    override suspend fun steps(days: Int, ask: Boolean): StepsOutcome = StepsOutcome.Unavailable
    override suspend fun stop() = Unit
    override fun openSettings() = Unit
}

object StepDays {
    /** The page asks for a week at most (Google Play services keeps ten days; the iPhone seven). */
    const val MAX_DAYS = 7

    fun clamp(days: Int): Int = days.coerceIn(1, MAX_DAYS)

    data class Range(val key: String, val start: Instant, val end: Instant)

    /** The last `days` calendar days ending today, oldest first: each from its local midnight to the next (today's up to `now`). */
    fun ranges(days: Int, now: ZonedDateTime): List<Range> {
        val today = now.toLocalDate()
        return (clamp(days) - 1 downTo 0).map { back ->
            val day: LocalDate = today.minusDays(back.toLong())
            val start = day.atStartOfDay(now.zone).toInstant()
            val next = day.plusDays(1).atStartOfDay(now.zone).toInstant()
            Range(day.toString(), start, if (next.isAfter(now.toInstant())) now.toInstant() else next)
        }
    }

    fun ranges(days: Int, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): List<Range> = ranges(days, now.atZone(zone))

    /** The answer for "steps.get", as the page reads it (cleanNativeResult in web/lib/mm/native.ts). */
    fun reply(outcome: StepsOutcome): JSONObject = when (outcome) {
        is StepsOutcome.Days -> JSONObject().put(
            "steps",
            JSONArray().also { list ->
                outcome.days.forEach { day ->
                    list.put(JSONObject().put("date", day.date).put("steps", day.steps.coerceAtLeast(0)).also { if (day.partial) it.put("partial", true) })
                }
            },
        )
        StepsOutcome.NotDetermined -> BridgeReply.permission("notDetermined")
        StepsOutcome.Denied -> BridgeReply.failure("denied")
        StepsOutcome.Unavailable -> BridgeReply.failure("unavailable")
    }
}
