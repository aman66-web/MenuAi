# hello@numbite.com: free forwarding to your Hotmail (founder's steps, 14 November 2026)

What this gives you: anyone who writes to **hello@numbite.com** reaches your Hotmail inbox. You reply from Hotmail (the reply shows your Hotmail address). It does not let you SEND as hello@numbite.com; that needs a paid mailbox (Google Workspace and similar), which we skipped.
Resend (which sends your sign-in codes) uses the `send` subdomain, so it is not affected.
Provider: ImprovMX (free plan: forwarding for one domain). A third party then handles mail sent to that address, so the privacy page gets one line (Claude adds it).

## Block 1: make the account and add the domain (5 minutes, you)
1. Go to https://improvmx.com, sign up with your Hotmail address (you type the password), and verify the email they send.
2. Add the domain `numbite.com`. Add the alias `hello` forwarding to `aman66@hotmail.co.uk`.
3. The page then shows the DNS records to add. They should be: two MX records, `mx1.improvmx.com` (priority 10) and `mx2.improvmx.com` (priority 20), and one TXT record `v=spf1 include:spf.improvmx.com ~all`. **Use exactly the values their page shows if they differ from these.**

## Block 2: add the records in Vercel (5 minutes, you; Claude's Vercel connection is not allowed to touch DNS)
1. Vercel > Domains > numbite.com > DNS Records. Look first for an existing TXT record on the root (empty name) that starts `v=spf1`. If there is one, do not add a second: edit it to include `include:spf.improvmx.com` (one SPF record only). Your Resend records live on `send`, `rsend` and `_dmarc` and stay as they are.
2. Add the two MX records with name left empty (the root) and the priorities above, and the TXT record if there was no SPF already.
3. Back on ImprovMX, press "Check DNS". It may take a few minutes to turn green.

## Block 3: test and tell Claude (2 minutes, you)
1. From another address (a friend's, or Gmail) send an email to hello@numbite.com. It should arrive in Hotmail within a minute (check Junk too).
2. Tell Claude "mailbox works". Claude then sets `NEXT_PUBLIC_SUPPORT_EMAIL=hello@numbite.com` in Vercel (Production and Preview), adds the privacy sentence, redeploys and checks the Support, Privacy and Terms pages.

Notes
- The iPhone app has the Hotmail address packed inside it until the next app build; the Hotmail address keeps working, so nothing is lost.
- If ImprovMX asks you to pay for something, stop and tell Claude; the free plan is enough.
