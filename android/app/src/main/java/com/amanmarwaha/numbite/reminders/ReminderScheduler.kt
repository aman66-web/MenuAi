package com.amanmarwaha.numbite.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import java.time.ZoneId

/**
 * Local notifications for the reminders on Home: the web app sends a plan, this makes the phone ring exactly that (UserNotificationScheduler.swift on the
 * iPhone). No server, no account, nothing leaves the phone. Android facts that shape it:
 *  - An alarm rings once, so the next ring of a daily or weekly reminder is set when it rings ([onRing]), and every one is set again after a restart, an update or a
 *    change of clock or time zone ([rescheduleAll], BootReceiver).
 *  - They are set with `setAndAllowWhileIdle`: no special "exact alarms" permission (Google restricts it to alarm and calendar apps), at the price that a reminder
 *    can ring a few minutes after its time while the phone is dozing (docs/ANDROID_BUILD.md "Reminders").
 *  - A plan replaces the old one whole: the new alarms are set first and only then the ones no longer wanted are cancelled, so there is never a moment with
 *    nothing scheduled, and sending the same plan twice changes nothing (an alarm with the same identity replaces itself).
 *  - Only identifiers starting "mm.reminder." are ours.
 */
class ReminderScheduler(
    context: Context,
    private val clock: () -> Long = System::currentTimeMillis,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) {
    private val context = context.applicationContext
    private val alarms = this.context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val store = ReminderStore(this.context)

    /** Applies a whole plan. Returns how many notifications are now scheduled. */
    @Synchronized
    fun replace(plan: ReminderPlanItem.Parsed): Int {
        val now = clock()
        val schedule = ReminderSchedule.make(plan.items, now, zone())
        if (plan.ignored > 0 || schedule.leftOutForRoom > 0 || schedule.unusableDates > 0) {
            Log.w(TAG, "Reminder plan: ${plan.ignored} entries ignored, ${schedule.leftOutForRoom} left out for room, ${schedule.unusableDates} dates already past or not real")
        }
        val old = store.entries().associateBy { it.notification.identifier }
        val wanted = schedule.notifications.map { it.identifier }.toSet()
        val kept = schedule.notifications.map { n ->
            val before = old[n.identifier]
            // an alarm already waiting is left alone (see ReminderRearm): the page sends its plan again and again
            if (ReminderRearm.keep(before?.notification, n, before?.armedAt, pendingExists(n.identifier), now)) ReminderStore.Entry(n, before?.armedAt)
            else ReminderStore.Entry(n, set(n))
        }
        val removed = old.keys.filter { it !in wanted }
        removed.forEach { cancel(it) }
        store.saveEntries(kept)
        ReminderNotifier.clearGone(context, plan.items.map { it.id }.toSet())
        Log.i(TAG, "Reminders scheduled: ${schedule.notifications.size}, ${removed.size} old removed")
        return schedule.notifications.size
    }

    /** After a restart, an update or a change of clock or zone: every remembered notification is set again (a one-off that has passed is dropped, never rung late). */
    @Synchronized
    fun rescheduleAll() {
        val keep = store.entries().mapNotNull { e ->
            val armed = set(e.notification)
            if (armed == null) { cancel(e.notification.identifier); null } else ReminderStore.Entry(e.notification, armed)
        }
        store.saveEntries(keep)
        Log.i(TAG, "Reminders set again: ${keep.size}")
    }

    /** An alarm rang: show it, then set the next ring of a repeating one. */
    @Synchronized
    fun onRing(identifier: String) {
        val all = store.entries()
        val entry = all.firstOrNull { it.notification.identifier == identifier } ?: return cancel(identifier)
        ReminderNotifier.show(context, entry.notification)
        if (entry.notification.timing is ReminderNotification.Timing.Once) {
            store.saveEntries(all.filter { it.notification.identifier != identifier })
        } else {
            val next = set(entry.notification, after = clock() + 1_000)
            store.saveEntries(all.map { if (it.notification.identifier == identifier) ReminderStore.Entry(it.notification, next) else it })
        }
    }

    /** Sets the alarm for the next ring after `after`; returns when it was set for (null when it never rings again). */
    private fun set(notification: ReminderNotification, after: Long = clock()): Long? {
        val at = ReminderSchedule.nextRing(notification.timing, after, zone())
        if (at == null) {
            cancel(notification.identifier)
            return null
        }
        try {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent(notification.identifier))
        } catch (e: Exception) { // never crash over a reminder
            Log.w(TAG, "Could not set a reminder", e)
        }
        return at
    }

    private fun cancel(identifier: String) {
        val intent = pendingIntent(identifier)
        alarms.cancel(intent)
        intent.cancel()
    }

    /** True when an alarm for this notification is in the system (a force-stop or a restart removes them, which is why the store alone is not trusted). */
    private fun pendingExists(identifier: String): Boolean = PendingIntent.getBroadcast(
        context, 0, ringIntent(identifier), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    ) != null

    private fun ringIntent(identifier: String) = Intent(context, ReminderReceiver::class.java).setAction(ACTION_RING).setData(Uri.fromParts("numbite-reminder", identifier, null))

    private fun pendingIntent(identifier: String): PendingIntent = PendingIntent.getBroadcast(
        context, 0, ringIntent(identifier), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    companion object {
        const val ACTION_RING = "com.amanmarwaha.numbite.REMINDER_RING"
        private const val TAG = "NumbiteReminders"
    }
}
