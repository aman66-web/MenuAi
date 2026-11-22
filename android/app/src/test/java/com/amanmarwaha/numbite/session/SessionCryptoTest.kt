package com.amanmarwaha.numbite.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import javax.crypto.spec.SecretKeySpec

class SessionCryptoTest {
    private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
    private val other = SecretKeySpec(ByteArray(32) { (it + 1).toByte() }, "AES")
    private val crypto = SessionCrypto({ key })

    @Test fun roundTrip() {
        val text = """{"accessToken":"a.b.c","refreshToken":"x","user":{"email":"é@example.org"}}"""
        assertEquals(text, crypto.decrypt(crypto.encrypt(text)))
    }

    @Test fun theBiggestSessionRoundTrips() {
        val text = "x".repeat(16_384)
        assertEquals(text, crypto.decrypt(crypto.encrypt(text)))
    }

    @Test fun everySaveUsesAFreshNonce() {
        assertFalse(crypto.encrypt("same").contentEquals(crypto.encrypt("same")))
    }

    @Test fun theTextIsNotInTheBlob() {
        val blob = String(crypto.encrypt("secret-token-value"), Charsets.ISO_8859_1)
        assertFalse(blob.contains("secret-token-value"))
    }

    @Test fun anotherKeyCannotReadIt() {
        assertNull(SessionCrypto({ other }).decrypt(crypto.encrypt("x")))
    }

    @Test fun aChangedBlobIsRefused() {
        val blob = crypto.encrypt("hello")
        blob[blob.size - 1] = (blob[blob.size - 1].toInt() xor 1).toByte()
        assertNull(crypto.decrypt(blob))
        val front = crypto.encrypt("hello")
        front[0] = (front[0].toInt() xor 1).toByte()
        assertNull(crypto.decrypt(front))
    }

    @Test fun tooShortOrEmptyIsRefused() {
        assertNull(crypto.decrypt(ByteArray(0)))
        assertNull(crypto.decrypt(ByteArray(27)))
    }

    @Test fun inMemoryStoreForgetsOnNull() {
        val store = InMemorySessionStore()
        assertNull(store.load())
        store.save("a")
        assertEquals("a", store.load())
        store.save(null)
        assertNull(store.load())
    }
}
