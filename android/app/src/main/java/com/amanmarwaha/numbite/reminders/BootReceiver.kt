package com.amanmarwaha.numbite.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** The phone restarted, the app was updated or the clock or time zone changed: the reminders are set again. Only the system's own broadcasts do anything here. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED -> try {
                ReminderScheduler(context).rescheduleAll()
            } catch (e: Exception) {
                Log.w("NumbiteReminders", "Reminders could not be set again", e)
            }
        }
    }
}
