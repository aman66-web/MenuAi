package com.amanmarwaha.numbite.reminders

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.amanmarwaha.numbite.MainActivity
import com.amanmarwaha.numbite.R

/**
 * Shows a reminder: the person's own name and note and nothing else. No medication guidance, and never a word like "missed" or "late" (CLAUDE.md rule 3): the
 * text is exactly what the person typed (the page sends its own neutral line when they typed no note). Tapping it opens the app.
 */
object ReminderNotifier {
    const val CHANNEL_ID = "reminders"
    private const val NOTIFICATION_ID = 1

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(CHANNEL_ID, context.getString(R.string.reminders_channel_name), NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = context.getString(R.string.reminders_channel_description)
        }
        manager.createNotificationChannel(channel)
    }

    /** True when notifications may be shown (the Android 13 permission and the app's notification switch in Settings). */
    fun canShow(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun show(context: Context, notification: ReminderNotification) {
        if (!canShow(context)) return
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val built = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_numbite)
            .setContentTitle(notification.title)
            .apply { if (notification.body.isNotEmpty()) setContentText(notification.body).setStyle(NotificationCompat.BigTextStyle().bigText(notification.body)) }
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notification.identifier, NOTIFICATION_ID, built)
        } catch (_: SecurityException) {
            // the permission was taken away a moment ago: nothing to show
        }
    }

    /** A ring already in the notification shade stays while its reminder exists, but goes with a deleted one (or Clear data). */
    fun clearGone(context: Context, plannedReminderIds: Set<String>) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        for (active in manager.activeNotifications) {
            val tag = active.tag ?: continue
            val owner = ReminderPlan.ownerOf(tag) ?: continue
            if (owner !in plannedReminderIds) manager.cancel(tag, active.id)
        }
    }
}
