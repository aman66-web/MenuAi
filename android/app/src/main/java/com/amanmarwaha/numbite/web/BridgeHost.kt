package com.amanmarwaha.numbite.web

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.amanmarwaha.numbite.AppConfig
import com.amanmarwaha.numbite.bridge.NativeBridge

/**
 * Connects the web view to the [NativeBridge], and decides who may talk to it: only the app's own page (the main frame on https://appassets.androidplatform.net).
 *
 * The normal way is `WebViewCompat.addWebMessageListener`: Android puts the `NumbiteBridge` object only into frames of that one origin (a page from any other
 * site never even sees it) and tells the listener which origin and frame a message came from, which is checked again here. A WebView too old to have it falls
 * back to `addJavascriptInterface`, which every frame can see, so there each call is checked against the page the web view is showing.
 */
class BridgeHost(private val bridge: NativeBridge) {
    private val main = Handler(Looper.getMainLooper())

    fun install(webView: WebView) {
        val listener = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        val documentStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (listener) {
            WebViewCompat.addWebMessageListener(webView, OBJECT_NAME, setOf(AppConfig.APP_ORIGIN)) { _, message, origin, isMainFrame, _ ->
                onMessage(message, origin, isMainFrame)
            }
        } else {
            webView.addJavascriptInterface(Fallback(webView), OBJECT_NAME)
        }
        if (documentStart) {
            WebViewCompat.addDocumentStartJavaScript(webView, BridgeShim.SCRIPT, setOf(AppConfig.APP_ORIGIN))
        }
        Log.i(TAG, "Bridge installed (messages: ${if (listener) "origin-scoped listener" else "javascript interface"}, shim: ${if (documentStart) "document start" else "page start"})")
        needsShimOnPageStart = !documentStart
    }

    private var needsShimOnPageStart = false

    /** Only a WebView without document-start scripts needs this: the shim goes in as the page starts, as early as it can. */
    fun onPageStarted(webView: WebView, url: String?) {
        if (needsShimOnPageStart && isOurs(url)) webView.evaluateJavascript(BridgeShim.SCRIPT, null)
    }

    private fun onMessage(message: WebMessageCompat, origin: Uri, isMainFrame: Boolean) {
        if (!isMainFrame || !isOurOrigin(origin)) {
            Log.w(TAG, "Refused a message from another page or frame")
            return
        }
        if (message.type != WebMessageCompat.TYPE_STRING) return
        message.data?.let { bridge.onMessage(it) }
    }

    /** Fallback only. Android calls this on its own thread; the check and the work happen on the main thread. */
    private inner class Fallback(private val webView: WebView) {
        @JavascriptInterface
        fun post(text: String?) {
            if (text == null) return
            main.post { if (isOurs(webView.url)) bridge.onMessage(text) else Log.w(TAG, "Refused a message from another page") }
        }
    }

    companion object {
        private const val TAG = "NumbiteBridge"
        const val OBJECT_NAME = "NumbiteBridge"

        fun isOurOrigin(origin: Uri): Boolean = origin.scheme == "https" && origin.host == AppConfig.APP_HOST && (origin.port == -1 || origin.port == 443)

        /** True when `url` is a page of the app itself. */
        fun isOurs(url: String?): Boolean = url != null && runCatching { isOurOrigin(Uri.parse(url)) }.getOrDefault(false)
    }
}
