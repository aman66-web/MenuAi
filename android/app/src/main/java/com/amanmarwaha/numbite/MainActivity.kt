package com.amanmarwaha.numbite

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.amanmarwaha.numbite.auth.CustomTabsWebSignIn
import com.amanmarwaha.numbite.bridge.AndroidDeviceIdentity
import com.amanmarwaha.numbite.bridge.AndroidLocationService
import com.amanmarwaha.numbite.bridge.AndroidNotifications
import com.amanmarwaha.numbite.bridge.GmsBarcodeScanner
import com.amanmarwaha.numbite.bridge.IntentShareService
import com.amanmarwaha.numbite.bridge.NativeBridge
import com.amanmarwaha.numbite.bridge.PermissionBroker
import com.amanmarwaha.numbite.bridge.PlayReviewPrompt
import com.amanmarwaha.numbite.billing.PurchaseUpdateSource
import com.amanmarwaha.numbite.session.KeystoreSessionStore
import com.amanmarwaha.numbite.web.AppAssetHandler
import com.amanmarwaha.numbite.web.AppLinks
import com.amanmarwaha.numbite.web.BridgeHost
import com.amanmarwaha.numbite.web.FileChooser
import com.amanmarwaha.numbite.web.NumbiteChromeClient
import com.amanmarwaha.numbite.web.NumbiteWebViewClient
import com.amanmarwaha.numbite.web.Edges
import com.amanmarwaha.numbite.web.SafeArea
import com.amanmarwaha.numbite.web.SafeAreaInsets
import com.amanmarwaha.numbite.web.WebViewSetup
import kotlinx.coroutines.CoroutineScope
import java.lang.ref.WeakReference

/**
 * The whole app: the web app packed inside it (assets/WebApp, scripts/build_android_web.sh; docs/ANDROID_BUILD.md), shown in a full-screen web view that loads its
 * pages from the app itself, so it works with no connection. Android does the location, share sheet, sign-in tab, reminder notifications and Google Play
 * Billing (the bridge, docs/ANDROID_BRIDGE.md). Links to other websites open in the browser, mail links in the mail app (NavigationPolicy). Light appearance only.
 * Rotation, a change of text size, language or dark mode are handled in place (the manifest's configChanges): the page is never reloaded for them.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var scope: CoroutineScope
    private lateinit var root: FrameLayout
    private var webView: WebView? = null
    private lateinit var permissions: PermissionBroker
    private lateinit var files: FileChooser
    private lateinit var webSignIn: CustomTabsWebSignIn
    private lateinit var bridgeHost: BridgeHost
    private lateinit var assetLoader: WebViewAssetLoader
    private val safeArea = SafeArea()

    /** The first address waits for the first insets (a moment), so the page starts with the right safe area. */
    private var pendingUrl: String? = null
    private lateinit var backCallback: OnBackPressedCallback

    /** The system splash stays until the page has drawn (or a few seconds pass: never a stuck launch screen). */
    private var pageReady = false
    private var splashDeadline = 0L
    private var renderRestarts = 0
    private var lastRestart = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splashDeadline = SystemClock.uptimeMillis() + SPLASH_MAX_MILLIS
        splash.setKeepOnScreenCondition { !pageReady && SystemClock.uptimeMillis() < splashDeadline }
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        val app = application as NumbiteApp
        scope = app.appScope // the page's requests outlive this Activity if the system rebuilds it
        app.setActivity(this)

        root = FrameLayout(this).apply { setBackgroundColor(WebViewSetup.PAGE_COLOR) }
        setContentView(root)
        // Edge to edge, exactly as in the iPhone app: the page runs under the status bar and the navigation bar and keeps clear of them itself with
        // env(safe-area-inset-*) (viewport-fit=cover; a recipe's picture runs up under the clock). The app tells the page the four values (SafeArea) and the
        // container only makes room for the keyboard. The first page waits for the first values, so it never draws with the wrong ones.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            val keyboardUp = insets.isVisible(WindowInsetsCompat.Type.ime()) && ime > 0
            view.setPadding(0, 0, 0, if (keyboardUp) ime else 0)
            safeArea.update(webView, SafeAreaInsets.toCss(bars.top, bars.right, bars.bottom, bars.left, keyboardUp, resources.displayMetrics.density))
            startPendingLoad()
            insets
        }

        // These register for results and so must exist before the activity starts.
        permissions = PermissionBroker(this)
        files = FileChooser(this, permissions, scope)
        val front = app::currentActivity // held weakly: nothing long-lived keeps this Activity alive
        webSignIn = CustomTabsWebSignIn(scope, front)
        val me = WeakReference(this)
        val purchases = app.purchases
        bridgeHost = BridgeHost(
            NativeBridge(
                scope = scope,
                scanner = GmsBarcodeScanner(applicationContext, front),
                location = AndroidLocationService(applicationContext, permissions),
                sharer = IntentShareService(applicationContext, front),
                webSignIn = webSignIn,
                notifications = AndroidNotifications(applicationContext, permissions),
                purchases = purchases,
                reviews = PlayReviewPrompt(applicationContext, front),
                session = KeystoreSessionStore(applicationContext),
                device = AndroidDeviceIdentity(applicationContext),
                hideKeyboard = { me.get()?.hideKeyboard() },
                runInPage = { script -> me.get()?.runInPage(script) },
            ),
        )
        // A purchase that arrives while the app is open (a payment that was pending and completed, a code redeemed in Google Play): the page looks at Google's list
        // at once instead of at the next return to the front (web/app/app/_components/AppShell.tsx listens for "menumath:purchases"; NativeBridge.swift does the same).
        (purchases as? PurchaseUpdateSource)?.onPurchasesChanged = {
            Handler(Looper.getMainLooper()).post { me.get()?.runInPage("window.dispatchEvent(new Event('menumath:purchases')); true;") }
        }
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(AppConfig.APP_HOST)
            .setHttpAllowed(false)
            .addPathHandler("/", AppAssetHandler(assets))
            .build()
        FileChooser.clearCache(this)

        backCallback = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                webView?.takeIf { it.canGoBack() }?.goBack()
            }
        }
        onBackPressedDispatcher.addCallback(this, backCallback)

        val link = pageFor(intent)
        val saved = savedInstanceState?.getString(STATE_URL)?.takeIf { BridgeHost.isOurs(it) }
        if (!startWebView(link ?: saved ?: AppConfig.START_URL)) pageReady = true
        // if no insets ever arrive (it should not happen), the page loads anyway after a moment, with the bars taken as 0
        root.postDelayed({ if (safeArea.edges == null) safeArea.update(webView, Edges.NONE); startPendingLoad() }, 400)
    }

    // ---- the web view

    /** Makes the web view and loads `url`. False when this phone has no usable WebView (then a plain message is shown instead). */
    private fun startWebView(url: String): Boolean {
        val view = try {
            WebView(this)
        } catch (e: Exception) { // Android System WebView missing, disabled or being updated
            Log.e(TAG, "No WebView", e)
            showBlockingMessage(getString(R.string.webview_missing_title), getString(R.string.webview_missing_body))
            return false
        }
        // Only a build run from Android Studio or adb (debuggable) can be inspected from Chrome's inspect page; a release build never can.
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        WebViewSetup.configure(view)
        view.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        view.webViewClient = NumbiteWebViewClient(
            loader = assetLoader,
            host = bridgeHost,
            safeArea = safeArea,
            openOutside = ::openOutside,
            loadInApp = ::loadInApp,
            onFirstPaint = { pageReady = true },
            onHistoryChanged = { backCallback.isEnabled = webView?.canGoBack() == true },
            onRenderGone = ::restartAfterRenderLoss,
        )
        view.webChromeClient = NumbiteChromeClient(permissions, files, scope)
        bridgeHost.install(view) // before the first page loads
        safeArea.forget()
        safeArea.install(view)
        root.addView(view)
        webView = view
        pendingUrl = url
        startPendingLoad()
        return true
    }

    private fun startPendingLoad() {
        val url = pendingUrl ?: return
        val view = webView ?: return
        if (safeArea.edges == null) return // not yet: the first insets are on their way
        pendingUrl = null
        view.loadUrl(url)
    }

    /** The page's process ended: a new web view goes back to where the person was (or to the start if it keeps happening). */
    private fun restartAfterRenderLoss(old: WebView) {
        val now = SystemClock.elapsedRealtime()
        renderRestarts = if (now - lastRestart < 30_000) renderRestarts + 1 else 1
        lastRestart = now
        val url = old.url?.takeIf { BridgeHost.isOurs(it) && renderRestarts <= 2 } ?: AppConfig.START_URL
        files.cancel()
        root.removeView(old)
        old.destroy()
        webView = null
        startWebView(url)
    }

    private fun runInPage(script: String) {
        val view = webView ?: return
        if (!BridgeHost.isOurs(view.url)) return // only the app's own page is ever answered
        view.evaluateJavascript(script, null)
    }

    private fun hideKeyboard() {
        val view = webView ?: return
        view.clearFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)?.hideSoftInputFromWindow(view.windowToken, 0)
    }

    /** Other websites open in the browser, mail in the mail app, phone numbers in the dialler (WebAppView.swift). */
    private fun openOutside(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            Log.w(TAG, "Nothing on this phone opens that link")
        } catch (e: Exception) {
            Log.w(TAG, "Could not open a link", e)
        }
    }

    private fun loadInApp(url: String) {
        val view = webView ?: return
        if (view.url != url) view.loadUrl(url)
    }

    private fun showBlockingMessage(title: String, body: String) {
        root.removeAllViews()
        root.addView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(64, 64, 64, 64)
                addView(TextView(context).apply { text = title; textSize = 20f; setTextColor(Color.BLACK); gravity = Gravity.CENTER })
                addView(TextView(context).apply { text = body; textSize = 16f; setTextColor(Color.DKGRAY); gravity = Gravity.CENTER; setPadding(0, 24, 0, 0) })
            },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
    }

    // ---- links the app is opened with

    /**
     * What an incoming intent asks for: the sign-in tab coming back (numbite://auth?code=...) is handed to the waiting sign-in; a shared shopping list or a
     * friend's invite (https://numbite.com/l#..., /f#..., numbite://l#..., numbite://f#...) returns the page of the packed app that shows it. Anything else is ignored.
     */
    private fun pageFor(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null // reopened from Recents: the link was handled long ago
        val data = intent.dataString ?: return null
        intent.data = null // handled once
        if (AppLinks.isAuthCallback(data)) {
            webSignIn.onCallback(data)
            return null
        }
        return AppLinks.appUrl(data)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pageFor(intent)?.let { loadInApp(it) }
    }

    // ---- lifecycle

    override fun onResume() {
        super.onResume()
        (application as NumbiteApp).setActivity(this)
        webView?.onResume()
        webSignIn.onActivityResumed()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onStop() {
        webSignIn.onActivityStopped()
        super.onStop()
    }

    /** Only the address is kept for a restart after the system ended the app (the page's own data is in its storage): a whole WebView state can be too big for a Bundle. */
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView?.url?.takeIf { BridgeHost.isOurs(it) }?.let { outState.putString(STATE_URL, it) }
    }

    override fun onDestroy() {
        files.cancel()
        permissions.release()
        ((application as NumbiteApp).purchases as? PurchaseUpdateSource)?.onPurchasesChanged = null
        (application as NumbiteApp).setActivity(null)
        webView?.let {
            root.removeView(it)
            it.destroy()
        }
        webView = null
        super.onDestroy()
    }

    private companion object {
        const val TAG = "NumbiteMain"
        const val STATE_URL = "url"
        const val SPLASH_MAX_MILLIS = 4_000L
    }
}
