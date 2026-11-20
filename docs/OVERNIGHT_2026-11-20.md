# Overnight 20 November 2026: plan and queue

Kept in the repo so nothing is lost if the session's scratchpad is cleared. Updated through the night; the morning report is docs/MORNING_REPORT_2026-11-20.md.

## The plan

# Overnight plan (founder 20 Nov ~01:35, asleep until 09:00 UK): "have a meeting with around like 30 people and go through the entire app, how everything looks,
# the design, checking if everything's working ... fix any things and sort everything out ... when I wake up, we have the final version ready to submit to the App
# Store. And of course all the payment stuff works ... make the app the most robust and the best design".
# Boundaries: never upload/submit to App Store Connect (1.1 build 7 is in review), never deploy numbite.com, never push main, never supabase db push, no money.
# Decisions the founder delegated tonight ("do whatever you think"): Home pages -> 2 (Today + This week; drop sugar/salt/fibre page); new diets behind "More diets";
# Pip audit as listed; GLP-1: do NOT change the founder's phone data, but the plan screen explains the cap.
Stages:
 1. Let running jobs finish: wave 2 (w67wcvbkp), onboarding redesign meeting (w505jo7e2), breakfast recipes agent. Commit wave 2 after tests.
 2. After-wave-2 list (after-wave2.md items 1-9) + Home 2 pages + build the onboarding redesign conclusion. Commit.
 3. Breakfast pictures (Higgsfield GPT Image 2.6, medium, 1k, 4:3, existing colourful style; check each by eye). Commit.
 4. 30-person whole-app audit workflow: each person owns an area (screens, flows, payments/IAP, data honesty, accessibility, performance, copy, App Store
    readiness, privacy, offline, sign-in...), finds problems with evidence (screenshots, tests), adversarial verify, then fix teams (disjoint files), re-test. Loop.
 5. Payments: StoreKit test in the iOS Simulator (products load, trial, purchase, restore, entitlement to the server), unit + e2e iap.
 6. Final: full unit tests, all e2e, a11y, largetext, next build, pack the app, Release archive (not uploaded), install on the iPhone if unlocked,
    docs/PROGRESS.md + PROGRESS_LOG.md, morning report (scratchpad + docs/MORNING_REPORT_2026-11-20.md).

## Queue after the second wave

# To do the moment wave 2 finishes (founder 20 Nov)
1. Pip audit ("keep him as the guide, not the decoration"; founder: "Yeah, do that for me"):
   REMOVE: recipes/page.tsx Recipes header Pip avatar (~264); plan/page.tsx week money card Pip (~980); scan/page.tsx start screen big Pip (~203, keep the words);
           search/page.tsx PipSays hint (~104) -> plain text; groceries/list/recipes/page.tsx PipSays intro (~112) -> plain text.
   CALM: PremiumOffer.tsx cheer -> wave; SignIn.tsx SigningIn cheer -> wave.
   KEEP: welcome/*, Tour, CoachMarks, SignInScreen, settings "Set up your plan again", empty states (favourites, today day, MyRecipes, RestaurantMeals), error.tsx,
         AI features (plan questions + working, Ask Pip card, recipe maker working, fridge, make, photo, PhotoCamera, PipsPick).
2. Home header: Shopping list + cog on the date's line at the top right at 375-430 px with a 2-3 digit count (founder: "Take that in the top right"); e2e check.
3. Founder asked (opinion): drop page 3 (sugar, salt, fibre)? Asked "Want me to drop it?" - no answer yet: do NOT drop without a yes.
4. Tesco reader: blocked by the auto-mode classifier on `python3 tools/groceries/labels_chrome_next.py tesco --install`; founder to allow (permission rule or leave auto mode). Don't work round it.
5. Premium entry points (founder 20 Nov: "those features should have like the word Pro over them, and when the person presses those features, then the Pro thing
   launches up ... or if they haven't claimed Pro yet, the free trial would come up"): every Premium feature (Scan your food, Make it at home, Cook with what you
   have, Meal plan, Ask Pip recipe, Best for you, any other needsPaywall feature) shows the one Premium badge while not Premium (gating on); a tap opens the
   paywall with StoreKit's price (£4.99/month, £49.99/year as submitted); trial unclaimed -> the trial offer first (O5). Badge says "Premium" (approved name;
   founder said "Pro" casually: told them, change only if they ask). Audit all gate()/showPaywall callers; e2e check.
6. Every recipe has a price (founder 20 Nov, screenshot of "Bacon and egg breakfast wraps" with no price): recipes priced a serving today: Sainsbury's,
   Morrisons, Waitrose, M&S, Tesco all; Asda 100/115; Iceland 70/123; Aldi 2/31 (scratchpad price-gaps.txt). Causes: items sold "each" with no weight
   (Asda salad tomatoes, Iceland spring onions, lettuce, naan) and Aldi products with no size and no unit price at all.
   (a) lib/mm/pantry.ts: add pieceGrams (and pieceName) for tomatoes, spring onions (a bunch), lettuce, naan, cherry tomatoes etc. (prices only; never nutrition).
   (b) recipe cards (and the recipe page): when costPerServing is null, show the basket price "£x to buy" (real shelf prices) so no card is without a price.
   (c) later, separate: Aldi pack sizes from its product pages (a reader job) for true per-serving prices.
   Re-run the price-gap script after; update recipeShops snapshot if it pins prices.
7. Meal plan sizes (founder 20 Nov: "clearly they all have to be ... 3,400 divided by 3"): DONE in lib (slotTargets equal split, no 1,200 ceiling, capShortfall;
   tests pass). UI still to do in plan/page.tsx: when capShortfall > 0 (GLP-1 meal cap), say so under "Each day:" ("Your goal is 'I'm on a GLP-1 medication', so
   I keep each meal to {cap} kcal: your meals come to {sum} of your {daily} kcal. Change it in Settings.") with a link, and Pip's "your day adds up" line must not
   show then. The founder's phone has goal = GLP-1 (cap 450): asked whether intended.
8. New diets (founder 20 Nov: "cater to every single diet"): DONE in lib (pantry tags from the shops' ingredient lists, kindExcluded rules, kosher meat+dairy check,
   user-data sanitize, types, Pip's prompt words, zod in the 3 API handlers; tests/diets.test.ts 7/7). UI still to do: DietPicker gains Jain, No onion or garlic,
   Kosher style, No red meat, No alcohol, No halal or kosher meat (grouped plainly; hints: kosher "We can't check certification"); household: the home's diet becomes
   the full DietPicker set (household.ts HomeMeat -> diet keys; homeDiet merges; sanitize; saved plan home snapshot); restaurant pages/menu filter: an honest
   "Restaurant dishes aren't checked for {diets}: menus don't list ingredients" note when any of the new six is on; foodDiet product checks: say "not checked for"
   the new diets; onboarding avoid step; i18n keys. The AI recipe API only uses the new diets once numbinte.com is deployed (zod).
9. "Making your plan" (founder 20 Nov: "think for longer during this, maybe like 20 seconds or so. Or maybe even 30 ... Whatever you think"): plan/page.tsx
   MAKING_STEP_MS 1400 -> 2800 (7 steps, about 20 s); Pip's line can say "This takes about 20 seconds."? (keep words as are unless needed); reduced motion: same
   time, no animation; e2e mealplan/household waits must allow it (they may wait for the week heading: raise timeouts). Log under rule 8.
