package com.amanmarwaha.numbite.billing

import android.content.Context

/** The release twin of src/debug's DebugPurchaseServices: there is no fake in a release build, so this never offers one. */
internal object DebugPurchaseServices {
    @Suppress("UNUSED_PARAMETER")
    fun create(appContext: Context): PurchaseService? = null
}
