package com.amanmarwaha.numbite.reminders

import org.json.JSONArray
import org.json.JSONObject
import java.time.DateTimeException
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * The limits and names for reminders: ReminderPlanItem.swift on the iPhone, line for line. Everything the phone is told comes from the web view's JSON
 * (web/lib/mm/native.ts, web/lib/mm/reminders.ts PlanItem) and that is never trusted: every field is checked, a bad item is ignored, and counts and lengths are
 * capped here too, whatever the page already did. Pure Kotlin (java.time), unit-tested without a phone.
 */
object ReminderPlan {
    /** Every notification Numbite schedules has an identifier starting with this: replacing "everything we scheduled" means everything with this prefix. */
    const val IDENTIFIER_PREFIX = "mm.reminder."
    /** The same cap as the iPhone's 64-pending limit, kept so the two apps ring the same set (the web plan stays under 60). */
    const val MAX_NOTIFICATIONS = 60
    /** The web app allows 12 reminders. More items than this are not a plan we made. */
    const val MAX_ITEMS = 50
    /** Lengths of what shows on the lock screen. The web app already keeps the name to 40 and the note to 120 characters. */
    const val MAX_TITLE_LENGTH = 100
    const val MAX_BODY_LENGTH = 200
    /** Dates of an "every few days" reminder (the web app sends up to 20). */
    const val MAX_DATES_PER_ITEM = 20

    fun isOurs(identifier: String): Boolean = identifier.startsWith(IDENTIFIER_PREFIX)

    /** The reminder id inside one of our identifiers ("mm.reminder.<id>.<kind>"); null for anything else. */
    fun ownerOf(identifier: String): String? {
        if (!isOurs(identifier)) return null
        return identifier.removePrefix(IDENTIFIER_PREFIX).takeWhile { it != '.' }.ifEmpty { null }
    }
}

/** A local date and time, "YYYY-MM-DDTHH:MM" (the phone's own clock; web/lib/mm/reminders.ts PlanItem.fireAt). */
data class ReminderMoment(val year: Int, val month: Int, val day: Int, val hour: Int, val minute: Int) {
    /** Back to the text it came from, which also names its notification. */
    val text: String
        get() = "%04d-%02d-%02dT%02d:%02d".format(year, month, day, hour, minute)

    /** The moment on `zone`'s clock as epoch milliseconds, or null when that day doesn't exist (30 February). */
    fun epochMillis(zone: ZoneId): Long? = try {
        ZonedDateTime.of(LocalDateTime.of(year, month, day, hour, minute), zone).toInstant().toEpochMilli()
    } catch (_: DateTimeException) {
        null
    }

    companion object {
        /** Exactly 16 ASCII characters in that shape; anything else is null. (Whether the day exists is checked in [epochMillis].) */
        fun parse(text: String): ReminderMoment? {
            if (text.length != 16 || text[4] != '-' || text[7] != '-' || text[10] != 'T' || text[13] != ':') return null
            fun number(from: Int, to: Int): Int? {
                var value = 0
                for (index in from until to) {
                    val digit = text[index] - '0'
                    if (digit !in 0..9) return null
                    value = value * 10 + digit
                }
                return value
            }
            val year = number(0, 4) ?: return null
            val month = number(5, 7) ?: return null
            val day = number(8, 10) ?: return null
            val hour = number(11, 13) ?: return null
            val minute = number(14, 16) ?: return null
            if (year !in 2000..2200 || month !in 1..12 || day !in 1..31 || hour !in 0..23 || minute !in 0..59) return null
            return ReminderMoment(year, month, day, hour, minute)
        }
    }
}

/** One reminder as the web app's plan describes it, after every field has been checked. */
data class ReminderPlanItem(val id: String, val title: String, val body: String, val hour: Int, val minute: Int, val ring: Ring) {
    /** How it rings. The three are exclusive; a plan item that says two things is refused rather than guessed at. */
    sealed interface Ring {
        /** Every day at hour:minute. */
        data object Daily : Ring
        /** Certain days: weekday numbers 1 = Sunday ... 7 = Saturday (the same as java.util.Calendar), sorted, no repeats. */
        data class Weekdays(val days: List<Int>) : Ring
        /** "Every few days": the dates the web app worked out (one one-off notification per date). Hour and minute are not used for these. */
        data class OneOffs(val moments: List<ReminderMoment>) : Ring
    }

    /** What [parsePlan] made of the page's list. */
    data class Parsed(val items: List<ReminderPlanItem>, val ignored: Int)

    companion object {
        /**
         * The page's `items` array. null when it isn't an array at all (the request is then ignored: it never wipes the reminders on a garbled message).
         * An empty array is a real plan: no reminders.
         */
        fun parsePlan(raw: Any?): Parsed? {
            val list = raw as? JSONArray ?: return null
            val items = mutableListOf<ReminderPlanItem>()
            var ignored = 0
            val seen = HashSet<String>()
            for (index in 0 until list.length()) {
                if (index >= ReminderPlan.MAX_ITEMS) {
                    ignored += list.length() - index
                    break
                }
                val item = (list.opt(index) as? JSONObject)?.let { parseItem(it) }
                if (item == null || !seen.add(item.id)) {
                    ignored++
                    continue
                }
                items += item
            }
            return Parsed(items, ignored)
        }

        /**
         * Null when anything is wrong with the item. A weekday or date that is wrong refuses the whole item (ringing on the wrong day is worse than not ringing,
         * and the page shows its own list either way). Only the text is trimmed: too long a name or note is cut, not refused.
         */
        fun parseItem(payload: JSONObject): ReminderPlanItem? {
            val id = payload.opt("id") as? String ?: return null
            if (!isValidId(id)) return null
            val rawTitle = payload.opt("title") as? String ?: return null
            val hour = wholeNumber(payload.opt("hour"))?.takeIf { it in 0..23 } ?: return null
            val minute = wholeNumber(payload.opt("minute"))?.takeIf { it in 0..59 } ?: return null
            val title = clean(rawTitle, ReminderPlan.MAX_TITLE_LENGTH)
            if (title.isEmpty()) return null
            val body = when (val raw = present(payload.opt("body"))) {
                null -> ""
                is String -> clean(raw, ReminderPlan.MAX_BODY_LENGTH)
                else -> return null
            }
            val weekdays = present(payload.opt("weekdays"))
            val fireAt = present(payload.opt("fireAt"))
            val ring: Ring = when {
                weekdays == null && fireAt == null -> Ring.Daily
                weekdays != null && fireAt == null -> {
                    val list = weekdays as? JSONArray
                    if (list == null || list.length() == 0 || list.length() > 14) return null
                    val numbers = sortedSetOf<Int>()
                    for (index in 0 until list.length()) numbers += wholeNumber(list.opt(index))?.takeIf { it in 1..7 } ?: return null
                    Ring.Weekdays(numbers.toList())
                }
                weekdays == null && fireAt != null -> {
                    val list = fireAt as? JSONArray
                    if (list == null || list.length() == 0) return null
                    val moments = mutableListOf<ReminderMoment>()
                    for (index in 0 until minOf(list.length(), ReminderPlan.MAX_DATES_PER_ITEM * 2)) {
                        val moment = (list.opt(index) as? String)?.let { ReminderMoment.parse(it) } ?: return null
                        if (moment !in moments) moments += moment
                    }
                    Ring.OneOffs(moments.take(ReminderPlan.MAX_DATES_PER_ITEM))
                }
                else -> return null // both weekdays and dates
            }
            return ReminderPlanItem(id, title, body, hour, minute, ring)
        }

        /** The web app's ids: letters, digits, "-" and "_", 1 to 64 long. No ".", so an identifier "mm.reminder.<id>.<kind>" can always be read back. */
        fun isValidId(id: String): Boolean = id.length in 1..64 && id.all { (it in 'A'..'Z') || (it in 'a'..'z') || (it in '0'..'9') || it == '-' || it == '_' }

        /** JSON null counts as "not there". */
        private fun present(value: Any?): Any? = if (value == null || value === JSONObject.NULL) null else value

        /** A whole number sent as a number (a boolean, a string or 8.5 is refused). */
        private fun wholeNumber(value: Any?): Int? {
            if (value !is Number) return null
            val d = value.toDouble()
            if (d != Math.floor(d) || d < Int.MIN_VALUE || d > Int.MAX_VALUE) return null
            return d.toInt()
        }

        /**
         * What goes on a lock screen: real control characters (line breaks, tabs) and the line and paragraph separators become spaces, ends trimmed, then cut
         * to whole characters. The invisible joiners and the left/right marks (Unicode format characters: U+200C, U+200D, U+200E, U+200F, U+061C) are KEPT, as in
         * web/lib/mm/reminders.ts: Persian, Urdu and Indic words and emoji sequences need them, and a name the person typed correctly must reach the lock screen
         * unchanged. The page has already taken out the hidden characters that can change reading order or hide text.
         */
        fun clean(text: String, limit: Int): String {
            val spaced = StringBuilder(text.length)
            var index = 0
            while (index < text.length) {
                val point = text.codePointAt(index)
                val type = Character.getType(point)
                if (type == Character.CONTROL.toInt() || type == Character.LINE_SEPARATOR.toInt() || type == Character.PARAGRAPH_SEPARATOR.toInt()) spaced.append(' ')
                else spaced.appendCodePoint(point)
                index += Character.charCount(point)
            }
            val trimmed = spaced.toString().trim { it.isWhitespace() || it == ' ' }
            // cut to whole characters (never half of a surrogate pair)
            val points = trimmed.codePointCount(0, trimmed.length)
            return if (points <= limit) trimmed else trimmed.substring(0, trimmed.offsetByCodePoints(0, limit))
        }
    }
}

/** One notification to schedule: what it says and when it rings. */
data class ReminderNotification(val identifier: String, val reminderId: String, val title: String, val body: String, val timing: Timing) {
    sealed interface Timing {
        /** Every day at this time on the phone's clock (follows the phone to a new time zone). */
        data class Daily(val hour: Int, val minute: Int) : Timing
        /** Every week on this weekday (1 = Sunday ... 7 = Saturday) at this time. */
        data class Weekly(val weekday: Int, val hour: Int, val minute: Int) : Timing
        /** Once, at this moment (worked out on the phone's clock when the plan was made). */
        data class Once(val epochMillis: Long) : Timing
    }
}

/** The notifications a plan turns into. */
data class ReminderSchedule(val notifications: List<ReminderNotification>, val leftOutForRoom: Int, val unusableDates: Int) {
    companion object {
        /**
         * `zone` is the phone's time zone (dates in a plan are written on its clock). The reminders are taken in order; one that wouldn't fit in the notifications
         * left is left out whole and the next, smaller one is tried (a reminder never rings on only some of its days).
         */
        fun make(items: List<ReminderPlanItem>, nowMillis: Long, zone: ZoneId, limit: Int = ReminderPlan.MAX_NOTIFICATIONS): ReminderSchedule {
            val notifications = mutableListOf<ReminderNotification>()
            var leftOutForRoom = 0
            var unusableDates = 0
            for (item in items) {
                fun notification(kind: String, timing: ReminderNotification.Timing) =
                    ReminderNotification(ReminderPlan.IDENTIFIER_PREFIX + item.id + "." + kind, item.id, item.title, item.body, timing)
                val group = mutableListOf<ReminderNotification>()
                when (val ring = item.ring) {
                    ReminderPlanItem.Ring.Daily -> group += notification("daily", ReminderNotification.Timing.Daily(item.hour, item.minute))
                    is ReminderPlanItem.Ring.Weekdays -> ring.days.forEach { group += notification("wd$it", ReminderNotification.Timing.Weekly(it, item.hour, item.minute)) }
                    is ReminderPlanItem.Ring.OneOffs -> for (moment in ring.moments) {
                        val at = moment.epochMillis(zone)
                        if (at == null || at <= nowMillis) {
                            unusableDates++
                            continue
                        }
                        group += notification("at" + moment.text, ReminderNotification.Timing.Once(at))
                    }
                }
                if (group.isEmpty()) continue
                if (notifications.size + group.size > limit) {
                    leftOutForRoom++
                    continue
                }
                notifications += group
            }
            return ReminderSchedule(notifications, leftOutForRoom, unusableDates)
        }

        /**
         * The next time a notification rings strictly after `afterMillis`, or null when it never will again (a one-off that is past). Repeating ones follow the
         * phone's clock: "every day at 08:00" is 08:00 wherever the phone is now (and across a change of clocks).
         */
        fun nextRing(timing: ReminderNotification.Timing, afterMillis: Long, zone: ZoneId): Long? = when (timing) {
            is ReminderNotification.Timing.Once -> timing.epochMillis.takeIf { it > afterMillis }
            is ReminderNotification.Timing.Daily -> nextDaily(timing.hour, timing.minute, afterMillis, zone)
            is ReminderNotification.Timing.Weekly -> nextWeekly(timing.weekday, timing.hour, timing.minute, afterMillis, zone)
        }

        private fun nextDaily(hour: Int, minute: Int, afterMillis: Long, zone: ZoneId): Long {
            val start = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(afterMillis), zone).toLocalDate()
            for (offset in 0L..2L) {
                val at = ZonedDateTime.of(start.plusDays(offset), java.time.LocalTime.of(hour, minute), zone).toInstant().toEpochMilli()
                if (at > afterMillis) return at
            }
            return ZonedDateTime.of(start.plusDays(3), java.time.LocalTime.of(hour, minute), zone).toInstant().toEpochMilli()
        }

        private fun nextWeekly(weekday: Int, hour: Int, minute: Int, afterMillis: Long, zone: ZoneId): Long {
            val start = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(afterMillis), zone).toLocalDate()
            // java.time numbers Monday 1 ... Sunday 7; ours is Sunday 1 ... Saturday 7
            for (offset in 0L..8L) {
                val date = start.plusDays(offset)
                if (date.dayOfWeek.value % 7 + 1 != weekday) continue
                val at = ZonedDateTime.of(date, java.time.LocalTime.of(hour, minute), zone).toInstant().toEpochMilli()
                if (at > afterMillis) return at
            }
            return afterMillis + 7 * 24 * 3_600_000L // unreachable for weekday 1..7
        }
    }
}

/**
 * When the page sends its plan again (it does, every time the app opens or comes to the front, and after a rotation) an alarm that is already waiting must be left
 * alone: an Android alarm is not exact, it may ring up to a minute or two after its time, and setting it again in that gap would find "08:00 has passed" and
 * move it to tomorrow, so the reminder would never ring. iOS rings at the exact second and has no such gap.
 */
object ReminderRearm {
    /** How long after its time an armed alarm is still taken as "on its way" (Doze can hold one back for minutes). */
    const val GRACE_MILLIS = 10 * 60_000L

    /**
     * True when the alarm already armed for `previous` (the same text and times as `next`) should be kept: it is still in the system (`pendingExists`) and its
     * ring is ahead of us or only just behind. False means set it again (new, changed, lost with a force-stop, or long overdue).
     */
    fun keep(previous: ReminderNotification?, next: ReminderNotification, armedAt: Long?, pendingExists: Boolean, nowMillis: Long): Boolean {
        if (previous == null || previous != next || armedAt == null || !pendingExists) return false
        return armedAt > nowMillis - GRACE_MILLIS
    }
}
