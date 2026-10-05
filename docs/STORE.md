# App Store listing and release checklist

Copy for App Store Connect (from the blueprint, section 14).

> **Pick the final name before publishing anything.** The website currently says "Menu Math"
> (`web/site.config.ts`) and the app reads `AppConfig.appName`. Replace "MenuMacros" in the copy
> below with the final name, then check it's free on the App Store and as a US trademark.

| Field (limit) | Text |
|---|---|
| App name (30) | **MenuMacros: Fast Food Macros** (28) |
| Subtitle (30) | **High protein restaurant orders** (30) |
| Keywords (100) | `calories,nutrition,healthy,eating,out,diet,glp1,calorie,counter,menu,lowcarb,keto,lunch,drivethru` (97) |
| Primary / secondary category | Health & Fitness / Food & Drink |
| Promotional text (170) | Full calories and protein for every item at 50 popular chains, free. New: GLP-1 mode for smaller, protein-first orders. |

**Never** put restaurant names in the name, subtitle or keyword field (App Review Guideline 2.3.7).

## Description

Eating out shouldn't wreck your goals. MenuMacros shows the full calories, protein, carbs and fat
for every item at 50 popular US restaurant chains, free, straight from each chain's published
nutrition information, with the source shown.

Pick a restaurant, get your order. Choose a chain nearby or search, then see every item's numbers,
sorted the way you want: most protein, fewest calories, or most protein per calorie.

Go Pro for the perfect order. Get the top 5 orders for your goal that fit what you have left today.
Build your own order (double chicken, no cheese) and watch the totals update as you tap. Log it to
Apple Health in one tap.

Made for every goal. Losing weight, maintaining, building muscle, or eating smaller meals on a
GLP-1 medication: set your goal once and every recommendation adapts.

Honest by design. No account. No estimates passed off as facts. Spot a number that looks wrong?
Tap "Report a number" and we'll check it within 48 hours. MenuMacros is not affiliated with any
restaurant and does not give medical advice.

Subscription: MenuMacros Pro is $6.99/month or $34.99/year with a 7-day free trial on the yearly
plan. Payment is charged to your Apple ID at confirmation of purchase (or at the end of the trial).
Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current
period. Manage or cancel in your App Store account settings.
Terms of use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/ · Privacy: https://<your-domain>/privacy

## Screenshots (6.9" iPhone; first three appear in search)

1. "Full macros for every item. Free." — a chain menu
2. "Build your order. Watch the protein add up." — the order builder
3. "The 5 best orders for your goal" — Best for you
4. "GLP-1 mode: smaller, protein-first orders"
5. "Every number from the chain's own guide" — the source footer

Use your own app screens only; no restaurant logos or food photos.

## App Privacy (App Store Connect questionnaire)

Answer from what the app actually sends (SPEC §12, docs/BACKEND.md). None of it is used for tracking.

| Data type | Why | Linked to the user? |
|---|---|---|
| Usage Data → Product Interaction | Analytics (anonymous feature counts) | No |
| User Content → Other User Content | "Report a number", "Request a chain", "Contact us" messages | No |
| User Content → Photos or Videos | Optional photo attached to a number report | No |
| Contact Info → Email Address | Only if the user types one in "Contact us" so you can reply | Yes |

- Health data: not collected (written to Apple Health on the device only; never sent to you).
- Location: not collected (used on device only; the search goes to Apple Maps).
- Purchases: not collected by you (Apple handles them).
- Purpose for all of the above: App Functionality (plus Analytics for usage data).
- The API also keeps a salted one-way hash of the sender's IP address for 30 days, only for spam
  prevention. Apple's list has no IP-address type; the cautious choice is to declare it as
  **Other Data → Other Data Types**, not linked, purpose App Functionality. The website policy already
  discloses it.
- If you add anything (e.g. a crash reporter), update this table AND the website privacy policy.

## URLs for App Store Connect

- Privacy Policy URL: `https://<your-domain>/privacy`
- Support URL: `https://<your-domain>/support`
- Marketing URL: `https://<your-domain>`

## Notes for App Review

"MenuMacros shows restaurant chains' published nutrition information. Restaurant names are used
only to identify whose menu is shown; we use no logos and state that we are not affiliated.
Pro features can be tested with the subscription in the sandbox. No login is required."

## Release checklist

- [ ] Release data built once with `--no-samples --out dist/release --bundle-into MenuMacros/Resources/Menus`; `dist/release/` uploaded to the host
- [ ] `AppConfig` placeholders replaced (menu URL, support email, privacy URL, bundle/group IDs)
- [ ] Subscription group, products and 7-day intro offer created and "Ready to Submit"
- [ ] Paid Apps agreement, tax and banking completed in App Store Connect
- [ ] Small Business Program enrolled (15% commission)
- [ ] Website live on your domain (Vercel Pro); /privacy reviewed; privacy label filled from the table above; age rating questionnaire done
- [ ] TestFlight with 20–50 testers; crash-free; feedback triaged
- [ ] Submit around 18 December; set release to "Manually release"; release Monday 4 January 2027
