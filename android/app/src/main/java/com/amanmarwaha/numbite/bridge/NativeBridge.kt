package com.amanmarwaha.numbite.bridge

import android.util.Log
import com.amanmarwaha.numbite.auth.WebSigningIn
import com.amanmarwaha.numbite.billing.PurchaseService
import com.amanmarwaha.numbite.session.SessionStoring
import com.amanmarwaha.numbite.web.WebSignInOutcome
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.coroutines.cancellation.CancellationException

/**
 * Answers the page's requests ([BridgeRequest]) with Google's barcode scanner, Android's own location, share sheet, sign-in tab, reminder notifications, keyboard, the Keystore-sealed
 * session, Google Play's review pop-up and Google Play Billing, and hands the result back with window.__menumathReply (web/lib/mm/native.ts; NativeBridge.swift on the iPhone;
 * docs/ANDROID_BRIDGE.md is the contract). It never crashes and never throws: whatever goes wrong is `{"error": "unavailable"}`.
 *
 * Who may talk to it is decided one layer up, in [com.amanmarwaha.numbite.web.BridgeHost]: only the app's own page (its main frame on https://appassets.androidplatform.net).
 */
class NativeBridge(
    private val scope: CoroutineScope,
    private val scanner: BarcodeScanning,
    private val location: LocationProviding,
    private val sharer: Sharing,
    private val webSignIn: WebSigningIn,
    private val notifications: NotificationScheduling,
    private val purchases: PurchaseService,
    private val reviews: ReviewRequesting,
    private val session: SessionStoring,
    /** Puts the keyboard away (runs on the main thread). */
    private val hideKeyboard: () -> Unit,
    /** Runs a script in the page (on the main thread). */
    private val runInPage: (String) -> Unit,
) {
    /** The session file is read and written one call at a time, in the order the page asked (a save followed by a load must see the save). */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val sessionDispatcher = Dispatchers.IO.limitedParallelism(1)

    /** One message from the page, already known to come from the app's own page. */
    fun onMessage(message: String) {
        when (val parsed = BridgeRequest.parse(message)) {
            is BridgeRequest.Parsed.Ok -> scope.launch {
                val reply = handle(parsed.request)
                runInPage(BridgeReply.script(parsed.request.id, reply))
            }
            // it failed its checks, but its id is sound: answer it, so the page doesn't wait out its timeout
            is BridgeRequest.Parsed.Rejected -> runInPage(BridgeReply.script(parsed.id, BridgeReply.failure("unavailable")))
            BridgeRequest.Parsed.Ignored -> Unit
        }
    }

    suspend fun handle(request: BridgeRequest): JSONObject = try {
        dispatch(request)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.w(TAG, "A request failed", e)
        BridgeReply.failure("unavailable")
    }

    private suspend fun dispatch(request: BridgeRequest): JSONObject = when (request) {
        is BridgeRequest.Scan -> when (val outcome = scanner.scan()) {
            is ScanOutcome.Code -> JSONObject().put("code", outcome.digits)
            ScanOutcome.Cancelled -> BridgeReply.failure("cancelled")
            ScanOutcome.Denied -> BridgeReply.failure("denied")
            ScanOutcome.Unavailable -> BridgeReply.failure("unavailable")
        }
        is BridgeRequest.AppleSignIn -> BridgeReply.failure("unavailable")
        // the page asks only after someone rated the app 5; Google decides whether its pop-up appears, so the flow finishing is "done"
        is BridgeRequest.RequestReview -> if (reviews.requestReview()) BridgeReply.done() else BridgeReply.failure("unavailable")
        // the free week is then decided by the account's email hash alone (docs/ANDROID_BRIDGE.md)
        is BridgeRequest.DeviceCheckToken -> BridgeReply.failure("unavailable")
        is BridgeRequest.Locate -> when (val found = location.currentLocation(request.onlyIfAllowed)) {
            is LocationOutcome.Found -> JSONObject().put("lat", found.latitude).put("lng", found.longitude)
            LocationOutcome.Denied -> BridgeReply.failure("denied")
            LocationOutcome.Unavailable -> BridgeReply.failure("unavailable")
        }
        is BridgeRequest.Share -> if (sharer.share(request.content)) BridgeReply.done() else BridgeReply.failure("cancelled")
        is BridgeRequest.WebAuth -> when (val outcome = webSignIn.signIn(request.provider)) {
            is WebSignInOutcome.Code -> JSONObject().put("authCode", outcome.authCode).put("verifier", outcome.verifier)
            WebSignInOutcome.Cancelled -> BridgeReply.failure("cancelled")
            WebSignInOutcome.Unavailable -> BridgeReply.failure("unavailable")
        }
        is BridgeRequest.NotificationPermission -> BridgeReply.permission(notifications.requestPermission())
        is BridgeRequest.NotificationStatus -> BridgeReply.permission(notifications.status())
        is BridgeRequest.SyncReminders -> {
            notifications.replaceReminders(request.plan)
            BridgeReply.done()
        }
        is BridgeRequest.OpenNotificationSettings -> {
            notifications.openSettings()
            BridgeReply.done()
        }
        is BridgeRequest.HideKeyboard -> {
            hideKeyboard()
            BridgeReply.done()
        }
        is BridgeRequest.IapProducts -> purchases.products(request.productIds)
        is BridgeRequest.IapPurchase -> purchases.purchase(request.productId)
        is BridgeRequest.IapEntitlements -> purchases.entitlements()
        is BridgeRequest.IapRestore -> purchases.restore()
        is BridgeRequest.IapManage -> purchases.manage()
        is BridgeRequest.IapAcknowledge -> purchases.acknowledge(request.token)
        is BridgeRequest.SessionLoad -> withContext(sessionDispatcher) {
            BridgeReply.done().also { reply -> session.load()?.let { reply.put("session", it) } }
        }
        is BridgeRequest.SessionSave -> withContext(sessionDispatcher) {
            session.save(request.value)
            BridgeReply.done()
        }
    }

    private companion object { const val TAG = "NumbiteBridge" }
}
