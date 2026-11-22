package com.amanmarwaha.numbite.web

import com.amanmarwaha.numbite.AppConfig
import java.net.URI
import java.net.URLDecoder

/**
 * Links that open the app on a page: a shopping list a friend shared, a friend's invite (SharedListLink.swift and FriendInviteLink.swift on the iPhone) and the
 * sign-in tab coming back. Pure Kotlin on java.net.URI so it is unit-tested without a phone. The part after "#" is the code; the app reads it on the phone and
 * never sends it anywhere (web/lib/mm/shareList.ts, web/lib/community/friendCode.ts have the formats).
 */
object AppLinks {
    /** Where the web app reads a shared list (SHARED_APP_PATH in web/lib/mm/shareList.ts) and where it takes a friend's code (web/app/app/community/friends). */
    const val LIST_PATH = "/app/groceries/list/shared"
    const val FRIEND_PATH = "/app/community/friends"
    /** The longest list code the web app accepts (MAX_PAYLOAD_LENGTH in web/lib/mm/shareList.ts). */
    const val MAX_LIST_CODE_LENGTH = 6000
    private const val FRIEND_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    private const val FRIEND_CODE_LENGTH = 8
    private const val LIST_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    private const val FRIEND_FRAGMENT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-"

    /** The address inside the packed web app for a shopping list link or a friend's invite, or null when the link is neither. */
    fun appUrl(link: String): String? {
        listCode(link)?.let { return "${AppConfig.APP_ORIGIN}$LIST_PATH#$it" }
        friendCode(link)?.let { return "${AppConfig.APP_ORIGIN}$FRIEND_PATH#$it" }
        return null
    }

    /** The list code in https://numbite.com/l#<code> or numbite://l#<code>; null for any other address or a code with other characters in it. */
    fun listCode(link: String): String? {
        val parts = parse(link) ?: return null
        val code = parts.fragment ?: return null
        if (code.length !in 8..MAX_LIST_CODE_LENGTH || !code.all { it in LIST_CHARACTERS }) return null
        return if (isOurs(parts, "l")) code else null
    }

    /** The friend code (upper case, no hyphen) in https://numbite.com/f#<code> or numbite://f#<code>; null for any other address or a fragment that isn't a friend code. */
    fun friendCode(link: String): String? {
        val parts = parse(link) ?: return null
        val fragment = parts.fragment ?: return null
        if (!fragment.all { it in FRIEND_FRAGMENT_CHARACTERS }) return null
        val code = normalisedFriendCode(fragment) ?: return null
        return if (isOurs(parts, "f")) code else null
    }

    /** A friend code the way the web app tidies one (upper case, a hyphen allowed in the middle): null unless it is exactly 8 characters from the alphabet. */
    fun normalisedFriendCode(text: String): String? {
        val tidy = text.uppercase().filter { it != '-' }
        return if (tidy.length == FRIEND_CODE_LENGTH && tidy.all { it in FRIEND_ALPHABET }) tidy else null
    }

    /** True for numbite://auth... (the sign-in tab coming back): not a page to open. */
    fun isAuthCallback(link: String): Boolean {
        val parts = parse(link) ?: return false
        return parts.scheme == AppConfig.AUTH_CALLBACK_SCHEME && parts.host == "auth"
    }

    /** `numbite://l#…` (host "l") or `numbite:///l#…` (path "/l") on our scheme; `https://numbite.com/l#…` on our website (the path with or without a slash). */
    private fun isOurs(parts: Parts, letter: String): Boolean = when (parts.scheme) {
        "https" -> parts.host in AppConfig.WEBSITE_HOSTS && (parts.path == "/$letter" || parts.path == "/$letter/")
        AppConfig.AUTH_CALLBACK_SCHEME -> (parts.host == letter && (parts.path.isEmpty() || parts.path == "/")) || (parts.host.isEmpty() && parts.path == "/$letter")
        else -> false
    }

    private data class Parts(val scheme: String, val host: String, val path: String, val fragment: String?)

    private fun parse(link: String): Parts? = try {
        val uri = URI(link.trim())
        val scheme = uri.scheme?.lowercase() ?: return null
        // java.net.URI keeps "numbite://l#x" as host "l" and "numbite:///l#x" as an empty authority with the path "/l"
        Parts(scheme, (uri.host ?: "").lowercase(), uri.rawPath ?: "", uri.rawFragment)
    } catch (_: Exception) {
        null
    }
}

/** What the sign-in tab ended with: the one-time code from numbite://auth?code=... and the PKCE verifier this app made for it, or no answer. */
sealed interface WebSignInOutcome {
    data class Code(val authCode: String, val verifier: String) : WebSignInOutcome
    data object Cancelled : WebSignInOutcome
    data object Unavailable : WebSignInOutcome

    companion object {
        /** Reads where the tab finished (`numbite://auth?code=...` or `numbite://auth?error=...`), like WebSignInOutcome.parse on the iPhone. */
        fun parse(callback: String?, verifier: String): WebSignInOutcome {
            if (callback == null) return Unavailable
            val uri = try { URI(callback.trim()) } catch (_: Exception) { return Unavailable }
            if (uri.scheme?.lowercase() != AppConfig.AUTH_CALLBACK_SCHEME) return Unavailable
            val items = (uri.rawQuery ?: "").split('&').filter { it.isNotEmpty() }.associate { pair ->
                val key = pair.substringBefore('=')
                val value = pair.substringAfter('=', "")
                runCatching { URLDecoder.decode(key, "UTF-8") }.getOrDefault(key) to runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)
            }
            if (items["error"] == "cancelled") return Cancelled
            val code = items["code"] ?: return Unavailable
            return if (isPlausibleCode(code)) Code(code, verifier) else Unavailable
        }

        /** Our sealed one-time code is long URL-safe text; anything else isn't ours. */
        fun isPlausibleCode(code: String): Boolean =
            code.length in 40..8192 && code.all { (it in 'A'..'Z') || (it in 'a'..'z') || (it in '0'..'9') || it == '-' || it == '_' }
    }
}
