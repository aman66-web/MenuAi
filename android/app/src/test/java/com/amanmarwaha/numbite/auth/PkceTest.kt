package com.amanmarwaha.numbite.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PkceTest {
    @Test fun challengeMatchesTheRfc7636Example() {
        // RFC 7636, appendix B
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Test fun verifierIs64UrlSafeCharactersForFortyEightBytes() {
        val verifier = Pkce.randomUrlSafe(48)
        assertEquals(64, verifier.length)
        assertTrue(verifier.all { it.isLetterOrDigit() || it == '-' || it == '_' })
        assertNotEquals(verifier, Pkce.randomUrlSafe(48))
    }

    @Test fun challengeIs43CharactersNoPadding() {
        val challenge = Pkce.challengeFor(Pkce.randomUrlSafe(48))
        assertEquals(43, challenge.length)
        assertTrue(challenge.none { it == '=' || it == '+' || it == '/' })
    }

    @Test fun theVerifierFitsTheWebAppsCheck() {
        // web/lib/mm/native.ts: /^[A-Za-z0-9_-]{43,128}$/
        assertTrue(Regex("^[A-Za-z0-9_-]{43,128}$").matches(Pkce.randomUrlSafe(48)))
    }
}
