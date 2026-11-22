package com.amanmarwaha.numbite.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** A reminder's alarm rang (set by [ReminderScheduler] itself; not exported). */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ReminderScheduler.ACTION_RING) return
        val identifier = intent.data?.schemeSpecificPart ?: return
        if (!ReminderPlan.isOurs(identifier)) return
        try {
            ReminderScheduler(context).onRing(identifier)
        } catch (e: Exception) {
            Log.w("NumbiteReminders", "A reminder could not be shown", e)
        }
    }
}
