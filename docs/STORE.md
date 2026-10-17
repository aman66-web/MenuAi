# App Store listing and release checklist (free launch)

Founder 2026-10-12: ship the app **free** (no subscription, no AI recipe maker), then add Pro and the extras in updates. The app is the web
app packed inside an iPhone app (docs/APP_BUILD.md). Name: **Numbite** (founder 2026-10-12; numbers + bite). Checked that day: no app
called Numbite on the UK or US App Store, nothing by that name on the web, and numbite.com, numbite.co.uk and numbite.app free; it is a
coined word, the strongest kind of trade mark. Earlier names were dropped: "MenuMacros" is taken ("MenuMacros: Eat Out Healthily", June
2026) and "Menu Math" used the US spelling and sounded restaurant-only. Everything below is a **draft for the founder to approve** (CLAUDE.md rule 8): numbers are from the published
data on 12 October 2026; if web/app-content.json leaves shops or photos out of the app, update the numbers and the description.

| Field (limit) | Text |
|---|---|
| App name (30) | **Numbite: Calories & Protein** (27) |
| Subtitle (30) | **UK menus, shops & recipes** (25) |
| Keywords (100) | `macros,nutrition,restaurant,counter,diet,grocery,takeaway,supermarket,cooking,meal,food` (87; words already in the name and subtitle are indexed anyway, so they aren't repeated) |
| Primary / secondary category | Food & Drink / Health & Fitness |
| Promotional text (170) | Menu items from 241 UK restaurants and 68,000 supermarket products, with calories and protein. Free and works offline. Only friends need an account. (148) |
| Price | Free (no in-app purchases in this version) |
| Availability | United Kingdom first (the data is UK only) |

**Never** put a restaurant's or supermarket's name or logo in the app name, subtitle, keywords, icon or screenshots (App Review 2.3.7,
2.3.9, 4.1(c); CLAUDE.md rule 2). Never call food healthy, good or bad (rule 3); GLP-1 copy is "smaller, protein-first orders".

## Description (draft)

Know the numbers before you eat. Numbite shows the calories, protein, carbs and fat for menu items at 241 UK restaurants, cafés and
pubs, taken from each chain's own published nutrition information, with the source and the date we checked shown on every menu.

Eat out. Search a restaurant or find the ones near you, see every dish's numbers, and get the best orders for your goal and what you
have left today. Build your own order and watch the totals add up as you tap.

Shop. Browse about 68,000 products from nine UK supermarkets with the shop's own price, and calories and protein where the label is
published. Scan a barcode, compare products side by side, and keep a shopping list.

Cook. 100 recipes made from real supermarket products, with the calories, protein and cost of each serving, fitted to your meal size.

Made for your goal. Losing weight, maintaining, building muscle, or smaller, protein-first meals on a GLP-1 medication: set it once and
every suggestion follows it. Diet filters for vegetarian, vegan, pescatarian, halal, no pork, no beef and the 14 allergens, and a way to find
restaurants by the calories, protein, carbs and fat you want, always going by what each restaurant or shop publishes.

Easy to use. Large text options, a plain layout, and 11 languages.

Community. Read short food articles, and, if you sign in, add friends with a friend code and send them your shopping list. Only your username is ever shown to a friend.

Private by design. No account needed (only friends need one), no ads, no tracking. Your settings, saved meals and lists stay on your phone unless you choose to
sign in (with Apple, Google or an email code) to keep them on all your devices. Your location is used on your phone only.

Every feature is free. Numbite isn't affiliated with any restaurant or shop, and doesn't give medical advice.

## Screenshots (6.9" iPhone, 1320 × 2868)

`web/e2e/store-shots.mjs` takes them from the app's own pages with **every logo hidden and every photo left out** (chains show our cuisine
icons): Today · Eat out · a restaurant · Recipes · a recipe · a supermarket's products. Saved in `web/e2e/shots/store/`. Add captions in
App Store Connect's own frames or leave them plain; never add a restaurant or supermarket logo.

## App Privacy (App Store Connect questionnaire)

From what the app actually sends (docs/BACKEND.md; the same as `MenuMacros/Resources/PrivacyInfo.xcprivacy`). None of it is used for
tracking, and there is no analytics in this version.

| Data type | Why | Linked to the user? |
|---|---|---|
| User Content → Other User Content | "Report a number", "Request a restaurant" | No |
| User Content → Photos or Videos | Optional photo attached to a number report | No |
| User Content → Customer Support | "Contact us" messages | No |
| Contact Info → Email Address | Only if the person types one in "Contact us" so we can reply | Yes |
| Other Data → Other Data Types | A salted one-way hash of the sender's IP address, kept 30 days to stop spam | No |
| Contact Info → Email Address (again) | **Only if the person signs in** (Apple's relay address, Google or the address they type for an email code) | Yes |
| Identifiers → User ID | **Only if the person signs in**: the account's ID | Yes |
| User Content → Other User Content (now linked) | **Only if the person signs in**: what they choose to sync (saved meals and recipes, shopping list, favourites, comparison list) | Yes |
| Health & Fitness → Health | **Only if the person signs in**: synced goal, targets, diet and allergy choices and today's log entries (see below) | Yes |
| Identifiers → User ID (Community) | **Only if the person uses Community**: the username they choose (shown to their friends) and their friend code | Yes |
| User Content → Other User Content (Community) | **Only if the person uses Community**: friends and requests, blocks, the shopping lists sent between friends (product references and typed words, no prices; 30 days) and reports | Yes |

- Purpose for all of the above: App Functionality.
- Location: **not collected** (used on the phone only to sort nearby branches; a typed postcode goes to postcodes.io for the lookup and
  isn't kept by us). Camera: not collected (barcodes are read on the phone).
- Purchases: none in this version. Apple Health: not used.
- **Reminders (Home › Reminders, added 16 October 2026): nothing collected, so no new row and no change to `PrivacyInfo.xcprivacy`.** A person's
  reminders (the name and optional note they type, the days, the time and which day they last ticked it done) can be about medication, but they are
  kept only on the phone: never sent to us or anyone else, never synced even when signed in (docs/ACCOUNTS_SYNC.md), not in analytics (there is none)
  and not used for tracking. They ring as **local** notifications scheduled by iOS on the phone: no Push Notifications capability, no device token and
  no server involved, so there is nothing to declare under "Identifiers" or "Health". Keep it that way: if reminders ever sync or a push server is
  added, this table, the privacy manifest and the website privacy policy change first (and "Health" then covers reminders too).
- **Sign-in (optional, docs/ACCOUNTS_SYNC.md):** the four rows marked "only if the person signs in" are why the manifest changed on 13 October
  2026. "Health" is declared because the synced goal (which can be a GLP-1 goal), calorie and protein targets, allergies and logged meals are
  health-related information the person typed in; it is the cautious answer, so confirm it in App Store Connect before submitting (Apple's
  definition of Health data decides whether it is needed). Used for App Functionality only; never for tracking, advertising or analytics.
- **Community (added 16 October 2026, docs/BACKEND.md "Community"):** the two Community rows are the same two data types the sign-in rows already declare ("Identifiers →
  User ID" covers a username or screen name; "Other User Content"), so `PrivacyInfo.xcprivacy` needs **no change**; they are only used when a person signs in AND uses Community.
  Linked to the person, App Functionality only, never tracking. A person's email address is never shown to anyone else. The Community data is deleted by Delete my account, EXCEPT reports: a report
  (both usernames, the reason, the note and, for a list, the list and its typed words) is kept, with the account's ID taken out, so that deleting an account can't wipe a report about it; closed ones are deleted a year after they were made.
  The server also keeps a short tally per account (friend codes tried, lists sent, reports made; no content) for 2 days, and a declined friend request for 30 days, to stop abuse; both go with the account.
  The phone keeps a cleared-on-sign-out copy of the last friend list and inbox (nothing for the questionnaire: it stays on the device).
- Account deletion is inside the app (Settings › Account › Delete my account), as App Review guideline 5.1.1(v) requires; Sign in with Apple is
  offered next to Google (guideline 4.8).
- If anything is added (crash reporting, analytics, Pro, the AI recipe maker), update this table, the privacy manifest and the website
  privacy policy first.

## Age rating

Answer the questionnaire honestly. Notes: no violence, no web browsing (links open Safari). **User-to-user content (Community, 16 October 2026): very limited.** There is no chat,
no posting, no comments, no photos and no public profiles; the only things a person writes that another person sees are a **username** and the **words typed into a shopping list sent to a
friend** (and only a friend, by a code the receiver shared). Where the questionnaire asks about user-generated content or messaging, answer for exactly that (a limited form of
user-generated content, and no chat). Guideline 1.2 is met in the app: usernames are filtered (reserved names and a blocklist, also disguised), a list's typed words are screened,
and **Report and Block are in the app** on every friend, every request and every list received (the founder to confirm the questionnaire's wording when answering). Apple's definitions
(App Review 2.3.6): **Health or Wellness Topics: Frequent** (calorie tracking and dieting advice count, and the app is about little else);
**Medical or Treatment Information: Infrequent** (the GLP-1 goal mentions a medicine class, and every number comes with "not medical advice");
**Alcohol, Tobacco or Drug Use or References: Infrequent/Mild** (a few pub and restaurant menus list cocktails or ciders by name; alcohol is
never added to the supermarket lists); everything else None. Expect a rating of about 13+; do not answer lower to look better. A tester counted about **450 alcoholic items in 23 restaurant and pub menus**
(searching "vodka" or "beer" finds them, each with its calories): keep the alcohol answer honest, and note that the supermarket lists are meant to
have none (the founder's rule of 11 October) but a few real alcohol products remain in Iceland's list (an alcoholic cherryade, vodka mixes, a
Pinot Grigio, cream liqueurs): a data-cleaning job in `tools/groceries/build_groceries.py` (`is_alcohol`), not done.

**Reminders and the "Medical or Treatment Information" question (added 16 October 2026; founder to confirm before submitting).** Home now has a
Reminders section where a person can set a reminder for anything, including medication (the founder's reason: people on a GLP-1 medicine need to
know when to take theirs). What the Reminders feature itself holds: no drug or brand names anywhere in Reminders, no doses, no advice on when to take anything or whether with
food, no check that a dose was taken, no "missed" or "late" labels, no streaks or scores. The person types every name and note, and it stays on
their phone. So the app still **provides** no medical or treatment information; it is a clock the person sets. Even so, a reviewer (or a parent
reading the rating) can fairly see a feature meant for medication reminders as related to treatment. **Recommended answers: keep Medical or
Treatment Information at Infrequent** (the same answer as for the GLP-1 goal line, and in the same spirit as the note above: do not answer None to look
better) and keep Health or Wellness Topics at Frequent. Expect the rating to stay about 13+; check the rating App Store Connect shows after answering,
and if the questionnaire's own wording for the medical question covers apps that help someone follow a treatment plan, choose the higher answer.
- **App Review Guideline 1.4.1** (as we read the guidelines of 8 June 2026: medical apps that could be used for diagnosing or treating get
  greater scrutiny, and apps should remind people to check with a doctor before making medical decisions; read the current wording before
  submitting). Numbite measures and calculates nothing medical, so it is not that kind of app, but it follows the expectation anyway: the add-a-reminder
  sheet and the Reminders page both say "Numbite rings at the times you choose, but a reminder may not appear if notifications are off or silenced, so
  don't rely on it alone. Follow the advice of your doctor or pharmacist about any medication." (new wording of 16 October, after the review found the first
  one read as a promise; the website's add sheet also says reminders ring only in the iPhone app), and the terms say it is not a medical device and that the
  person is responsible for their medication.
- **Guideline 4.5.4 (notifications)**, as we read it: the permission is asked only when the person saves their first reminder (never at launch), the
  app works fully without it, nothing is sent except what the person set up (no promotions, ever), and the lock-screen text is only what they typed
  (the add sheet says "The name and the note you type show on your lock screen." under both boxes; they control previews in the iPhone's Settings).

## URLs for App Store Connect

- Privacy Policy URL: `https://numbite.com/privacy`
- Support URL: `https://numbite.com/support`
- Marketing URL: `https://numbite.com`

(numbite.com was bought on Vercel on 12 October 2026 and is live on Vercel Pro; `menumacros.vercel.app` stays as an alias.)

## Notes for App Review (draft; replaced 14 October 2026 after an internal guideline review)

"Numbite works without an account and every feature is free. Signing in is optional and only turns on sync across the person's devices: use
Sign in with Apple with any Apple ID, or 'Continue with email' (a 6-digit code is sent to the address). Settings > Account has Sign out and
Delete my account (for an Apple sign-in it asks Apple to confirm and then revokes the Apple token).

Community (the fifth tab): the food articles need no account. Friends and Shared with you need one (Sign in with Apple, or 'Continue with email'),
so that a shopping list can be sent to a friend. A person chooses a username once (reserved names and offensive words are refused) and gets a friend
code; they add a friend by typing the friend's code or opening the friend's invite link (there is no search for people and no email address is ever
shown). The only user content is the username and the shopping lists friends send each other (references to products, plus any words typed in, checked
for offensive words). Guideline 1.2: the app has (1) a filter for objectionable material: usernames are checked against reserved names and a word list (also when disguised with look-alike
letters or separators) and the words typed into a shared list against a shorter list; it is a small list, not a promise, so (2) on every friend, friend request and received list there are
Report and Block (Community > Friends: the three dots next to a name; Community > Shared with you: open a list > Report or block; the person reported or blocked is never told) and those carry the real load;
(3) a report goes to us, is checked every day and acted on within 24 hours [Founder: only keep this sentence if you will check `open_community_reports` daily; set the optional alert variables in docs/BACKEND.md so a count is emailed to you each day while a report is open]: we remove the offending username or list and the account, and
stop the same sign-in making another; (4) our contact details are at https://numbite.com/support and in the privacy policy, and the Terms (agreed when a username is chosen) say that offensive or abusive content is not tolerated. To try it you need two accounts (two Apple IDs, or two email
addresses): one shows its friend code under Community > Friends, the other types it under 'Add a friend', the first accepts, then 'Send to a friend' on
the Shopping list puts the list in the other's Shared with you. [Founder: add two demo accounts here if you want review to be quick.]

Why this is an app and not a website: all menus, products, recipes and photos are packed inside the app, so it works with Airplane Mode on.
It uses the iPhone itself for Groceries > Scan a barcode (VisionKit, camera, nothing leaves the phone), Eat out > Near me > Use my location (one
system prompt; a typed postcode works instead), the share sheet for the shopping list, local notifications for the reminders the person sets on Home, and Sign in with Apple. The only things fetched online
are newer menus and the optional account and sync.

Restaurant and shop names (and any logos or pictures shown) only identify whose published nutrition information is listed; the app says it
is not affiliated with any of them, and we remove anything on request, without an app update. Numbers come from each chain's own published
data with the source and date shown; allergen information says 'check with staff'. The app gives no medical advice (stated in the app and the
terms), warns when a calorie target is very low, and the GLP-1 goal says to follow a doctor's or pharmacist's advice.

Reminders (Home > Reminders, the + button): the person types their own reminder (any name, an optional short note, the days and the time) and the
iPhone shows it as a local notification at that time. To try it, add a reminder a minute ahead and allow notifications when asked (the permission is
asked only when the first reminder is saved, never at launch). Every word is the person's own: the Reminders feature contains no medicine names, suggests no
medicine, dose or time, never says a reminder was missed or late, and has no streaks or scores. Both the add sheet and the Reminders page say
'Numbite rings at the times you choose, but a reminder may not appear if notifications are off or silenced, so don't rely on it alone. Follow the advice of your doctor or pharmacist about any medication.' (guideline 1.4.1) and the
terms say it is not a medical device. Reminders stay on the phone: they are not sent to us, not synced even when signed in, and the app uses no push
server or remote notifications."

## Release checklist (free launch)

- [ ] Decide which supermarkets the App Store version includes (web/app-content.json; food photos are in): see docs/APP_BUILD.md
- [x] Domain: numbite.com (bought 12 October 2026, on Vercel, in the founder's name)
- [x] Vercel Pro (12 October 2026)
- [ ] Support email on the domain (forwarding); /privacy, /terms and /support read and true
- [ ] Optional: numbite.co.uk at a UK registrar, redirected to numbite.com
- [ ] UK trade mark search for "Numbite" (gov.uk "Search for a trade mark"), and consider filing it (classes 9 and 42)
- [ ] `./scripts/build_app_web.sh` (it talks to https://numbite.com by default), then build in Xcode
- [ ] Mac session: build, unit and UI tests, simulator check in airplane mode (docs/APP_BUILD.md "Checks before TestFlight")
- [ ] App Store Connect: app record "Numbite: Calories & Protein", bundle `com.amanmarwaha.MenuMacros`, price Free, UK availability
- [ ] App Privacy form and age rating from the sections above; screenshots from `web/e2e/store-shots.mjs`
- [ ] Archive and upload from Xcode; TestFlight on your own iPhone (scanner, Near me, share, offline, a reminder set a minute ahead)
- [ ] Submit; release manually
