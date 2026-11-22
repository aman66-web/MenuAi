package com.amanmarwaha.numbite.bridge

import com.amanmarwaha.numbite.auth.WebSigningIn
import com.amanmarwaha.numbite.billing.PurchaseService
import com.amanmarwaha.numbite.reminders.ReminderPlanItem
import com.amanmarwaha.numbite.session.InMemorySessionStore
import com.amanmarwaha.numbite.web.WebSignInOutcome
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeBridgeTest {
    private class FakePurchases : PurchaseService {
        val calls = mutableListOf<String>()
        override suspend fun products(ids: List<String>) = JSONObject().put("products", org.json.JSONArray()).also { calls += "products:${ids.joinToString(",")}" }
        override suspend fun purchase(productId: String) = JSONObject().put("pending", true).also { calls += "purchase:$productId" }
        override suspend fun entitlements() = JSONObject().put("purchases", org.json.JSONArray()).also { calls += "entitlements" }
        override suspend fun restore() = JSONObject().put("purchases", org.json.JSONArray()).also { calls += "restore" }
        override suspend fun manage() = JSONObject().put("done", true).also { calls += "manage" }
        override suspend fun acknowledge(token: String) = JSONObject().put("done", true).also { calls += "acknowledge:$token" }
    }

    private class ThrowingPurchases : PurchaseService {
        override suspend fun products(ids: List<String>): JSONObject = error("boom")
        override suspend fun purchase(productId: String): JSONObject = error("boom")
        override suspend fun entitlements(): JSONObject = error("boom")
        override suspend fun restore(): JSONObject = error("boom")
        override suspend fun manage(): JSONObject = error("boom")
        override suspend fun acknowledge(token: String): JSONObject = error("boom")
    }

    private val replies = mutableListOf<String>()
    private val reminders = mutableListOf<ReminderPlanItem.Parsed>()
    private var keyboardHidden = 0
    private var reviewShown = true
    private var reviewAsked = 0
    private var scan: ScanOutcome = ScanOutcome.Code("5000157024671")
    private var location: LocationOutcome = LocationOutcome.Found(51.5, -0.12)
    private var shared: ShareContent? = null
    private var signIn: WebSignInOutcome = WebSignInOutcome.Cancelled
    private val session = InMemorySessionStore()

    private fun bridge(purchases: PurchaseService = FakePurchases()) = NativeBridge(
        scope = CoroutineScope(Dispatchers.Unconfined),
        scanner = object : BarcodeScanning { override suspend fun scan() = scan },
        location = object : LocationProviding { override suspend fun currentLocation(onlyIfAllowed: Boolean) = location },
        sharer = object : Sharing { override suspend fun share(content: ShareContent): Boolean { shared = content; return true } },
        webSignIn = object : WebSigningIn { override suspend fun signIn(provider: String) = signIn },
        notifications = object : NotificationScheduling {
            override suspend fun status() = "granted"
            override suspend fun requestPermission() = "denied"
            override suspend fun replaceReminders(plan: ReminderPlanItem.Parsed) { reminders += plan }
            override fun openSettings() = Unit
        },
        purchases = purchases,
        reviews = object : ReviewRequesting { override suspend fun requestReview(): Boolean { reviewAsked++; return reviewShown } },
        session = session,
        hideKeyboard = { keyboardHidden++ },
        runInPage = { replies += it },
    )

    private fun send(bridge: NativeBridge, id: String, action: String, payload: String = "{}") {
        bridge.onMessage("""{"id":"$id","action":"$action","payload":$payload}""")
    }

    /** The reply sent for `id`, as JSON. The session work runs on another thread, so wait for it. */
    private fun replyFor(id: String): JSONObject {
        val deadline = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < deadline) {
            replies.toList().firstOrNull { it.contains("(\"$id\",") }?.let { script ->
                return JSONObject(script.substringAfter("(\"$id\", ").substringBeforeLast("); true;"))
            }
            Thread.sleep(5)
        }
        error("no reply for $id; got $replies")
    }

    @Test fun scanAnswersWithTheDigitsOrWhyNot() {
        val b = bridge()
        send(b, "sc1", "scan")
        assertEquals("5000157024671", replyFor("sc1").getString("code"))
        scan = ScanOutcome.Cancelled
        send(b, "sc2", "scan")
        assertEquals("cancelled", replyFor("sc2").getString("error"))
        scan = ScanOutcome.Denied
        send(b, "sc3", "scan")
        assertEquals("denied", replyFor("sc3").getString("error"))
        scan = ScanOutcome.Unavailable
        send(b, "sc4", "scan")
        assertEquals("unavailable", replyFor("sc4").getString("error"))
    }

    @Test fun appleReviewAndDeviceCheckAreUnavailableButAnswered() {
        val b = bridge()
        for ((i, action) in listOf("appleSignIn", "deviceCheck.token").withIndex()) {
            send(b, "u$i", action)
            assertEquals("""{"error":"unavailable"}""", replyFor("u$i").toString())
        }
    }

    @Test fun reviewIsDoneWhenGoogleRanItAndUnavailableWhenItCouldNot() {
        val b = bridge()
        send(b, "rv1", "review.request")
        assertTrue(replyFor("rv1").getBoolean("done"))
        assertEquals(1, reviewAsked)
        reviewShown = false
        send(b, "rv2", "review.request")
        assertEquals("unavailable", replyFor("rv2").getString("error"))
    }

    @Test fun anUnknownActionIsAnsweredUnavailable() {
        val b = bridge()
        send(b, "x1", "launch.rockets")
        assertEquals("unavailable", replyFor("x1").getString("error"))
    }

    @Test fun garbageIsNotAnswered() {
        val b = bridge()
        b.onMessage("not json")
        b.onMessage("""{"id":"bad id!","action":"scan"}""")
        b.onMessage("")
        assertTrue(replies.isEmpty())
    }

    @Test fun locateAnswersWithThePositionOrWhyNot() {
        val b = bridge()
        send(b, "l1", "locate")
        assertEquals(51.5, replyFor("l1").getDouble("lat"), 0.0)
        assertEquals(-0.12, replyFor("l1").getDouble("lng"), 0.0)
        location = LocationOutcome.Denied
        send(b, "l2", "locate")
        assertEquals("denied", replyFor("l2").getString("error"))
        location = LocationOutcome.Unavailable
        send(b, "l3", "locate")
        assertEquals("unavailable", replyFor("l3").getString("error"))
    }

    @Test fun shareHandsTheContentOver() {
        val b = bridge()
        send(b, "s1", "share", """{"title":"List","text":"milk"}""")
        assertEquals(ShareContent("List", "milk", null), shared)
        assertTrue(replyFor("s1").getBoolean("done"))
    }

    @Test fun webAuthReturnsTheCodeAndVerifierOrWhyNot() {
        val b = bridge()
        signIn = WebSignInOutcome.Code("c".repeat(50), "v".repeat(64))
        send(b, "w1", "webAuth", """{"provider":"google"}""")
        assertEquals("c".repeat(50), replyFor("w1").getString("authCode"))
        assertEquals("v".repeat(64), replyFor("w1").getString("verifier"))
        signIn = WebSignInOutcome.Cancelled
        send(b, "w2", "webAuth", """{"provider":"apple"}""")
        assertEquals("cancelled", replyFor("w2").getString("error"))
        signIn = WebSignInOutcome.Unavailable
        send(b, "w3", "webAuth", """{"provider":"google"}""")
        assertEquals("unavailable", replyFor("w3").getString("error"))
    }

    @Test fun notificationsAnswerWithAPermissionWordAndTakeThePlan() {
        val b = bridge()
        send(b, "n1", "notifications.status")
        assertEquals("granted", replyFor("n1").getString("permission"))
        send(b, "n2", "notifications.requestPermission")
        assertEquals("denied", replyFor("n2").getString("permission"))
        send(b, "n3", "notifications.syncReminders", """{"items":[{"id":"r","title":"Lunch","hour":12,"minute":0}]}""")
        assertTrue(replyFor("n3").getBoolean("done"))
        assertEquals(1, reminders.single().items.size)
        send(b, "n4", "notifications.openSettings")
        assertTrue(replyFor("n4").getBoolean("done"))
    }

    @Test fun aGarbledPlanNeverReachesTheScheduler() {
        val b = bridge()
        send(b, "n5", "notifications.syncReminders", """{"items":"nope"}""")
        assertEquals("unavailable", replyFor("n5").getString("error"))
        assertTrue(reminders.isEmpty())
    }

    @Test fun keyboardHide() {
        val b = bridge()
        send(b, "k1", "keyboard.hide")
        assertTrue(replyFor("k1").getBoolean("done"))
        assertEquals(1, keyboardHidden)
    }

    @Test fun sessionSaveThenLoadThenForget() {
        val b = bridge()
        send(b, "ss1", "session.load")
        assertTrue(replyFor("ss1").getBoolean("done"))
        assertFalse(replyFor("ss1").has("session"))
        send(b, "ss2", "session.save", """{"value":"{\"token\":\"abc\"}"}""")
        send(b, "ss3", "session.load")
        assertEquals("""{"token":"abc"}""", replyFor("ss3").getString("session"))
        send(b, "ss4", "session.save", """{"value":null}""")
        send(b, "ss5", "session.load")
        assertFalse(replyFor("ss5").has("session"))
    }

    @Test fun iapActionsGoToThePurchaseService() {
        val fake = FakePurchases()
        val b = bridge(fake)
        val annual = "com.amanmarwaha.numbite.premium:annual"
        send(b, "p1", "iap.products", """{"ids":["$annual","stranger"]}""")
        send(b, "p2", "iap.purchase", """{"id":"$annual"}""")
        send(b, "p3", "iap.entitlements")
        send(b, "p4", "iap.restore")
        send(b, "p5", "iap.manage")
        send(b, "p6", "iap.acknowledge", """{"token":"tok-1"}""")
        for (i in 1..6) replyFor("p$i")
        assertEquals(listOf("products:$annual", "purchase:$annual", "entitlements", "restore", "manage", "acknowledge:tok-1"), fake.calls)
        assertTrue(replyFor("p2").getBoolean("pending"))
    }

    @Test fun aStrangeProductNeverReachesThePurchaseService() {
        val fake = FakePurchases()
        val b = bridge(fake)
        send(b, "q1", "iap.purchase", """{"id":"com.amanmarwaha.numbite.pro.annual"}""")
        assertEquals("unavailable", replyFor("q1").getString("error"))
        assertTrue(fake.calls.isEmpty())
    }

    @Test fun aFailingPurchaseServiceIsUnavailableNotACrash() {
        val b = bridge(ThrowingPurchases())
        send(b, "t1", "iap.entitlements")
        assertEquals("unavailable", replyFor("t1").getString("error"))
        send(b, "t2", "iap.purchase", """{"id":"com.amanmarwaha.numbite.premium:monthly"}""")
        assertEquals("unavailable", replyFor("t2").getString("error"))
    }
}
