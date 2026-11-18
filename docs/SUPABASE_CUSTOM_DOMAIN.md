# Sign-in on auth.numbite.com (Supabase custom domain)

Founder, 18 November 2026: "for supabase pls use my numbite.com one". Today Continue with Google shows Supabase's own address
(`rbbalkfkpacazzhsqfzz.supabase.co`) at the top of the sign-in window, and Google's page can say "to continue to …supabase.co". With a custom domain,
Supabase answers on **auth.numbite.com** instead, so people only ever see numbite.com and Google.

**Cost:** Supabase's Custom Domain add-on is about $10 a month and needs a paid Supabase plan (Pro, about $25 a month, if the project is still on Free).
You turn it on yourself; Claude can't (it costs money, and Claude's Supabase connection can't see the `menumacros` project).

## Your steps (about 15 minutes)

1. **Supabase** › the `menumacros` project › **Project Settings** › **Add-ons** › **Custom domain** › enable it (it asks for the plan if needed).
2. Still in Supabase › **Project Settings** › **Custom domains**: type `auth.numbite.com` and press **Add**. Supabase shows two DNS records:
   a **CNAME** (`auth` → `rbbalkfkpacazzhsqfzz.supabase.co`) and a **TXT** record (`_acme-challenge.auth` → a long value).
3. **Vercel** › **Domains** › `numbite.com` › **DNS Records**: add both records exactly as Supabase shows them (Type, Name, Value). Leave TTL as it is.
4. Back in Supabase, press **Verify**. When it says verified (a few minutes, sometimes up to an hour), press **Activate**.
5. **Google Cloud Console** › APIs & Services › **Credentials** › the OAuth client used for Numbite › **Authorised redirect URIs**: **add**
   `https://auth.numbite.com/auth/v1/callback` (keep the old supabase.co one for now). Save. While you're there, check **OAuth consent screen** ›
   App name says **Numbite** and the app domain is **numbite.com**.
6. **Apple Developer** › Certificates, IDs & Profiles › **Identifiers** › the Services ID used for Sign in with Apple on the web › Configure:
   add `auth.numbite.com` to the domains and `https://auth.numbite.com/auth/v1/callback` to the Return URLs (keep the old ones). Save.
7. Tell Claude "auth domain is on". Claude then changes **`SUPABASE_URL`** in Vercel (Production and Preview) from `https://rbbalkfkpacazzhsqfzz.supabase.co`
   to `https://auth.numbite.com` and redeploys (with your go-ahead for that deploy), then tries a Google sign-in on the website and in the app.

Nothing in the app itself needs rebuilding: the app only talks to numbite.com's API, which is what sends people to Supabase.
After a week with no problems, the old supabase.co redirect URIs can be removed from Google and Apple.
