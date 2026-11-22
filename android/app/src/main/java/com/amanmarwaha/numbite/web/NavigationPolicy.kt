package com.amanmarwaha.numbite.web

import com.amanmarwaha.numbite.AppConfig
import java.net.URI

/** What to do with an address the web view is about to go to. */
sealed interface NavDecision {
    /** Let the web view load it (it is the app's own page, or a frame inside a page). */
    data object Allow : NavDecision
    /** Load this page of the packed app instead (a shopping list link or a friend's invite clicked inside a page). */
    data class LoadInApp(val url: String) : NavDecision
    /** Hand it to the browser, the mail app or the dialler. */
    data class OpenOutside(val url: String) : NavDecision
    /** Do nothing. */
    data object Refuse : NavDecision
}

/**
 * Which addresses stay in the app: exactly WebAppView.swift's decidePolicyFor. Only the app's own origin stays; other websites open in the browser, mail
 * and phone links go to their apps; a download link (blob:, data:) would replace the whole app with a file and leave no way back, so it is refused; a
 * frame inside a page may load its own https content. Anything unknown (intent:, file:, javascript:, market:) is refused rather than handed to the system.
 */
object NavigationPolicy {
    private val outsideSchemes = setOf("http", "https", "mailto", "tel", "sms", "smsto", "geo")

    fun decide(url: String, isMainFrame: Boolean): NavDecision {
        val uri = try { URI(url.trim()) } catch (_: Exception) { return NavDecision.Refuse }
        val scheme = uri.scheme?.lowercase() ?: return NavDecision.Refuse
        if (scheme == "about") return NavDecision.Allow
        if (scheme == "blob" || scheme == "data") return if (isMainFrame) NavDecision.Refuse else NavDecision.Allow
        if (scheme == "https" && uri.host?.lowercase() == AppConfig.APP_HOST) return NavDecision.Allow
        // a friend's shared shopping list or invite: the page for it is in the app
        AppLinks.appUrl(url)?.let { return if (isMainFrame) NavDecision.LoadInApp(it) else NavDecision.Refuse }
        if (!isMainFrame) return if (scheme == "https") NavDecision.Allow else NavDecision.Refuse
        return if (scheme in outsideSchemes) NavDecision.OpenOutside(url.trim()) else NavDecision.Refuse
    }
}
