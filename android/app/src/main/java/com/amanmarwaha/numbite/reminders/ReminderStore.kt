package com.amanmarwaha.numbite.reminders

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The notifications the app has scheduled, kept in the app's private storage so they can be set again after a restart and each repeating one can ring again after it
 * has rung (an Android alarm rings once). It holds only what the person typed for their own reminders (name, note, times); it is excluded from backup and device
 * transfer (xml/data_extraction_rules.xml) and nothing here is ever sent anywhere.
 */
class ReminderStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("numbite_reminders", Context.MODE_PRIVATE)

    /** A scheduled notification and the moment its alarm was last set for (null: not known). */
    data class Entry(val notification: ReminderNotification, val armedAt: Long?)

    fun entries(): List<Entry> = try {
        val array = JSONArray(prefs.getString(KEY, "[]"))
        (0 until array.length()).mapNotNull { index ->
            val o = array.optJSONObject(index)
            decode(o)?.let { Entry(it, if (o.has("armedAt")) o.optLong("armedAt") else null) }
        }
    } catch (_: Exception) {
        emptyList()
    }

    fun load(): List<ReminderNotification> = entries().map { it.notification }

    fun saveEntries(entries: List<Entry>) {
        prefs.edit().putString(KEY, JSONArray(entries.map { e -> encode(e.notification).also { o -> e.armedAt?.let { o.put("armedAt", it) } } }).toString()).apply()
    }

    private fun encode(n: ReminderNotification) = JSONObject().put("identifier", n.identifier).put("reminderId", n.reminderId).put("title", n.title).put("body", n.body).also {
        when (val t = n.timing) {
            is ReminderNotification.Timing.Daily -> it.put("kind", "daily").put("hour", t.hour).put("minute", t.minute)
            is ReminderNotification.Timing.Weekly -> it.put("kind", "weekly").put("weekday", t.weekday).put("hour", t.hour).put("minute", t.minute)
            is ReminderNotification.Timing.Once -> it.put("kind", "once").put("at", t.epochMillis)
        }
    }

    private fun decode(o: JSONObject?): ReminderNotification? {
        o ?: return null
        val identifier = o.optString("identifier").takeIf { ReminderPlan.isOurs(it) } ?: return null
        val timing = when (o.optString("kind")) {
            "daily" -> ReminderNotification.Timing.Daily(o.optInt("hour"), o.optInt("minute"))
            "weekly" -> ReminderNotification.Timing.Weekly(o.optInt("weekday"), o.optInt("hour"), o.optInt("minute"))
            "once" -> ReminderNotification.Timing.Once(o.optLong("at"))
            else -> return null
        }
        return ReminderNotification(identifier, o.optString("reminderId"), o.optString("title"), o.optString("body"), timing)
    }

    private companion object { const val KEY = "schedule" }
}
