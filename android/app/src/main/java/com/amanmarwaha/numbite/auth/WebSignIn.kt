package com.amanmarwaha.numbite.auth

import android.app.Activity
import android.net.Uri
import android.util.Log
import androidx.browser.customtabs.CustomTabsIntent
import com.amanmarwaha.numbite.AppConfig
import com.amanmarwaha.numbite.web.WebSignInOutcome
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Google and Apple block their sign-in pages inside an app's own web view, so the app opens numbite.com's sign-in in a browser tab (Chrome Custom Tabs;
 * WebSignInService.swift on the iPhone). That page ends on numbite://auth?code=..., which Android hands to MainActivity ([onCallback]). The PKCE verifier stays here:
 * only its SHA-256 goes in the address, so the code alone is of no use to another app that hears the callback. No key of any kind is in the app: the address is
 * our own API's `auth/<provider>/start`, which holds the server-side keys.
 */
interface WebSigningIn {
    suspend fun signIn(provider: String): WebSignInOutcome
}

class CustomTabsWebSignIn(
    private val scope: CoroutineScope,
    private val activityProvider: () -> Activity?,
    private val timeoutMillis: Long = TIMEOUT_MILLIS,
    private val returnGraceMillis: Long = RETURN_GRACE_MILLIS,
) : WebSigningIn {
    private class Pending(val verifier: String, val result: CompletableDeferred<WebSignInOutcome> = CompletableDeferred())

    private var pending: Pending? = null
    /** True once the app has gone to the background behind the tab: only then does coming back without a callback mean the person closed the tab. */
    private var wentToBackground = false
    private var returnWatch: Job? = null

    override suspend fun signIn(provider: String): WebSignInOutcome {
        if (provider != "google" && provider != "apple") return WebSignInOutcome.Unavailable
        val activity = activityProvider() ?: return WebSignInOutcome.Unavailable
        pending?.result?.complete(WebSignInOutcome.Cancelled) // a second tap replaces the first
        val verifier = Pkce.randomUrlSafe(48)
        val url = Uri.parse(AppConfig.API_BASE).buildUpon()
            .appendPath("auth").appendPath(provider).appendPath("start")
            .appendQueryParameter("mode", "app")
            .appendQueryParameter("challenge", Pkce.challengeFor(verifier))
            .build()
        val mine = Pending(verifier)
        pending = mine
        wentToBackground = false
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, url)
        } catch (e: Exception) { // no browser at all
            Log.w(TAG, "Could not open the sign-in tab", e)
            pending = null
            return WebSignInOutcome.Unavailable
        }
        val outcome = withTimeoutOrNull(timeoutMillis) { mine.result.await() } ?: WebSignInOutcome.Cancelled
        if (pending === mine) pending = null
        returnWatch?.cancel()
        return outcome
    }

    /** numbite://auth?... arrived (MainActivity.onNewIntent). Ignored unless a sign-in is waiting. */
    fun onCallback(link: String) {
        val mine = pending ?: return
        returnWatch?.cancel()
        mine.result.complete(WebSignInOutcome.parse(link, mine.verifier))
    }

    fun onActivityStopped() {
        if (pending != null) wentToBackground = true
    }

    /**
     * The app is back in front. The callback (if there is one) arrives before this, so a sign-in still waiting after a short moment means the person closed the
     * tab without finishing: that is a cancel, not an error.
     */
    fun onActivityResumed() {
        val mine = pending ?: return
        if (!wentToBackground) return
        returnWatch?.cancel()
        returnWatch = scope.launch {
            delay(returnGraceMillis)
            if (pending === mine) mine.result.complete(WebSignInOutcome.Cancelled)
        }
    }

    private companion object {
        const val TAG = "NumbiteSignIn"
        /** The server's sign-in flow allows 10 minutes (the page waits 11). */
        const val TIMEOUT_MILLIS = 10 * 60_000L
        const val RETURN_GRACE_MILLIS = 1_500L
    }
}
