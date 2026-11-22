package com.amanmarwaha.numbite.web

import android.webkit.WebView
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.amanmarwaha.numbite.AppConfig
import java.util.Locale

/** The four insets in CSS pixels (what `env(safe-area-inset-*)` is on the iPhone). */
data class Edges(val top: Float, val right: Float, val bottom: Float, val left: Float) {
    companion object { val NONE = Edges(0f, 0f, 0f, 0f) }
}

/**
 * The page keeps clear of the status bar, the camera cut-out and the navigation bar (gesture bar or three buttons) with `env(safe-area-inset-*)`, as it does in the
 * iPhone app (web/app/app/_lib/statusBar.ts, and 47 uses in the app's CSS): the web view fills the whole screen, under the bars, and the page pads itself. An Android
 * web view only turns a camera cut-out into those four numbers (newer ones add the bars; the phone has whichever Google last updated), so the app states them
 * itself as CSS variables on <html>, `--sai-top` and the others, and scripts/android_safe_area.py makes the packed page read them first, falling back to env().
 *
 * While the keyboard is up the page is lifted above it (the container pads itself, MainActivity) and has no bar left to keep clear of, so the bottom is 0.
 */
object SafeAreaInsets {
    /** Pixels to CSS pixels, and the keyboard rule. `barsPx` = system bars and cutout, the larger of each side (WindowInsetsCompat's own union). */
    fun toCss(topPx: Int, rightPx: Int, bottomPx: Int, leftPx: Int, keyboardUp: Boolean, density: Float): Edges {
        val d = if (density > 0f) density else 1f
        fun css(px: Int) = Math.round(px / d * 100f) / 100f
        return Edges(css(topPx), css(rightPx), if (keyboardUp) 0f else css(bottomPx), css(leftPx))
    }

    /** The script that puts the four values on <html>. It waits for <html> if it runs before it exists (a document-start script can). */
    fun script(edges: Edges): String {
        fun px(v: Float) = String.format(Locale.US, "%s", if (v == Math.floor(v.toDouble()).toFloat()) v.toInt().toString() else v.toString()) + "px"
        return """
            (function () {
              function set() {
                var r = document.documentElement;
                if (!r) return false;
                r.style.setProperty("--sai-top", "${px(edges.top)}");
                r.style.setProperty("--sai-right", "${px(edges.right)}");
                r.style.setProperty("--sai-bottom", "${px(edges.bottom)}");
                r.style.setProperty("--sai-left", "${px(edges.left)}");
                return true;
              }
              if (!set()) new MutationObserver(function (_, o) { if (set()) o.disconnect(); }).observe(document, { childList: true });
            })();
        """.trimIndent()
    }
}

/**
 * Keeps the page's safe-area variables right for one web view: registered to run before the page's own scripts on every load, and run at once on the page already
 * there when the insets change (a rotation, the keyboard).
 */
class SafeArea {
    var edges: Edges? = null
        private set
    private var handler: ScriptHandler? = null
    private val documentStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

    /** New values for `webView` (null: no web view yet). */
    fun update(webView: WebView?, next: Edges) {
        if (next == edges && handler != null) return
        edges = next
        webView ?: return
        replaceHandler(webView)
        if (BridgeHost.isOurs(webView.url)) webView.evaluateJavascript(SafeAreaInsets.script(next), null)
    }

    /** For a web view that has none registered yet (before its first page loads). */
    fun install(webView: WebView) = replaceHandler(webView)

    /** Only a web view without document-start scripts needs this: the values go in as the page starts. */
    fun onPageStarted(webView: WebView, url: String?) {
        val now = edges ?: return
        if (!documentStart && BridgeHost.isOurs(url)) webView.evaluateJavascript(SafeAreaInsets.script(now), null)
    }

    private fun replaceHandler(webView: WebView) {
        val now = edges ?: return
        if (!documentStart) return
        handler?.remove()
        handler = WebViewCompat.addDocumentStartJavaScript(webView, SafeAreaInsets.script(now), setOf(AppConfig.APP_ORIGIN))
    }

    /** A new web view (the old one's process ended) starts with no handler of its own. */
    fun forget() { handler = null }
}
