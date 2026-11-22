package com.amanmarwaha.numbite.bridge

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.amanmarwaha.numbite.reminders.ReminderNotifier
import com.amanmarwaha.numbite.reminders.ReminderPlanItem
import com.amanmarwaha.numbite.reminders.ReminderScheduler

/** The reminders' side of the bridge (NotificationScheduling in the iPhone app): ask for permission, read it, hand over the whole plan, open the app's notification settings. */
interface NotificationScheduling {
    /** "granted", "denied" or "notDetermined" (not asked yet). */
    suspend fun status(): String
    suspend fun requestPermission(): String
    suspend fun replaceReminders(plan: ReminderPlanItem.Parsed)
    fun openSettings()
}

class AndroidNotifications(
    private val context: Context,
    private val permissions: PermissionBroker,
    private val scheduler: ReminderScheduler = ReminderScheduler(context),
) : NotificationScheduling {
    private val prefs = context.getSharedPreferences("numbite_notifications", Context.MODE_PRIVATE)

    override suspend fun status(): String {
        if (ReminderNotifier.canShow(context)) return "granted"
        // Android 13+ asks once (twice at most); until it has been asked the answer is "not asked yet", afterwards "denied". Before 13 only the app's switch in Settings counts.
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !prefs.getBoolean(ASKED, false)) "notDetermined" else "denied"
    }

    override suspend fun requestPermission(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !ReminderNotifier.canShow(context)) {
            if (!prefs.getBoolean(ASKED, false)) ReminderNotifier.ensureChannel(context)
            permissions.request(Manifest.permission.POST_NOTIFICATIONS)
            prefs.edit().putBoolean(ASKED, true).apply()
        }
        return status()
    }

    override suspend fun replaceReminders(plan: ReminderPlanItem.Parsed) {
        scheduler.replace(plan)
    }

    override fun openSettings() {
        try {
            context.startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (e: Exception) {
            Log.w("NumbiteNotifications", "Could not open the notification settings", e)
        }
    }

    private companion object { const val ASKED = "asked" }
}
