package com.amanmarwaha.numbite.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLinksTest {
    private val list = "AbCdEfGh12-_"

    @Test fun sharedListLinks() {
        assertEquals(list, AppLinks.listCode("https://numbite.com/l#$list"))
        assertEquals(list, AppLinks.listCode("https://numbite.com/l/#$list"))
        assertEquals(list, AppLinks.listCode("https://www.numbite.com/l#$list"))
        assertEquals(list, AppLinks.listCode("HTTPS://Numbite.com/l#$list"))
        assertEquals(list, AppLinks.listCode("numbite://l#$list"))
        assertEquals(list, AppLinks.listCode("numbite:///l#$list"))
        assertEquals("https://appassets.androidplatform.net/app/groceries/list/shared#$list", AppLinks.appUrl("https://numbite.com/l#$list"))
    }

    @Test fun sharedListLinksThatAreNotOurs() {
        assertNull(AppLinks.listCode("https://evil.example/l#$list"))
        assertNull(AppLinks.listCode("https://numbite.com/legal#$list"))
        assertNull(AppLinks.listCode("https://numbite.com/l"))
        assertNull(AppLinks.listCode("https://numbite.com/l#short"))
        assertNull(AppLinks.listCode("https://numbite.com/l#abc def123"))
        assertNull(AppLinks.listCode("http://numbite.com/l#$list"))
        assertNull(AppLinks.listCode("numbite://auth#$list"))
        assertNull(AppLinks.listCode("numbite://l/x#$list"))
        assertNull(AppLinks.listCode("not a url"))
        assertNull(AppLinks.listCode("https://numbite.com/l#" + "a".repeat(AppLinks.MAX_LIST_CODE_LENGTH + 1)))
        assertEquals("a".repeat(AppLinks.MAX_LIST_CODE_LENGTH), AppLinks.listCode("https://numbite.com/l#" + "a".repeat(AppLinks.MAX_LIST_CODE_LENGTH)))
    }

    @Test fun friendInvites() {
        assertEquals("ABCD2345", AppLinks.friendCode("https://numbite.com/f#ABCD2345"))
        assertEquals("ABCD2345", AppLinks.friendCode("https://numbite.com/f#abcd-2345"))
        assertEquals("ABCD2345", AppLinks.friendCode("numbite://f#ABCD2345"))
        assertEquals("ABCD2345", AppLinks.friendCode("numbite:///f#ABCD2345"))
        assertEquals("https://appassets.androidplatform.net/app/community/friends#ABCD2345", AppLinks.appUrl("https://numbite.com/f#ABCD2345"))
    }

    @Test fun friendInvitesThatAreNotOurs() {
        assertNull(AppLinks.friendCode("https://numbite.com/f#ABCD234")) // 7 characters
        assertNull(AppLinks.friendCode("https://numbite.com/f#ABCD2340")) // a 0 is not in the alphabet
        assertNull(AppLinks.friendCode("https://numbite.com/f#ABCD23IL"))
        assertNull(AppLinks.friendCode("https://other.example/f#ABCD2345"))
        assertNull(AppLinks.friendCode("https://numbite.com/friends#ABCD2345"))
        assertNull(AppLinks.appUrl("https://numbite.com/privacy"))
        assertNull(AppLinks.appUrl("https://numbite.com/"))
    }

    @Test fun listWinsOverFriendOnTheSameLetterNever() {
        // an 8-character code on /f is a friend, on /l a list: never mixed up
        assertNull(AppLinks.listCode("https://numbite.com/f#ABCD2345"))
        assertNull(AppLinks.friendCode("https://numbite.com/l#ABCD2345"))
    }

    @Test fun authCallback() {
        assertTrue(AppLinks.isAuthCallback("numbite://auth?code=abc"))
        assertTrue(AppLinks.isAuthCallback("numbite://auth?error=cancelled"))
        assertFalse(AppLinks.isAuthCallback("numbite://l#$list"))
        assertFalse(AppLinks.isAuthCallback("https://numbite.com/auth?code=x"))
        assertNull(AppLinks.appUrl("numbite://auth?code=abc"))
    }

    private val code = "a".repeat(64)

    @Test fun signInOutcomeCode() {
        assertEquals(WebSignInOutcome.Code(code, "verifier"), WebSignInOutcome.parse("numbite://auth?code=$code", "verifier"))
        assertEquals(WebSignInOutcome.Code(code, "v"), WebSignInOutcome.parse("numbite://auth?x=1&code=$code&y=2", "v"))
    }

    @Test fun signInOutcomeCancelAndFailure() {
        assertEquals(WebSignInOutcome.Cancelled, WebSignInOutcome.parse("numbite://auth?error=cancelled", "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("numbite://auth?error=other", "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("numbite://auth", "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("numbite://auth?code=short", "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("numbite://auth?code=" + "a".repeat(39), "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("numbite://auth?code=" + "a".repeat(8193), "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("numbite://auth?code=" + "a".repeat(39) + "!", "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("https://numbite.com/auth?code=$code", "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse(null, "v"))
        assertEquals(WebSignInOutcome.Unavailable, WebSignInOutcome.parse("::::", "v"))
    }

    @Test fun plausibleCodes() {
        assertTrue(WebSignInOutcome.isPlausibleCode("a".repeat(40)))
        assertTrue(WebSignInOutcome.isPlausibleCode("A-_9".repeat(10)))
        assertFalse(WebSignInOutcome.isPlausibleCode("a".repeat(39)))
        assertFalse(WebSignInOutcome.isPlausibleCode("a".repeat(8193)))
        assertFalse(WebSignInOutcome.isPlausibleCode("é".repeat(40)))
    }
}
