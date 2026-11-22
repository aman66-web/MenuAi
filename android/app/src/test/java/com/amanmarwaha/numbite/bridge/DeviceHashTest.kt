package com.amanmarwaha.numbite.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

/** The one-way identity the free week uses (DeviceIdentity.kt): what leaves the phone is a SHA-256, never the Android ID. */
class DeviceHashTest {
    @Test fun itIsTheSha256OfThePrefixAndTheId() {
        val expected = MessageDigest.getInstance("SHA-256").digest("numbite-device:9774d56d682e549c".toByteArray()).joinToString("") { "%02x".format(it) }
        assertEquals(expected, DeviceHash.of("9774d56d682e549c"))
        // a known value, so the format can't drift from what the server accepts (64 lower-case hex characters)
        assertEquals(64, DeviceHash.of("9774d56d682e549c")!!.length)
        assertTrue(DeviceHash.of("9774d56d682e549c")!!.matches(Regex("^[0-9a-f]{64}$")))
    }

    @Test fun theSameIdAlwaysGivesTheSameHashAndAnotherIdAnotherOne() {
        assertEquals(DeviceHash.of("abc"), DeviceHash.of("abc"))
        assertEquals(DeviceHash.of("abc"), DeviceHash.of("  abc "))
        assertNotEquals(DeviceHash.of("abc"), DeviceHash.of("abd"))
    }

    @Test fun theIdItselfIsNotInTheHash() {
        val id = "9774d56d682e549c"
        assertTrue(!DeviceHash.of(id)!!.contains(id))
    }

    @Test fun noIdOrABlankOneGivesNothing() {
        assertNull(DeviceHash.of(null))
        assertNull(DeviceHash.of(""))
        assertNull(DeviceHash.of("   "))
    }
}
