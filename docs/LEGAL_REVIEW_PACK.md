# Paid access: legal review pack (for you, and for a solicitor if you use one)

Written 14 November 2026 by Claude, who is not a lawyer. This lists exactly what the website says and does when someone pays, what is missing, and the questions to put to a solicitor. Nothing here is legal advice.
The wording is switched on only when payments are on (`NEXT_PUBLIC_WEB_PRO=1`). Code: `web/app/(site)/{terms,privacy,support}/page.tsx`, `web/lib/payments/stripe.ts`.

## 1. What a customer is sold
- Three plans (GBP): a one-off **Founding Member 90-Day Pass £9.99** (90 days of access, no renewal), **Annual £14.99** and **Monthly £2.99** (both renew automatically until cancelled).
- Free forever: every restaurant's full menu with calories and macros. Paid: the Truth card for every dish (free is 3 a day), every Smart Swap, the full Quick answers and Cheapest protein lists, unlimited saved orders.
- No account is needed to pay; the buyer's email address (collected by Stripe) identifies them.

## 2. The wording shown (verbatim)
**Stripe's payment page, under the Pay button (`CHECKOUT_CONSENT`):**
> By paying you ask us to give you access straight away, and you agree that this ends your 14-day right to cancel once access has begun. Subscriptions renew until you cancel.

**Terms, "Paid access on the website":**
> Every restaurant's full menu with calories and macros stays free. Paid access adds the extras listed on the pricing screen (for example the Truth card for every dish rather than three a day, every Smart Swap and Quick answer, and the full Cheapest protein list). You can pay for one of three plans: a one-off £9.99 Founding Member 90-Day Pass that gives 90 days of access and does not renew, £14.99 a year, or £2.99 a month. The year and the month renew automatically until you cancel. Prices are shown before you pay.
>
> Payments are taken by Stripe on its own secure page (card, Apple Pay or Google Pay), and you do not need an account to pay. We receive your email address, what you bought and when, and a payment reference from Stripe, and never your card number. To use your access on another device, sign in there with the same email address, or ask us to help.
>
> **Cancelling.** Cancel a year or a month any time by emailing us; you keep access until the end of the period you have paid for, and we do not take another payment. **Your right to cancel.** Access starts as soon as you pay, because you ask us to start it at once. As a UK consumer you normally have 14 days to cancel a digital purchase, but once access has begun and you have agreed to that, you lose that right. If something is wrong with what you bought, we will put it right or refund you as the law requires. Email us and we will reply within two working days.
>
> **Sharing for 48 hours.** If you share on WhatsApp from the pricing screen, we give you 48 hours of paid features on that device. We cannot see what you share or who receives it, so this is a goodwill offer and we may change or withdraw it.

**Privacy, payment paragraphs** (see the page): Stripe takes the payment and tells us the email address, what was bought, the amount, the dates and a payment reference; we never see a card number; payment records are kept while access lasts and for six years after (accounting records); a signed token on the device holds no name or email; a creator code from a link is held in memory only.

## 3. What the system does (facts for the solicitor)
- Access starts immediately after payment (the device is given a signed token; the server records the payment).
- Renewals: Stripe charges, our webhook extends access. Cancelling: by **email to us**, then we cancel in Stripe by hand (there is no cancel button yet). A full refund in Stripe ends access.
- Stored per payment (Supabase, EU/US region as the privacy page says): email, plan, dates, Stripe ids, amount, currency, creator code. No card detail.
- Creator codes (`?ref=anna`): kept in the page's memory only and sent only with the buyer's own Checkout request. Creators are paid by hand from a report; there is no automatic split.
- The 90-day pass is one payment; "Founding Member" is a name, not a promise of future benefits.

## 4. Gaps I can see (please decide or supply)
1. **Who is the seller?** Terms and Privacy name no company, address or number. A distance sale in the UK needs the trader's name, geographic address and contact details before purchase. Is the seller CLARIFO DEVELOPERS LTD (the Apple team name)? Please give the exact registered name, number and address and the contact email.
2. **Cancelling by email only.** A person who subscribes online should be able to cancel as easily. Consider Stripe's customer portal (a "Manage subscription" link) before going live. I can build that; it is a small change plus a Stripe setting.
3. **Renewal reminders and the new UK subscription rules.** The Digital Markets, Competition and Consumers Act 2024 brings a new subscription-contract regime (pre-contract information, reminder notices, easy exit, a cooling-off period on renewal). Its start date and details are for a solicitor to confirm; our current text does not yet describe reminders.
4. **Who is the 14-day waiver for?** The consent line is shown next to the Pay button. A solicitor should confirm it is clear and prominent enough, and whether a separate tick-box is wanted.
5. **VAT.** If you are or become VAT registered, prices must show VAT treatment and receipts must carry it. Stripe can send receipts; this is not switched on in the build.
6. **Refund and complaints routes** (the "put it right or refund" sentence) and the support reply time (two working days) must be something you will actually meet. The support address is still the Hotmail address until the mailbox is set up.
7. **Apple.** Everything above is for purchases on the website only. In the iPhone app, purchases will use Apple's In-App Purchase with Apple's terms (guideline 3.1.1); the website's payment page is never shown in the app.

## 5. Questions to put to a solicitor
1. Is the checkout consent line enough for losing the 14-day right to cancel on digital content, for both the one-off and the subscriptions? Do we also need to tell customers that they lose it before they pay, in the Terms?
2. For auto-renewing plans: what must we say before purchase, what reminders must we send, when does the new subscription regime start, and does emailing us to cancel satisfy "easy cancellation"?
3. Is a "Founding Member" label with a time-limited one-off pass misleading, or fine with the Terms text as it is?
4. Retention: is "while access lasts plus six years" for payment records right for a small UK company?
5. Is the 48-hour WhatsApp unlock a promotion that needs terms of its own?
6. Does holding a creator code only in memory avoid PECR consent? (Decided 14 Nov 2026 to avoid any storage so no banner is needed; a lawyer may confirm.)
7. Anything the Terms or Privacy must add for the seller's identity, VAT, complaints or alternative dispute resolution.
8. (Added 19 November 2026, the 30-person onboarding meeting; the founder: "go with that".) Signed-in accounts sync the person's goal (which can be "I'm on a
   GLP-1 medication", health), a halal or other religious diet choice (religion) and their allergies (health) to Supabase, stored in the US. Under UK GDPR these
   are likely special-category data (Article 9). Is the explicit consent at sign-in, and the privacy page as written, enough, or is a separate explicit consent,
   a data protection impact assessment, or EU/UK hosting needed? Until a solicitor answers, nothing changes; the sign-in and targets screens say plainly what is
   saved with the account.

## 6. What I need from you
The seller's exact details (item 4.1), a yes or no on the Stripe customer portal (4.2), and, before real money, an explicit yes that you accept the wording as it stands or have had it checked.
