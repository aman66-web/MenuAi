package com.amanmarwaha.numbite.session

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM for the account's sign-in text: a fresh 12-byte nonce for every save (made by the cipher, as the Keystore insists), written in front of the ciphertext (which ends with the 16-byte tag), with a
 * fixed label as associated data so a blob from some other use can't be mistaken for a session. The key is handed in: the phone's Android Keystore key in the app
 * ([KeystoreSessionStore]), a plain key in the unit tests. Nothing here reads the tokens: it holds the page's text as given.
 */
class SessionCrypto(private val key: () -> SecretKey) {
    fun encrypt(plain: String): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // the cipher makes the nonce itself: an Android Keystore key refuses one handed in (it would let a caller reuse one)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val nonce = cipher.iv
        check(nonce.size == NONCE_BYTES) { "unexpected nonce length" }
        cipher.updateAAD(LABEL)
        return nonce + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    }

    /** The text, or null when the bytes are not something this key sealed (damaged, another key, too short). */
    fun decrypt(blob: ByteArray): String? {
        if (blob.size < NONCE_BYTES + TAG_BITS / 8) return null
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, blob.copyOfRange(0, NONCE_BYTES)))
            cipher.updateAAD(LABEL)
            String(cipher.doFinal(blob, NONCE_BYTES, blob.size - NONCE_BYTES), Charsets.UTF_8)
        } catch (_: GeneralSecurityException) {
            null
        }
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val NONCE_BYTES = 12
        const val TAG_BITS = 128
        val LABEL = "numbite-session-v1".toByteArray(Charsets.UTF_8)
    }
}
