package com.amanmarwaha.numbite.web

import org.junit.Assert.assertEquals
import org.junit.Test

/** WebAppView.swift's decidePolicyFor, as rules. */
class NavigationPolicyTest {
    private fun main(url: String) = NavigationPolicy.decide(url, true)
    private fun frame(url: String) = NavigationPolicy.decide(url, false)

    @Test fun ourOwnPagesStayInTheApp() {
        assertEquals(NavDecision.Allow, main("https://appassets.androidplatform.net/app"))
        assertEquals(NavDecision.Allow, main("https://appassets.androidplatform.net/app/settings?x=1#a"))
        assertEquals(NavDecision.Allow, main("HTTPS://APPASSETS.androidplatform.net/app"))
        assertEquals(NavDecision.Allow, main("about:blank"))
    }

    @Test fun otherWebsitesOpenOutside() {
        assertEquals(NavDecision.OpenOutside("https://www.kfc.co.uk/allergens"), main("https://www.kfc.co.uk/allergens"))
        assertEquals(NavDecision.OpenOutside("http://example.com/"), main("http://example.com/"))
        // numbite.com itself is another website to the app (the iPhone app does the same)
        assertEquals(NavDecision.OpenOutside("https://numbite.com/privacy"), main("https://numbite.com/privacy"))
        // a lookalike host
        assertEquals(NavDecision.OpenOutside("https://appassets.androidplatform.net.evil.example/"), main("https://appassets.androidplatform.net.evil.example/"))
    }

    @Test fun mailAndPhoneLinksGoToTheirApps() {
        assertEquals(NavDecision.OpenOutside("mailto:hello@numbite.com"), main("mailto:hello@numbite.com"))
        assertEquals(NavDecision.OpenOutside("tel:+441234567890"), main("tel:+441234567890"))
    }

    @Test fun sharedListsAndInvitesLoadInsideTheApp() {
        assertEquals(
            NavDecision.LoadInApp("https://appassets.androidplatform.net/app/groceries/list/shared#AbCdEfGh12"),
            main("https://numbite.com/l#AbCdEfGh12"),
        )
        assertEquals(NavDecision.LoadInApp("https://appassets.androidplatform.net/app/community/friends#ABCD2345"), main("numbite://f#ABCD2345"))
    }

    @Test fun downloadsAreRefusedButAFrameMayShowOne() {
        assertEquals(NavDecision.Refuse, main("blob:https://appassets.androidplatform.net/1234"))
        assertEquals(NavDecision.Refuse, main("data:image/png;base64,AAAA"))
        assertEquals(NavDecision.Allow, frame("blob:https://appassets.androidplatform.net/1234"))
    }

    @Test fun framesMayLoadHttpsOnly() {
        assertEquals(NavDecision.Allow, frame("https://example.com/frame"))
        assertEquals(NavDecision.Refuse, frame("http://example.com/frame"))
        assertEquals(NavDecision.Refuse, frame("mailto:a@b.c"))
    }

    @Test fun anythingUnknownIsRefused() {
        assertEquals(NavDecision.Refuse, main("intent://scan/#Intent;scheme=zxing;end"))
        assertEquals(NavDecision.Refuse, main("javascript:alert(1)"))
        assertEquals(NavDecision.Refuse, main("file:///etc/hosts"))
        assertEquals(NavDecision.Refuse, main("content://com.android.contacts/contacts"))
        assertEquals(NavDecision.Refuse, main("market://details?id=x"))
        assertEquals(NavDecision.Refuse, main("not a url"))
        assertEquals(NavDecision.Refuse, main(""))
    }
}
