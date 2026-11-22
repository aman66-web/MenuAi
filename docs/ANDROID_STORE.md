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
| Device or other IDs, Contacts, Calendar, Audio, Files, Web browsing, Diagnostics, Performance | no |

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
