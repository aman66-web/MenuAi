package com.amanmarwaha.numbite.reminders

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

/** ReminderPlanItem.swift's rules, and the ring times the AlarmManager is given. */
class ReminderPlanTest {
    private val london = ZoneId.of("Europe/London")
    private fun item(json: String): ReminderPlanItem? = ReminderPlanItem.parseItem(JSONObject(json))
    private fun at(zone: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int) = ZonedDateTime.of(LocalDateTime.of(y, mo, d, h, mi), zone).toInstant().toEpochMilli()

    // ---- parsing

    @Test fun aDailyReminder() {
        val parsed = item("""{"id":"r-1_a","title":"Lunch","body":"Time to eat","hour":12,"minute":30}""")!!
        assertEquals(ReminderPlanItem("r-1_a", "Lunch", "Time to eat", 12, 30, ReminderPlanItem.Ring.Daily), parsed)
    }

    @Test fun theNoteMayBeMissingOrNull() {
        assertEquals("", item("""{"id":"a","title":"T","hour":1,"minute":2}""")!!.body)
        assertEquals("", item("""{"id":"a","title":"T","body":null,"hour":1,"minute":2}""")!!.body)
        assertNull(item("""{"id":"a","title":"T","body":5,"hour":1,"minute":2}"""))
    }

    @Test fun weekdaysAreSortedAndUnique() {
        val parsed = item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[7,2,2,1]}""")!!
        assertEquals(ReminderPlanItem.Ring.Weekdays(listOf(1, 2, 7)), parsed.ring)
    }

    @Test fun aBadWeekdayRefusesTheWholeItem() {
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[1,8]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[0]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":["1"]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[1.5]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[true]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":5}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[1,2,3,4,5,6,7,1,2,3,4,5,6,7,1]}"""))
    }

    @Test fun everyFewDaysCarriesItsDates() {
        val parsed = item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":["2026-11-23T08:00","2026-11-26T08:00","2026-11-23T08:00"]}""")!!
        assertEquals(ReminderPlanItem.Ring.OneOffs(listOf(ReminderMoment(2026, 11, 23, 8, 0), ReminderMoment(2026, 11, 26, 8, 0))), parsed.ring)
    }

    @Test fun aBadDateRefusesTheWholeItem() {
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":["2026-11-23 08:00"]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":["2026-13-23T08:00"]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":["2026-11-23T24:00"]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":[]}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":[5]}"""))
    }

    @Test fun bothWeekdaysAndDatesIsRefused() {
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":0,"weekdays":[1],"fireAt":["2026-11-23T08:00"]}"""))
    }

    @Test fun datesAreCappedAtTwenty() {
        val dates = (1..25).joinToString(",") { "\"2026-12-%02dT08:00\"".format(it) }
        val parsed = item("""{"id":"a","title":"T","hour":8,"minute":0,"fireAt":[$dates]}""")!!
        assertEquals(20, (parsed.ring as ReminderPlanItem.Ring.OneOffs).moments.size)
    }

    @Test fun hoursAndMinutesAreChecked() {
        assertNull(item("""{"id":"a","title":"T","hour":24,"minute":0}"""))
        assertNull(item("""{"id":"a","title":"T","hour":-1,"minute":0}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8,"minute":60}"""))
        assertNull(item("""{"id":"a","title":"T","hour":8.5,"minute":0}"""))
        assertNull(item("""{"id":"a","title":"T","hour":"8","minute":0}"""))
        assertNull(item("""{"id":"a","title":"T","hour":true,"minute":0}"""))
        assertNull(item("""{"id":"a","title":"T","minute":0}"""))
        assertNotNull(item("""{"id":"a","title":"T","hour":23,"minute":59}"""))
        assertNotNull(item("""{"id":"a","title":"T","hour":0,"minute":0}"""))
    }

    @Test fun idsAndTitles() {
        assertNull(item("""{"id":"","title":"T","hour":8,"minute":0}"""))
        assertNull(item("""{"id":"a.b","title":"T","hour":8,"minute":0}"""))
        assertNull(item("""{"id":"a b","title":"T","hour":8,"minute":0}"""))
        assertNull(item("""{"id":"${"a".repeat(65)}","title":"T","hour":8,"minute":0}"""))
        assertNotNull(item("""{"id":"${"a".repeat(64)}","title":"T","hour":8,"minute":0}"""))
        assertNull(item("""{"id":"a","title":"","hour":8,"minute":0}"""))
        assertNull(item("""{"id":"a","title":"   \n ","hour":8,"minute":0}"""))
        assertNull(item("""{"id":"a","hour":8,"minute":0}"""))
        assertNull(item("""{"id":5,"title":"T","hour":8,"minute":0}"""))
    }

    @Test fun textIsCleanedAndCut() {
        assertEquals("a b c", ReminderPlanItem.clean("  a\nb\tc  ", 100))
        assertEquals("a b", ReminderPlanItem.clean("a b", 100))
        assertEquals("a b", ReminderPlanItem.clean("a b", 100))
        // the joiners and the left/right marks are kept (Persian, emoji sequences)
        assertEquals("می‌خواهم", ReminderPlanItem.clean("می‌خواهم", 100))
        assertEquals("👩‍🍳", ReminderPlanItem.clean("👩‍🍳", 100))
        // cut to whole characters, never in half a pair
        assertEquals("😀😀", ReminderPlanItem.clean("😀😀😀", 2))
        assertEquals(100, ReminderPlanItem.clean("x".repeat(150), 100).length)
        assertEquals("T", item("""{"id":"a","title":"  T  ","hour":8,"minute":0}""")!!.title)
    }

    @Test fun aPlanThatIsNotAListIsNull() {
        assertNull(ReminderPlanItem.parsePlan(null))
        assertNull(ReminderPlanItem.parsePlan("x"))
        assertNull(ReminderPlanItem.parsePlan(JSONObject()))
        assertEquals(0, ReminderPlanItem.parsePlan(JSONArray())!!.items.size)
    }

    @Test fun aPlanDropsBadAndRepeatedItemsAndCapsAtFifty() {
        val items = JSONArray()
        items.put(JSONObject("""{"id":"a","title":"A","hour":8,"minute":0}"""))
        items.put(JSONObject("""{"id":"a","title":"Again","hour":9,"minute":0}"""))
        items.put("not an object")
        items.put(JSONObject("""{"id":"b","title":"","hour":8,"minute":0}"""))
        val parsed = ReminderPlanItem.parsePlan(items)!!
        assertEquals(listOf("a"), parsed.items.map { it.id })
        assertEquals("A", parsed.items[0].title)
        assertEquals(3, parsed.ignored)

        val many = JSONArray()
        for (i in 1..60) many.put(JSONObject("""{"id":"r$i","title":"T","hour":8,"minute":0}"""))
        val capped = ReminderPlanItem.parsePlan(many)!!
        assertEquals(50, capped.items.size)
        assertEquals(10, capped.ignored)
    }

    // ---- moments

    @Test fun momentsParseOnlyTheExactShape() {
        assertEquals(ReminderMoment(2026, 11, 23, 8, 5), ReminderMoment.parse("2026-11-23T08:05"))
        assertEquals("2026-11-23T08:05", ReminderMoment(2026, 11, 23, 8, 5).text)
        for (bad in listOf("", "2026-11-23T08:05:00", "2026-11-23 08:05", "26-11-23T08:05", "1999-11-23T08:05", "2201-11-23T08:05", "2026-00-23T08:05", "2026-11-32T08:05", "2026-11-23T08:5x", "２０２６-11-23T08:05"))
            assertNull("'$bad'", ReminderMoment.parse(bad))
    }

    @Test fun aDayThatDoesNotExistIsNotAMoment() {
        assertNull(ReminderMoment(2026, 2, 30, 8, 0).epochMillis(london))
        assertNull(ReminderMoment(2027, 2, 29, 8, 0).epochMillis(london))
        assertNotNull(ReminderMoment(2028, 2, 29, 8, 0).epochMillis(london))
    }

    // ---- the schedule

    private val now = at(london, 2026, 11, 22, 10, 0)

    @Test fun dailyAndWeeklyBecomeNamedNotifications() {
        val items = listOf(
            ReminderPlanItem("a", "Lunch", "", 12, 30, ReminderPlanItem.Ring.Daily),
            ReminderPlanItem("b", "Walk", "Go", 7, 0, ReminderPlanItem.Ring.Weekdays(listOf(2, 4))),
        )
        val schedule = ReminderSchedule.make(items, now, london)
        assertEquals(listOf("mm.reminder.a.daily", "mm.reminder.b.wd2", "mm.reminder.b.wd4"), schedule.notifications.map { it.identifier })
        assertEquals(ReminderNotification.Timing.Weekly(4, 7, 0), schedule.notifications[2].timing)
        assertEquals("b", ReminderPlan.ownerOf("mm.reminder.b.wd4"))
        assertNull(ReminderPlan.ownerOf("other.b.wd4"))
        assertNull(ReminderPlan.ownerOf("mm.reminder."))
    }

    @Test fun oneOffsKeepOnlyFutureRealDates() {
        val moments = listOf(ReminderMoment(2026, 11, 22, 9, 0), ReminderMoment(2026, 11, 22, 11, 0), ReminderMoment(2026, 2, 30, 8, 0), ReminderMoment(2026, 11, 25, 8, 0))
        val schedule = ReminderSchedule.make(listOf(ReminderPlanItem("a", "T", "", 8, 0, ReminderPlanItem.Ring.OneOffs(moments))), now, london)
        assertEquals(listOf("mm.reminder.a.at2026-11-22T11:00", "mm.reminder.a.at2026-11-25T08:00"), schedule.notifications.map { it.identifier })
        assertEquals(2, schedule.unusableDates)
    }

    @Test fun aReminderThatDoesNotFitIsLeftOutWholeAndASmallerOneIsTried() {
        val big = ReminderPlanItem("big", "B", "", 8, 0, ReminderPlanItem.Ring.Weekdays(listOf(1, 2, 3, 4, 5, 6, 7)))
        val small = ReminderPlanItem("small", "S", "", 8, 0, ReminderPlanItem.Ring.Daily)
        val schedule = ReminderSchedule.make(listOf(big, small), now, london, limit = 5)
        assertEquals(listOf("mm.reminder.small.daily"), schedule.notifications.map { it.identifier })
        assertEquals(1, schedule.leftOutForRoom)
        // the default cap is 60
        val many = (1..61).map { ReminderPlanItem("r$it", "T", "", 8, 0, ReminderPlanItem.Ring.Daily) }
        assertEquals(60, ReminderSchedule.make(many, now, london).notifications.size)
    }

    @Test fun nothingScheduledForAnEmptyPlan() {
        assertTrue(ReminderSchedule.make(emptyList(), now, london).notifications.isEmpty())
    }

    // ---- when it rings next

    @Test fun dailyRingsTodayIfItIsStillAhead() {
        assertEquals(at(london, 2026, 11, 22, 12, 30), ReminderSchedule.nextRing(ReminderNotification.Timing.Daily(12, 30), now, london))
    }

    @Test fun dailyRingsTomorrowOnceTodaysTimeHasPassed() {
        assertEquals(at(london, 2026, 11, 23, 8, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Daily(8, 0), now, london))
        // exactly now is not "after": it rings tomorrow
        assertEquals(at(london, 2026, 11, 23, 10, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Daily(10, 0), now, london))
    }

    @Test fun weeklyFollowsTheWeekdayNumbering() {
        // 22 November 2026 is a Sunday (1); Monday is 2, Saturday 7
        assertEquals(at(london, 2026, 11, 22, 18, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Weekly(1, 18, 0), now, london)) // later today
        assertEquals(at(london, 2026, 11, 29, 8, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Weekly(1, 8, 0), now, london)) // next Sunday
        assertEquals(at(london, 2026, 11, 23, 8, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Weekly(2, 8, 0), now, london)) // Monday
        assertEquals(at(london, 2026, 11, 28, 8, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Weekly(7, 8, 0), now, london)) // Saturday
    }

    @Test fun aOneOffRingsOnceThenNever() {
        val moment = at(london, 2026, 11, 25, 8, 0)
        assertEquals(moment, ReminderSchedule.nextRing(ReminderNotification.Timing.Once(moment), now, london))
        assertNull(ReminderSchedule.nextRing(ReminderNotification.Timing.Once(moment), moment, london))
    }

    @Test fun repeatingRemindersFollowThePhoneToANewTimeZone() {
        val tokyo = ZoneId.of("Asia/Tokyo")
        val next = ReminderSchedule.nextRing(ReminderNotification.Timing.Daily(8, 0), now, tokyo)!!
        assertEquals(at(tokyo, 2026, 11, 22, 8, 0).let { if (it > now) it else at(tokyo, 2026, 11, 23, 8, 0) }, next)
    }

    @Test fun dailyKeepsItsWallClockTimeAcrossTheClocksChanging() {
        // UK clocks went back on 25 October 2026: 08:00 stays 08:00 on the wall
        val before = at(london, 2026, 10, 24, 9, 0)
        assertEquals(at(london, 2026, 10, 25, 8, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Daily(8, 0), before, london))
        val after = at(london, 2026, 10, 25, 9, 0)
        assertEquals(at(london, 2026, 10, 26, 8, 0), ReminderSchedule.nextRing(ReminderNotification.Timing.Daily(8, 0), after, london))
    }
}

class ReminderRearmTest {
    private val n = ReminderNotification("mm.reminder.a.daily", "a", "Water", "", ReminderNotification.Timing.Daily(8, 0))
    private val now = 1_000_000_000L

    @Test fun anAlarmStillWaitingIsLeftAlone() {
        assertTrue(ReminderRearm.keep(n, n, now + 60_000, true, now))
    }

    @Test fun anAlarmJustPastItsTimeButNotYetRungIsLeftAlone() {
        // the page sends its plan again 35 s after 08:00 while the system is still holding the alarm back: moving it to tomorrow would lose the reminder
        assertTrue(ReminderRearm.keep(n, n, now - 35_000, true, now))
        assertTrue(ReminderRearm.keep(n, n, now - ReminderRearm.GRACE_MILLIS + 1, true, now))
    }

    @Test fun anAlarmLongOverdueIsSetAgain() {
        assertFalse(ReminderRearm.keep(n, n, now - ReminderRearm.GRACE_MILLIS - 1, true, now))
    }

    @Test fun aChangedOrNewOrLostAlarmIsSetAgain() {
        assertFalse(ReminderRearm.keep(null, n, now + 60_000, true, now))
        assertFalse(ReminderRearm.keep(n.copy(title = "Other"), n, now + 60_000, true, now))
        assertFalse(ReminderRearm.keep(n.copy(timing = ReminderNotification.Timing.Daily(9, 0)), n, now + 60_000, true, now))
        assertFalse(ReminderRearm.keep(n, n, now + 60_000, false, now)) // the system lost it (force-stop, restart)
        assertFalse(ReminderRearm.keep(n, n, null, true, now)) // armed at an unknown time
    }
}
