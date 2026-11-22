package com.amanmarwaha.numbite.billing

import android.content.Context
import java.security.MessageDigest

/**
 * Which base plan the last purchase made in this app was. Play's client library says which subscription a purchase is for but not which base plan (only our
 * server can ask Google that), so without this the app couldn't tell "already on the plan asked for" from "on the other plan" when someone taps a plan they
 * hold. Only the latest purchase is kept, and only as a one-way hash of its token (never the token itself). Losing it (a reinstall, another phone) is harmless:
 * the app then asks Play for a plan change, and Play decides.
 */
internal interface PlanMemory {
    fun remember(token: String, plan: BasePlan)
    fun planOf(token: String): BasePlan?
}

internal class InMemoryPlanMemory : PlanMemory {
    private var latest: Pair<String, BasePlan>? = null

    @Synchronized
    override fun remember(token: String, plan: BasePlan) {
        latest = token to plan
    }

    @Synchronized
    override fun planOf(token: String): BasePlan? = latest?.takeIf { it.first == token }?.second
}

internal class PrefsPlanMemory(context: Context) : PlanMemory {
    private val prefs = context.applicationContext.getSharedPreferences("numbite_billing", Context.MODE_PRIVATE)

    override fun remember(token: String, plan: BasePlan) {
        prefs.edit().putString(KEY_HASH, hash(token)).putString(KEY_PLAN, plan.baseId).apply()
    }

    override fun planOf(token: String): BasePlan? {
        if (prefs.getString(KEY_HASH, null) != hash(token)) return null
        val baseId = prefs.getString(KEY_PLAN, null) ?: return null
        return BasePlan.entries.firstOrNull { it.baseId == baseId }
    }

    private fun hash(token: String): String =
        MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }.take(32)

    private companion object {
        const val KEY_HASH = "last_token_hash"
        const val KEY_PLAN = "last_base_plan"
    }
}
