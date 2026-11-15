# Paid access: from "built and off" to "on" (founder's checklist, 14 November 2026)

Do the blocks in order. Each block is at most three things. Claude does everything that does not need your accounts or a secret.

Plan and prices: `docs/PAYMENTS.md`. Nothing here changes numbite.com until block 4.

## Where the secrets go (read once)
Secrets are pasted by YOU, into Vercel (project `menumacros` > Settings > Environment Variables), never into a chat. Mark each secret "Sensitive". Claude sets the non-secret ones.

| Variable | Secret? | Who sets it | Test (Preview) value | Live (Production) value |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | **yes** | you | `sk_test_…` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | **yes** | you | `whsec_…` of the test endpoint | `whsec_…` of the live endpoint |
| `ENTITLEMENT_PRIVATE_JWK` | **yes** | you | from `make_entitlement_key.mjs` | the SAME key (one pair for both) |
| `NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK` | no (public) | Claude | the public line | the same |
| `STRIPE_PRICE_PASS90`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_MONTHLY` | no | Claude | test `price_…` ids | live `price_…` ids |
| `NEXT_PUBLIC_WEB_PRO` | no | Claude | `1` (Preview, branch `viral-upgrade` only) | `1` (Production, only at block 4) |
| `NEXT_PUBLIC_SITE_URL` | no | Claude | the branch's preview address | leave unset (defaults to https://numbite.com) |

`NEXT_PUBLIC_…` values are baked in when the site is built, so changing one needs a redeploy (Claude does that).

## Block 1: make the test setup (about 15 minutes)
1. Open Claude in Chrome (logged in to Supabase, Stripe in **Test mode** and Vercel) and paste `docs/CHROME_PROMPT_PAID_ACCESS.md`. It applies the database change, makes the three test prices and the test webhook, and reports the three `price_…` ids. It never touches a secret.
2. On your own computer, in the repo folder, run `node tools/payments/make_entitlement_key.mjs`. It prints a public line and a private line. Send Claude **only the public line** (it is public). Keep the private line.
3. In Vercel, add the three secrets from the table for **Preview** (Stripe test secret key, the test webhook secret, the private key line). Tell Claude "secrets added".

## Block 2: try it with Stripe's test card (about 10 minutes)
1. Claude adds the non-secret variables, builds the `viral-upgrade` preview and gives you its address (you are logged in to Vercel, so it opens).
2. Open it, go to Settings > See plans (or open four different dishes' "See the truth"), pay each plan with card `4242 4242 4242 4242`, any future date, any CVC. Check access appears, survives a reload, and a row appears in Supabase > Table Editor > `pro_entitlements`.
3. Tell Claude what you saw. (The test webhook cannot reach a protected preview, so renewals and refunds are checked in block 4 with real money.)

## Block 3: before real money (you decide)
1. **Seller details.** Terms and Privacy name no company. A sale in the UK needs the seller's name, registered address and contact. Tell Claude the details to show (is it CLARIFO DEVELOPERS LTD?).
2. **Legal wording.** Read `docs/LEGAL_REVIEW_PACK.md`. A solicitor's check is advised; going live without one is your call. Claude will ask you for an explicit yes.
3. **Stripe live mode.** Finish Stripe's business verification (identity, bank account) so live payments can be switched on.

## Block 4: payments on (about 15 minutes)
1. In Stripe **live mode** make the same three prices and the live webhook `https://numbite.com/api/v1/webhook/stripe` (events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`); the Chrome prompt in live mode does this too. Send Claude the three live `price_…` ids.
2. In Vercel add the live secrets for **Production** (live secret key, live webhook secret, the private key). Tell Claude.
3. Claude sets the Production variables, redeploys, checks the plans and legal pages. Then you buy the £2.99 monthly plan yourself, check access, check Stripe shows the webhook delivered (200) and Supabase has the row, and refund it in Stripe. **To switch payments off again:** delete `NEXT_PUBLIC_WEB_PRO` in Vercel and redeploy.

## Block 5: hello@numbite.com
`docs/MAILBOX_SETUP.md` (free forwarding to your Hotmail). Then Claude changes `NEXT_PUBLIC_SUPPORT_EMAIL` and redeploys.

## Block 6: Apple In-App Purchase (after block 4 works)
1. In App Store Connect > Business: accept the **Paid Apps** agreement and add your bank and tax details (only you can).
2. On your Mac open a new Claude desktop chat with computer access and paste `docs/CLAUDE_DESKTOP_IAP_PROMPT.md`. It builds the purchase code and tests it in the simulator, then stops before spending or uploading anything.
3. The result is a new app version (1.1) with a new build number and a new App Review.
