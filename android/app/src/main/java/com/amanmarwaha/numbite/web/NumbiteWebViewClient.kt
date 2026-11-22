package com.amanmarwaha.numbite.web

import android.graphics.Bitmap
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * Serves the app's own pages from its assets, keeps them in the app and sends everything else outside it (NavigationPolicy). WebAppView.swift's Coordinator.
 */
class NumbiteWebViewClient(
    private val loader: WebViewAssetLoader,
    private val host: BridgeHost,
    private val safeArea: SafeArea,
    private val openOutside: (String) -> Unit,
    private val loadInApp: (String) -> Unit,
    private val onFirstPaint: () -> Unit,
    private val onHistoryChanged: () -> Unit,
    private val onRenderGone: (WebView) -> Unit,
) : WebViewClient() {

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        when (val decision = NavigationPolicy.decide(request.url.toString(), request.isForMainFrame)) {
            NavDecision.Allow -> false
            is NavDecision.LoadInApp -> { loadInApp(decision.url); true }
            is NavDecision.OpenOutside -> { openOutside(decision.url); true }
            NavDecision.Refuse -> true
        }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        host.onPageStarted(view, url)
        safeArea.onPageStarted(view, url)
    }

    override fun onPageCommitVisible(view: WebView, url: String?) = onFirstPaint()

    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) = onHistoryChanged()

    /** If Android ends the page's process (memory pressure) or it crashes, the activity makes a new web view and goes back to where it was. */
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        Log.w("NumbiteWeb", "The page's process ended (crashed: ${detail.didCrash()})")
        onRenderGone(view)
        return true
    }
}
