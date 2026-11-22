package com.amanmarwaha.numbite.bridge

import com.amanmarwaha.numbite.reminders.ReminderPlanItem
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/** BridgeRequest in BridgeMessages.swift, and docs/ANDROID_BRIDGE.md for the actions the Android app answers. */
class BridgeRequestTest {
    private val premium = "com.amanmarwaha.numbite.premium"

    private fun message(id: String, action: String, payload: String = "{}") = """{"id":"$id","action":"$action","payload":$payload}"""
    private fun ok(raw: String): BridgeRequest = (BridgeRequest.parse(raw) as BridgeRequest.Parsed.Ok).request

    @Test fun simpleActions() {
        assertEquals(BridgeRequest.Scan("a1"), ok(message("a1", "scan")))
        assertEquals(BridgeRequest.AppleSignIn("a1"), ok(message("a1", "appleSignIn")))
        assertEquals(BridgeRequest.NotificationPermission("a1"), ok(message("a1", "notifications.requestPermission")))
        assertEquals(BridgeRequest.NotificationStatus("a1"), ok(message("a1", "notifications.status")))
        assertEquals(BridgeRequest.OpenNotificationSettings("a1"), ok(message("a1", "notifications.openSettings")))
        assertEquals(BridgeRequest.HideKeyboard("a1"), ok(message("a1", "keyboard.hide")))
        assertEquals(BridgeRequest.RequestReview("a1"), ok(message("a1", "review.request")))
        assertEquals(BridgeRequest.DeviceCheckToken("a1"), ok(message("a1", "deviceCheck.token")))
        assertEquals(BridgeRequest.SessionLoad("a1"), ok(message("a1", "session.load")))
        assertEquals(BridgeRequest.IapEntitlements("a1"), ok(message("a1", "iap.entitlements")))
        assertEquals(BridgeRequest.IapRestore("a1"), ok(message("a1", "iap.restore")))
        assertEquals(BridgeRequest.IapManage("a1"), ok(message("a1", "iap.manage")))
    }

    @Test fun theMessageNeedsNoPayload() {
        assertEquals(BridgeRequest.Scan("x"), ok("""{"id":"x","action":"scan"}"""))
        assertEquals(BridgeRequest.Scan("x"), ok("""{"id":"x","action":"scan","payload":null}"""))
        assertEquals(BridgeRequest.Scan("x"), ok("""{"id":"x","action":"scan","payload":"nonsense"}"""))
    }

    @Test fun idsAreChecked() {
        for (bad in listOf("", "a b", "a_b", "é", "a.b", "a".repeat(65))) {
            val raw = JSONObject().put("id", bad).put("action", "scan").toString()
            assertEquals("id '$bad'", BridgeRequest.Parsed.Ignored, BridgeRequest.parse(raw))
        }
        assertTrue(BridgeRequest.parse(message("a".repeat(64), "scan")) is BridgeRequest.Parsed.Ok)
        assertTrue(BridgeRequest.parse(message("lq3k-0-A", "scan")) is BridgeRequest.Parsed.Ok)
        assertEquals(BridgeRequest.Parsed.Ignored, BridgeRequest.parse("""{"id":5,"action":"scan"}"""))
        assertEquals(BridgeRequest.Parsed.Ignored, BridgeRequest.parse("""{"action":"scan"}"""))
    }

    @Test fun notJsonIsIgnored() {
        assertEquals(BridgeRequest.Parsed.Ignored, BridgeRequest.parse(""))
        assertEquals(BridgeRequest.Parsed.Ignored, BridgeRequest.parse("hello"))
        assertEquals(BridgeRequest.Parsed.Ignored, BridgeRequest.parse("[1,2]"))
    }

    @Test fun anUnknownActionWithAGoodIdIsStillAnswered() {
        assertEquals(BridgeRequest.Parsed.Rejected("a1"), BridgeRequest.parse(message("a1", "format.disk")))
        assertEquals(BridgeRequest.Parsed.Rejected("a1"), BridgeRequest.parse("""{"id":"a1","action":5}"""))
        assertEquals(BridgeRequest.Parsed.Rejected("a1"), BridgeRequest.parse("""{"id":"a1"}"""))
    }

    @Test fun locate() {
        assertEquals(BridgeRequest.Locate("a", true), ok(message("a", "locate", """{"onlyIfAllowed":true}""")))
        assertEquals(BridgeRequest.Locate("a", false), ok(message("a", "locate", """{"onlyIfAllowed":false}""")))
        assertEquals(BridgeRequest.Locate("a", false), ok(message("a", "locate", """{"onlyIfAllowed":"yes"}""")))
        assertEquals(BridgeRequest.Locate("a", false), ok(message("a", "locate")))
    }

    @Test fun webAuthOnlyGoogleOrApple() {
        assertEquals(BridgeRequest.WebAuth("a", "google"), ok(message("a", "webAuth", """{"provider":"google"}""")))
        assertEquals(BridgeRequest.WebAuth("a", "apple"), ok(message("a", "webAuth", """{"provider":"apple"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "webAuth", """{"provider":"facebook"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "webAuth")))
    }

    @Test fun share() {
        val request = ok(message("a", "share", """{"title":"Shopping list","text":"milk\neggs"}""")) as BridgeRequest.Share
        assertEquals(ShareContent("Shopping list", "milk\neggs", null), request.content)
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"title":"t"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"text":""}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"text":"${"x".repeat(ShareContent.MAX_TEXT_LENGTH + 1)}"}""")))
        assertNotNull(ok(message("a", "share", """{"text":"${"x".repeat(ShareContent.MAX_TEXT_LENGTH)}"}""")))
    }

    @Test fun shareTitleIsCutTo200() {
        val request = ok(message("a", "share", """{"title":"${"t".repeat(300)}","text":"x"}""")) as BridgeRequest.Share
        assertEquals(200, request.content.title!!.length)
    }

    @Test fun sharePicture() {
        val png = byteArrayOf(1, 2, 3, 4, 5)
        val url = ShareContent.IMAGE_PREFIX + Base64.getEncoder().encodeToString(png)
        val request = ok(message("a", "share", """{"text":"x","imageDataUrl":"$url"}""")) as BridgeRequest.Share
        assertTrue(request.content.image!!.contentEquals(png))
        // not a PNG data address, not base64, or too big
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"text":"x","imageDataUrl":"data:image/jpeg;base64,AAAA"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"text":"x","imageDataUrl":"data:image/png;base64,!!!!"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"text":"x","imageDataUrl":5}""")))
        val big = ShareContent.IMAGE_PREFIX + Base64.getEncoder().encodeToString(ByteArray(ShareContent.MAX_IMAGE_BYTES + 1))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "share", """{"text":"x","imageDataUrl":"$big"}""")))
        val fits = ShareContent.IMAGE_PREFIX + Base64.getEncoder().encodeToString(ByteArray(ShareContent.MAX_IMAGE_BYTES))
        assertTrue(BridgeRequest.parse(message("a", "share", """{"text":"x","imageDataUrl":"$fits"}""")) is BridgeRequest.Parsed.Ok)
    }

    @Test fun aMessageTooBigIsNeverParsedButStillAnswered() {
        val huge = message("big-1", "share", """{"text":"${"x".repeat(BridgeRequest.MAX_MESSAGE_LENGTH)}"}""")
        assertEquals(BridgeRequest.Parsed.Rejected("big-1"), BridgeRequest.parse(huge))
        assertEquals(BridgeRequest.Parsed.Ignored, BridgeRequest.parse("x".repeat(BridgeRequest.MAX_MESSAGE_LENGTH + 1)))
    }

    @Test fun session() {
        assertEquals(BridgeRequest.SessionSave("a", "token-text"), ok(message("a", "session.save", """{"value":"token-text"}""")))
        assertEquals(BridgeRequest.SessionSave("a", null), ok(message("a", "session.save", """{"value":null}""")))
        assertEquals(BridgeRequest.SessionSave("a", null), ok(message("a", "session.save")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "session.save", """{"value":""}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "session.save", """{"value":5}""")))
        val tooLong = "x".repeat(BridgeRequest.MAX_SESSION_LENGTH + 1)
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "session.save", """{"value":"$tooLong"}""")))
        val most = "x".repeat(BridgeRequest.MAX_SESSION_LENGTH)
        assertEquals(BridgeRequest.SessionSave("a", most), ok(message("a", "session.save", """{"value":"$most"}""")))
    }

    @Test fun iapProductsKeepOnlyOurPlans() {
        val annual = "$premium:annual"
        val monthly = "$premium:monthly"
        val request = ok(message("a", "iap.products", """{"ids":["$annual","evil.product","$monthly","$annual"]}""")) as BridgeRequest.IapProducts
        assertEquals(listOf(annual, monthly), request.productIds)
        assertEquals(BridgeRequest.IapProducts("a", emptyList()), ok(message("a", "iap.products", """{"ids":[]}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.products")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.products", """{"ids":[1,2]}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.products", """{"ids":${(1..21).map { "\"p$it\"" }}}""")))
    }

    @Test fun iapPurchaseOnlyOurPlans() {
        assertEquals(BridgeRequest.IapPurchase("a", "$premium:annual"), ok(message("a", "iap.purchase", """{"id":"$premium:annual"}""")))
        assertEquals(BridgeRequest.IapPurchase("a", "$premium:monthly"), ok(message("a", "iap.purchase", """{"id":"$premium:monthly"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.purchase", """{"id":"$premium"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.purchase", """{"id":"com.amanmarwaha.numbite.pro.annual"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.purchase")))
    }

    @Test fun iapAcknowledgeNeedsAPlausibleToken() {
        assertEquals(BridgeRequest.IapAcknowledge("a", "abc.DEF_123-xyz"), ok(message("a", "iap.acknowledge", """{"token":"abc.DEF_123-xyz"}""")))
        assertTrue(BridgeRequest.parse(message("a", "iap.acknowledge", """{"token":"${"t".repeat(4000)}"}""")) is BridgeRequest.Parsed.Ok)
        for (bad in listOf("", "has space", "semi;colon", "quote\\\"", "é", "t".repeat(4001))) {
            assertEquals("token '${bad.take(20)}'", BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.acknowledge", JSONObject().put("token", bad).toString())))
        }
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "iap.acknowledge")))
    }

    @Test fun syncRemindersTakesAListOrNothing() {
        val plan = ok(message("a", "notifications.syncReminders", """{"items":[{"id":"r1","title":"Lunch","hour":12,"minute":30}]}""")) as BridgeRequest.SyncReminders
        assertEquals(1, plan.plan.items.size)
        assertEquals(0, plan.plan.ignored)
        // an empty list is a real plan: it cancels everything
        assertEquals(0, (ok(message("a", "notifications.syncReminders", """{"items":[]}""")) as BridgeRequest.SyncReminders).plan.items.size)
        // not a list: never wipes the reminders
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "notifications.syncReminders", """{"items":"none"}""")))
        assertEquals(BridgeRequest.Parsed.Rejected("a"), BridgeRequest.parse(message("a", "notifications.syncReminders")))
        // a bad item is dropped, the rest is kept
        val mixed = ok(message("a", "notifications.syncReminders", """{"items":[{"id":"ok","title":"A","hour":1,"minute":2},{"id":"bad id","title":"B","hour":1,"minute":2}]}""")) as BridgeRequest.SyncReminders
        assertEquals(listOf("ok"), mixed.plan.items.map(ReminderPlanItem::id))
        assertEquals(1, mixed.plan.ignored)
    }

    @Test fun replyScriptEscapesTheIdAndTheReply() {
        val script = BridgeReply.script("a-1", JSONObject().put("session", "quote\" slash\\ line\n </script>  "))
        assertTrue(script.startsWith("window.__menumathReply && window.__menumathReply(\"a-1\", {"))
        assertTrue(script.endsWith("; true;"))
        assertTrue(!script.contains("\n"))
        assertEquals("""{"error":"unavailable"}""", BridgeReply.failure("unavailable").toString())
    }
}
