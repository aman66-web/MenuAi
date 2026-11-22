package com.amanmarwaha.numbite.web

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

/** Everything about how the app's web view behaves, in one place. Light only, no file or content access, no mixed content, Safe Browsing on. */
object WebViewSetup {
    /** Flip to true to let the phone's font-size setting scale the page (the iPhone app does not: its web view ignores Dynamic Type). */
    const val FOLLOW_SYSTEM_TEXT_SIZE = false

    /** The app's page grey (globals.css --background in the app), behind the page while it draws. */
    val PAGE_COLOR: Int = Color.parseColor("#F4F5F6")

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    fun configure(webView: WebView) {
        webView.setBackgroundColor(PAGE_COLOR)
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER
        webView.settings.apply {
            javaScriptEnabled = true // the app is a web app
            domStorageEnabled = true // localStorage and IndexedDB: the person's settings, orders and lists stay on the phone between launches and updates
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
            setGeolocationEnabled(true) // only ever through the permission flow in NumbiteChromeClient
            cacheMode = WebSettings.LOAD_DEFAULT // the page does its own offline caching
            mediaPlaybackRequiresUserGesture = false // the camera preview of the page's scanner starts when Android's camera question is answered
            // Standard text only, as on the iPhone (founder 2026-11-19, TEXT_SIZE_CHOICE_ENABLED false): the web view must not scale the page with the phone's font size
            // (it does, at launch, if left alone: 24 px instead of 16 px at 150%)
            if (!FOLLOW_SYSTEM_TEXT_SIZE) textZoom = 100
            useWideViewPort = true // so the page's viewport meta (width=device-width, viewport-fit=cover) is honoured
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            setSupportMultipleWindows(false) // target=_blank and window.open load in this view, where NavigationPolicy sends other sites outside
            javaScriptCanOpenWindowsAutomatically = false
        }
        // Light only (founder 2026-10-15): the system must not darken the page behind its back.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, false)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) WebSettingsCompat.setForceDark(webView.settings, WebSettingsCompat.FORCE_DARK_OFF)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        // A download link (the share card's last fallback) would replace the whole app with a file and leave no way back: nothing is downloaded (WebAppView.swift).
        webView.setDownloadListener { _, _, _, _, _ -> }
    }
}
