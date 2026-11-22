package com.amanmarwaha.numbite.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** The small secrets sign-in needs (AuthSecrets.swift; docs/ACCOUNTS_SYNC.md): a random string, and its SHA-256 fingerprint (PKCE, RFC 7636 "S256"). */
object Pkce {
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    /** `byteCount` random bytes as URL-safe text without padding: 48 bytes make the 64-character verifier. */
    fun randomUrlSafe(byteCount: Int, random: SecureRandom = SecureRandom()): String {
        val bytes = ByteArray(byteCount)
        random.nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    /** base64url(SHA-256(verifier)): the page keeps the verifier; only this fingerprint goes in the sign-in address. */
    fun challengeFor(verifier: String): String = encoder.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.UTF_8)))
}
