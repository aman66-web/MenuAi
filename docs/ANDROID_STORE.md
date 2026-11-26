# Google Play listing for Numbite (drafted 22 November 2026; founder: "upload my app to the google play store")

Developer account: **Clarifo Developers Ltd** (an organisation account, so Google's 12-testers-for-14-days rule for new personal accounts does not apply).
App: **Numbite: Calories & Protein**, package `com.amanmarwaha.numbite`, free with in-app subscriptions, UK first. Graphics: `android/store/`
(`icon-512.png`, `feature-graphic.png`, `screenshots/`).

## Main store listing

| Field (limit) | Text |
|---|---|
| App name (30) | Numbite: Calories & Protein |
| Short description (80) | Calories and protein for UK restaurants, supermarkets and recipes |
| Category | Food & drink (tags: Calorie counter / Nutrition, Healthy eating if offered; never a restaurant or shop name) |
| Contact | support email from `NEXT_PUBLIC_SUPPORT_EMAIL`; website https://numbite.com; privacy policy https://numbite.com/privacy |

**Full description (4,000):**

```
Know the numbers before you eat. Numbite shows the calories, protein, carbs and fat for menu items at 241 UK restaurants, cafés and pubs, taken from each chain's own published nutrition information, with the source and the date we checked shown on every menu.

Eat out. Search a restaurant or find the ones near you, see every dish's numbers, and get the best orders for your goal and what you have left today. Build your own order and watch the totals add up as you tap.

Shop. Browse about 68,000 products from nine UK supermarkets with the shop's own price, and calories and protein where the label is published. Scan a barcode, compare products side by side, and keep a shopping list.

Cook. 382 recipes made from real supermarket products, with the calories, protein and cost of each serving, fitted to your meal size. Type what's in your fridge and see which recipes use it.

Made for your goal. Losing weight, maintaining, building muscle, or smaller, protein-first meals on a GLP-1 medication: set it once and every suggestion follows it. Diet filters for vegetarian, vegan, halal, no pork, no beef and the 14 allergens, always going by what each restaurant or shop publishes.

Easy to use. A plain layout, big buttons and a short guided tour.

Your account. A free account (Google or an email code) keeps your settings, saved meals and lists on all your devices. No ads, no tracking. Your location is used on your phone only. You can delete your account in Settings at any time.

Numbite Premium. Every restaurant's full menu with calories and macros stays free. Premium adds every Truth card, Smart Swap and Quick answer, the Top 5 picks for your goal at chains that publish protein, the full Cheapest protein list, unlimited saved orders, a week's meal plan with Pip, with its shopping list, Make it at home (a recipe from a photo of a dish), Scan your food (an estimate from a photo of your plate) and Pip's own recipes from what you have. Your first 7 days of Premium are free (one free week per person), with no payment details. After that, choose Monthly or Annual. Payment is charged to your Google Play account. A subscription renews automatically until you cancel it; you can manage or cancel it in Google Play under Payments & subscriptions.

Numbite isn't affiliated with any restaurant or shop, and doesn't give medical advice.
```

## Pricing and distribution

Free app, in-app subscription `com.amanmarwaha.numbite.premium` with base plans `annual` (£49.99 a year) and `monthly` (£4.99 a month), **no free-trial offer** (the free
week is the account's own, like the iPhone app). Countries: United Kingdom first (the data is UK only). Contains ads: No.

## Content rating (IARC questionnaire)

Same honest answers as the App Store (docs/STORE.md "Age rating"): no violence, no sexual content, no gambling; references to alcohol are infrequent (a few pub menus list
drinks by name); health and wellness topics frequent; a limited form of user content (usernames and the typed words of a shopping list sent to a friend; Report and Block are
in the app), no chat. Reminders are the person's own clock. Do not answer lower to look better.

## Target audience and content

Target age: **18 and over** (a calorie and diet app is not for children; this also keeps the app out of Google's Families policy). Not designed for children. No ads. News app: no.
Health apps declaration: Numbite is not a medical device and gives no medical advice (the screens say so); it is a nutrition-information app: choose the "nutrition and weight
management" kind of health feature if asked, and "no" to medical device, clinical decision support, health connect, and government or medical-records access.

## Data safety form (from what the app really sends: docs/STORE.md "App Privacy", docs/BACKEND.md)

Everyone signs in, so these are collected for all users. **Encrypted in transit: yes.** **Users can request deletion: yes**, in the app (Settings › Account › Delete my
account) and at https://numbite.com/privacy. **No data is shared with third parties** (our AI provider, Anthropic, and our host and database process it on our behalf; Google's
definition of "sharing" excludes service providers). Nothing is used for advertising, tracking or analytics.

| Section › type | Collected | Why | Optional? |
|---|---|---|---|
| Personal info › Email address | yes | account, app functionality | required |
| Personal info › User IDs | yes | account ID, Community username and friend code | required |
| Health and fitness › Health info | yes | synced goal, targets, diet and allergy choices, food diary | required for sync |
| Health and fitness › Fitness info | yes | the training question in Meal plan with Pip (sent to our server and Anthropic, not linked to the account) | optional |
| Photos and videos › Photos | yes | optional photos for Scan your food and Make it at home (sent to Anthropic through our server, not kept) and number reports | optional |
| App activity › Search history | yes | search help sends the words of a search that found nothing (kept up to a day, not linked) | optional |
| App activity › Other user-generated content | yes | saved meals, recipes, lists, Meal plan answers and notes | optional |
| Messages › Other in-app messages | yes | "Contact us" and reports | optional |
| Financial info › Purchase history | yes | the Google Play purchase token is sent to our server only to confirm the subscription (no name or email in it) | required to buy |
| Location | **no** (used on the phone only, never sent) |
| Device or other IDs | **yes since the build with `device.id` (1.1 (3))** | fraud prevention, security and compliance: a one-way hash of the Android ID stops a second free week on the same phone (the server keeps only a second hash of it, even after the account is deleted); not shared | required |
| Contacts, Calendar, Audio, Files, Web browsing, Diagnostics, Performance | no |

**Ask Pip (added 26 November 2026; switched on 26 November for the next build, `NEXT_PUBLIC_ASK_PIP=1`): Data safety already covers it, nothing to change.** Each chat message
goes to our server and Anthropic (a service provider, so not "shared") with the newest turns of the chat, the goal, targets, diet and allergy choices, supermarkets and the
phone's time; today's food diary, saved recipes and meal plan reach Anthropic only when Pip looks them up. Nothing is kept on our server; never a name, email or account ID.
Checked on the live form on 26 November: **App activity › Other user-generated content** (optional, App functionality) and **Health and fitness › Health info** are both ticked.
"Processed ephemerally" stays **No** for both: Google asks it per data type, and saved meals, recipes, lists and the synced diary are kept.

## What's new (first release)

```
Numbite for Android: calories, protein and prices for UK restaurant menus, supermarket products and 382 recipes. Free week of Premium for every new account.
```

## State in Play Console (22 November 2026, 03:00)

App created: **Numbite: Calories & Protein**, `com.amanmarwaha.numbite`, free, English (UK), Clarifo Developers Ltd (app id 4972454069279403743). Done through Chrome while the founder slept:

* **App content (all 10 declarations done):** privacy policy https://numbite.com/privacy; ads: none; sign-in details (Google or email code, free 7-day week, no card; this one is the weakest: Google says reviewers can't create accounts, use
  their own or use free trials, so **a demo login with a Premium gift is advisable before production**); content rating (IARC: alcohol and medical-drug references, rarely; no user chat; digital purchases yes); target audience 18+;
  data safety (imported from CSV, see the table above, nothing shared); advertising ID: no; government: no; financial features: none; health apps: nutrition and weight management only (medication management NOT ticked, the
  reminders are the person's own clock).
* **Store listing (default, en-GB):** short and full description above, icon, feature graphic and 8 phone screenshots (`android/store/screenshots/`, in the same order as the App Store set, minus "Top 20 supermarket lists" and "Top
  picks"; the AI-picture label is set on the three that show recipe pictures). Category Food & Drink; contact email and website set.
* **Not done:** the subscription (Play only lets you create it once a build with the Billing permission is uploaded), the first release (needs the signed bundle), countries (United Kingdom), pricing check, the trader status
  declaration (the founder's own, due by February 2027), tester set-up, production release.
* The 7-day free week is the account's (server), so the Play subscription has **no free-trial offer**.

## Submitted to Google (22 November 2026, about 05:00; founder: "please approve and send for production review")

* **Production release 1.1 (2)** (versionCode 2: version 1 was replaced because Google flagged a REQUIRED portrait screen that a library activity implied; the manifest now says portrait and landscape are
  not required), United Kingdom only, sent for review in Publishing overview (10 changes: the release, the country, the store listing and the declarations). Managed publishing is off, so it goes live by itself
  when Google approves (usually within 7 days, the first review can take longer). Build: `NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk ./scripts/build_android.sh aab`, signed with the founder's upload key
  (`~/.numbite-android/`, made 22 Nov), 61 MB, target SDK 36, API 26+. Play's 10 MB limit on the browser tool meant the bundle was fed to the console in 8 chunks and re-assembled in the page
  (SHA-256 checked against the file on disk).
* **Subscription** `com.amanmarwaha.numbite.premium` "Numbite Premium": base plans `annual` (GBP 49.99 a year, grace 7 days since 22 Nov, founder: "Give them a 7 day grace period"; Play recommends 14 for yearly and shows an account hold of 53 days) and `monthly` (GBP 4.99 a month, grace 7 days), both **Active**, United Kingdom, no free-trial
  offer, benefits "Meal plan with Pip and shopping list" and "Truth cards, Smart Swap, Quick answers". (Play's bulk "Set prices" box adds 20% VAT on top: the price is set in each country's own cell, which is the
  figure customers see.)
* **Still open:** `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` in Vercel (until then a purchase in the app cannot be confirmed by our server: the route answers 503 and the app says the purchase is not confirmed); a demo login for
  Google's reviewers; the website release so the Android lines are on numbite.com's privacy and terms; deep-link `assetlinks.json` with the Play signing fingerprint; the trader-status declaration.

## LIVE on Google Play (found 22 November 2026, about 09:00 GMT) and what was done about it

Google approved 1.1 (2) within hours: the production track is **Active**, the store page answers 200 (https://play.google.com/store/apps/details?id=com.amanmarwaha.numbite), United Kingdom.
Two things are not ready, found by checking the live site (an OPTIONS call from the Android origin gets no CORS headers; `POST /api/v1/entitlement/google` is a 404):
1. **numbite.com does not have the Android changes** (main is at a5313bf0; the CORS allow-list for `https://appassets.androidplatform.net`, the Google purchase route and the platform wording are only on `iap`). So the
   live Android app's calls to the API (sign-in, sync, Pip, reports) are refused by the browser, and sign-in is required for everyone: **the Android app cannot be used until the website is released.**
2. **GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not in Vercel**, so even after the release a purchase cannot be confirmed (503).
Protective step taken: both base plans (annual, monthly) were set to **Inactive** in Play Console, so nobody can be charged for a subscription the server cannot deliver. To switch them on again: Monetize with Play › Subscriptions ›
Numbite Premium › each base plan › Activate. Release order that makes it work: (a) release `iap` to main and deploy (founder's go-ahead), (b) service-account key in Vercel, redeploy, (c) activate the plans, (d) test a purchase with
a licence tester (Play Console › Settings › License testing), (e) add the reviewer demo login. If you would rather not have the app visible meanwhile: Play Console › Test and release › Production › Manage › Unpublish (or Publishing overview › Managed publishing).

**Update, 22 Nov about 09:25 GMT: problem 1 is fixed.** numbite.com was released from `iap` (main fd2787d1): the Android origin passes CORS, the Google route exists (503 until the key is set) and the privacy and terms pages carry the Android lines.
What is still open: the service-account key in Vercel (problem 2), then activate both base plans (grace period is 7 days on both), a licence-tester purchase test, the reviewers' demo login.

## 1.1 (3) submitted (22 November 2026, about 13:08 GMT)

Production release "3 (1.1)" (versionCode 3: the free week is remembered per phone, see docs/PAYMENTS.md "Android phones") and the Data safety form (Device or other IDs added: `android/store/data_safety.csv`) were sent for review together;
the console ran its quick checks first (up to 14 minutes). It replaces 1.1 (2). The one build warning is Play's "no deobfuscation file" note (the app does not use R8). Managed publishing is off: it goes live by itself when approved.
Google approved and published it the same day (Submission activity: Published; Production track: latest release 3 (1.1)).

**22 Nov, about 17:00 GMT: both base plans were set to Active again** (founder: "Switch them on now."), with the Play service account not yet accepted by Google: see docs/PROGRESS_LOG.md.

**Decision, 22 Nov (founder): no demo login for Google's reviewers.** They can sign in with Google, an email code or Apple like anyone, and every new account gets the free week of Premium, so they can try the Premium features. Ignore the earlier "demo login advisable" and "(e) add the reviewer demo login" lines above.
