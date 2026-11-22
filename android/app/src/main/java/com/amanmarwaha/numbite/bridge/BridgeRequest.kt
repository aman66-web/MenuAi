package com.amanmarwaha.numbite.bridge

import com.amanmarwaha.numbite.AppConfig
import com.amanmarwaha.numbite.reminders.ReminderPlanItem
import org.json.JSONObject
import java.util.Base64

/**
 * What the page asks the app to do (web/lib/mm/native.ts): `{ id, action, payload }`, as JSON text. Anything that isn't exactly one of these is ignored; a
 * message whose id is sound but which failed its checks is answered "unavailable", so the page never waits out its timeout (BridgeRequest in BridgeMessages.swift,
 * and docs/ANDROID_BRIDGE.md for the actions the Android app answers). Pure Kotlin (org.json), unit-tested without a phone.
 */
sealed interface BridgeRequest {
    val id: String

    data class Scan(override val id: String) : BridgeRequest
    data class Locate(override val id: String, val onlyIfAllowed: Boolean) : BridgeRequest
    data class Share(override val id: String, val content: ShareContent) : BridgeRequest
    data class AppleSignIn(override val id: String) : BridgeRequest
    data class WebAuth(override val id: String, val provider: String) : BridgeRequest
    data class NotificationPermission(override val id: String) : BridgeRequest
    data class NotificationStatus(override val id: String) : BridgeRequest
    data class SyncReminders(override val id: String, val plan: ReminderPlanItem.Parsed) : BridgeRequest
    data class OpenNotificationSettings(override val id: String) : BridgeRequest
    data class HideKeyboard(override val id: String) : BridgeRequest
    data class IapProducts(override val id: String, val productIds: List<String>) : BridgeRequest
    data class IapPurchase(override val id: String, val productId: String) : BridgeRequest
    data class IapEntitlements(override val id: String) : BridgeRequest
    data class IapRestore(override val id: String) : BridgeRequest
    data class IapManage(override val id: String) : BridgeRequest
    data class IapAcknowledge(override val id: String, val token: String) : BridgeRequest
    data class RequestReview(override val id: String) : BridgeRequest
    data class SessionLoad(override val id: String) : BridgeRequest
    /** `value` null forgets the session. */
    data class SessionSave(override val id: String, val value: String?) : BridgeRequest
    data class DeviceCheckToken(override val id: String) : BridgeRequest
    /** Android only: the one-way hash of this phone's Android ID, for the free week (DeviceIdentity.kt). */
    data class DeviceId(override val id: String) : BridgeRequest

    /** What became of a message. */
    sealed interface Parsed {
        data class Ok(val request: BridgeRequest) : Parsed
        /** Not a request, but its id is well formed: answer it "unavailable". */
        data class Rejected(val id: String) : Parsed
        /** Nothing to answer. */
        data object Ignored : Parsed
    }

    companion object {
        /** The longest session text the page may hand over (Supabase's tokens are about 2 KB together). */
        const val MAX_SESSION_LENGTH = 16_384
        /** The most product ids one `iap.products` request may list (there are two plans; anything longer is not a real request). */
        const val MAX_PRODUCT_IDS = 20
        /** A purchase token: Google's, opaque text of letters, digits, "." "_" "-" (docs/ANDROID_BRIDGE.md), up to 4,000 characters. */
        const val MAX_TOKEN_LENGTH = 4_000
        /**
         * The longest message taken at all: a share's picture (4 MB of PNG, a third more as base64) plus its text. Anything longer can't be a real request and is
         * not even parsed.
         */
        const val MAX_MESSAGE_LENGTH = 6_000_000

        private val tokenCharacters = Regex("^[A-Za-z0-9._-]{1,$MAX_TOKEN_LENGTH}$")
        private val idInPrefix = Regex("\"id\"\\s*:\\s*\"([A-Za-z0-9-]{1,64})\"")

        fun parse(message: String): Parsed {
            if (message.length > MAX_MESSAGE_LENGTH) return answerable(message.take(512))
            val json = try { JSONObject(message) } catch (_: Exception) { return Parsed.Ignored }
            val id = json.opt("id") as? String
            if (id == null || !isValidId(id)) return Parsed.Ignored
            val request = try { build(id, json) } catch (_: Exception) { null }
            return if (request != null) Parsed.Ok(request) else Parsed.Rejected(id)
        }

        /** The id of a message too big (or too broken) to parse, read from its first characters when it is well formed there ({id, action, payload} order). */
        private fun answerable(prefix: String): Parsed {
            val id = idInPrefix.find(prefix)?.groupValues?.get(1) ?: return Parsed.Ignored
            return if (isValidId(id)) Parsed.Rejected(id) else Parsed.Ignored
        }

        private fun build(id: String, message: JSONObject): BridgeRequest? {
            val action = message.opt("action") as? String ?: return null
            val payload = message.opt("payload") as? JSONObject ?: JSONObject()
            return when (action) {
                "scan" -> Scan(id)
                "locate" -> Locate(id, payload.opt("onlyIfAllowed") as? Boolean ?: false)
                "share" -> shareContent(payload)?.let { Share(id, it) }
                "appleSignIn" -> AppleSignIn(id)
                "webAuth" -> (payload.opt("provider") as? String)?.takeIf { it == "google" || it == "apple" }?.let { WebAuth(id, it) }
                "notifications.requestPermission" -> NotificationPermission(id)
                "notifications.status" -> NotificationStatus(id)
                // Not a list at all: ignored, so a garbled message can never cancel the reminders. An empty list is a real plan (no reminders).
                "notifications.syncReminders" -> ReminderPlanItem.parsePlan(payload.opt("items"))?.let { SyncReminders(id, it) }
                "notifications.openSettings" -> OpenNotificationSettings(id)
                "keyboard.hide" -> HideKeyboard(id)
                "iap.products" -> {
                    // A list of strings or nothing; ids that aren't ours are dropped (an empty list is a real question with an empty answer).
                    val list = payload.opt("ids") as? org.json.JSONArray ?: return null
                    if (list.length() > MAX_PRODUCT_IDS) return null
                    val ids = (0 until list.length()).map { list.opt(it) as? String ?: return null }
                    IapProducts(id, ids.filter { it in AppConfig.IAP_PRODUCT_IDS }.distinct())
                }
                // Never a plan that isn't ours.
                "iap.purchase" -> (payload.opt("id") as? String)?.takeIf { it in AppConfig.IAP_PRODUCT_IDS }?.let { IapPurchase(id, it) }
                "iap.entitlements" -> IapEntitlements(id)
                "iap.restore" -> IapRestore(id)
                "iap.manage" -> IapManage(id)
                "iap.acknowledge" -> (payload.opt("token") as? String)?.takeIf { tokenCharacters.matches(it) }?.let { IapAcknowledge(id, it) }
                "review.request" -> RequestReview(id)
                "session.load" -> SessionLoad(id)
                "session.save" -> {
                    // a string to keep, or null to forget; anything else (or too long) is ignored
                    val raw = payload.opt("value")
                    when {
                        raw == null || raw === JSONObject.NULL -> SessionSave(id, null)
                        raw is String && raw.isNotEmpty() && raw.length <= MAX_SESSION_LENGTH -> SessionSave(id, raw)
                        else -> null
                    }
                }
                "deviceCheck.token" -> DeviceCheckToken(id)
                "device.id" -> DeviceId(id)
                else -> null
            }
        }

        private fun shareContent(payload: JSONObject): ShareContent? {
            val text = payload.opt("text") as? String ?: return null
            if (text.isEmpty() || text.length > ShareContent.MAX_TEXT_LENGTH) return null
            val title = (payload.opt("title") as? String)?.take(200)
            val dataUrl = payload.opt("imageDataUrl")
            val image = when {
                dataUrl == null || dataUrl === JSONObject.NULL -> null
                dataUrl is String && dataUrl.startsWith(ShareContent.IMAGE_PREFIX) -> {
                    val bytes = try { Base64.getDecoder().decode(dataUrl.substring(ShareContent.IMAGE_PREFIX.length)) } catch (_: IllegalArgumentException) { return null }
                    if (bytes.size > ShareContent.MAX_IMAGE_BYTES) return null
                    bytes
                }
                else -> return null
            }
            return ShareContent(title, text, image)
        }

        /** The web app's request ids: letters, digits and "-", 1 to 64 long. */
        fun isValidId(id: String): Boolean = id.length in 1..64 && id.all { (it in 'A'..'Z') || (it in 'a'..'z') || (it in '0'..'9') || it == '-' }
    }
}

/** The answer, as plain JSON for window.__menumathReply(id, result). Only the fields the page reads (cleanNativeResult in web/lib/mm/native.ts). */
object BridgeReply {
    fun failure(reason: String): JSONObject = JSONObject().put("error", reason)
    fun done(): JSONObject = JSONObject().put("done", true)
    fun permission(value: String): JSONObject = JSONObject().put("permission", value)

    /** The JavaScript that hands the answer to the page. The script ends with `true` so evaluateJavascript has a value to hand back. */
    fun script(id: String, reply: JSONObject): String =
        "window.__menumathReply && window.__menumathReply(${JSONObject.quote(id)}, $reply); true;"
}
