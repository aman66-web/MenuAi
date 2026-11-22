package com.amanmarwaha.numbite

import android.app.Activity
import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.amanmarwaha.numbite.billing.PurchaseService
import com.amanmarwaha.numbite.billing.createPurchaseService
import com.amanmarwaha.numbite.reminders.ReminderNotifier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.lang.ref.WeakReference

/**
 * Makes what must exist before any screen: light appearance only, the notification channel the reminders ring on, the one Google Play Billing service (made with the
 * app, so a purchase that completes while the app is closed is still heard when it opens), and the scope the page's requests run in.
 */
class NumbiteApp : Application() {
    /**
     * The page's requests run here, not in an Activity's scope: a purchase waiting on Google Play's sheet, a sign-in tab or a permission question must not be
     * cancelled because the Activity was rebuilt (a rotation is handled in place, but the system may still rebuild it).
     */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile private var activity: WeakReference<Activity>? = null

    /** The screen in front, held weakly, for the things that need one (Google Play's purchase sheet, the share sheet, Google's scanner). */
    fun currentActivity(): Activity? = activity?.get()

    fun setActivity(current: Activity?) {
        activity = current?.let { WeakReference(it) }
    }

    /** The one place the app asks for Play Billing; the shell only ever calls this factory (billing/PurchaseServices.kt). */
    val purchases: PurchaseService by lazy { createPurchaseService(this) { currentActivity() } }

    override fun onCreate() {
        super.onCreate()
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO) // light appearance only (founder 2026-10-15)
        ReminderNotifier.ensureChannel(this)
    }
}
