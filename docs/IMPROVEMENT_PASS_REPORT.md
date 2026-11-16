RESULT: safe to merge once the founder has approved the new copy below. Every failure left in the browser tests also fails on a clean `main` (ca8d8a5) and is not caused by this branch.
BRANCH AND COMMIT: `improvement-pass-b` at 5ea7fc1 (all fixes and tests); this report is the one commit on top of it, pushed together.
REMAINING FAILURES (3 browser steps, all also failing on clean main): mapfs "going full screen and back asks for nothing" (page prefetches), community-friends offline step (test data dated 16 Oct is past the 30-day limit), offline "client navigation Home → Eat out → chain" (known since 14 Nov).
DECISIONS MADE FOR THE FOUNDER: finding 6: a recipe of ours that the diet leaves out stays hidden, with its own new sentence; finding 7: only the "Served Mojito 8% ABV" row was taken off Sainsbury's list, and the 350 unpublished nutrition rows stay unpublished (details and how to switch below).
NOT VERIFIED HERE: the Swift tests, Xcode and a real iPhone (no Mac in this cloud session); Safari/WebKit and VoiceOver (Chromium only); a real Supabase or Vercel.
EXACT BRANCH NAME: improvement-pass-b

# Improvement pass: finished (report for the Claude desktop session)

Written 16 November 2026 by a Claude Code cloud session. The brief: finish the improvement pass of 29 October (`claude/menumacros-kit`, commit 62114fe) on a new branch
`improvement-pass-b`, merge `main` into it, fix the 19 findings in `docs/IMPROVEMENT_PASS_REVIEW.md`, run every check, and report. Nothing was merged into `main`,
nothing was force-pushed, no database, Supabase, Vercel, Stripe, DNS or secret was touched, no npm dependency was added, and `docs/PROGRESS.md` was not edited.
**Pushes: two in total**, as the desktop session asked (each push makes Vercel build a Preview): the merge (3522951), then everything else at the end.

## 1. The merge of `main`

`main` at ca8d8a5 (the 1.4.1 sources fix, build 4, the viral upgrade and the paid-access plumbing, all off by default) merged cleanly except four files, resolved by hand
(merge commit 3522951, its message lists each):
- `web/app/app/settings/page.tsx`: main's config imports (`GATING_ENABLED`, `WEB_PRO_ENABLED`) with the pass's `parseNumber`; main's "Where these numbers come from" link kept
  above the pass's low-calories caution (which reads "2,000" as two thousand).
- `web/e2e/app-build.mjs`: one `readFileSync` import (both sides added it); the pass's welcome-wall step (no Co-op or Ocado, "9 supermarkets") plus main's "logos load from
  inside the app" check.
- `web/e2e/extra.mjs`: both sides' new steps kept.
- `web/lib/mm/locales/keys.json`: regenerated (`WRITE_I18N=1 npx vitest run tests/i18n.test.ts`).

## 2. The 19 findings

| # | What was wrong | What was done |
|---|---|---|
| 1 | Today's empty state shows "Add food" (copy logged for Home on 14 Oct, new use here) | **Kept**, listed for approval below. To remove it: delete the `action={…}` on the "Nothing logged yet today" `EmptyState` in `web/app/app/today/page.tsx`. |
| 2, 8 | keys.json not regenerated | Regenerated after the merge and after the new sentence; `tests/i18n.test.ts` passes. |
| 3, 11 | Clear everything kept `mm.eatOutChoices` and `mm.chainView` | Both removed by Settings › Clear data › Clear everything (`web/app/app/settings/page.tsx`). |
| 4, 11 | A Halal setting turned on later in Settings was ignored on Eat out once anything was stored for the tab | Eat out now stores the saved Halal setting with its choices; if the setting has changed since, the setting wins again (the row opens when it is turned on); other choices are kept (`eat-out/eatOutChoices.ts`, 5 unit tests). |
| 5, 9 | addfood.mjs failed in Playwright's strict mode (the toast's words are on the page twice: the status line and the pill) | All ten toast checks read the status line (`getByRole("status").filter(…)`). |
| 6 | A recipe of ours left out by the diet said "That recipe isn't saved on this device, or no longer suits your diet." (the first half is false) | **Decision, see section 3.** |
| 7, 15 | Sainsbury's "Served Mojito 8% ABV" still published (no-alcohol rule of 11 Oct) | **Decision, see section 3.** Plus a test that no published shop list holds an alcoholic drink; it found one more (Asda, below). |
| 10 | sharelist.mjs used `getByLabel("Quantity 2")` | Already fixed by hand before the WIP commit; sharelist.mjs passes 11 of 11. |
| 12 | "Search every shop" took a saved Co-op as the default shop | Uses `listedShops(...)` like the other screens (`groceries/search/SearchScreen.tsx`). |
| 13 | The Undo pill could stay for ever when the same toast key came back | A new toast, or the same key back again, always starts unheld (`_components/UndoToast.tsx`). |
| 14 | Tabs didn't remember filters kept in the address (Recipes' tiles, a shop list's aisle and sort) | The app announces each address it writes into the history (`_lib/backNav.ts` `ADDRESS_EVENT`), and AppShell remembers it (and on popstate). New browser step in tabs.mjs. |
| 16 | Keyboard, switch and screen-reader users couldn't reach Undo before it went | When the control that had the keyboard focus disappeared with the action ("−" at quantity 1, Clear, Delete), **Undo gets the focus** (and the pill waits while it has it); a second Enter within 0.7 s does nothing; after Undo, or when the pill goes, the focus moves to the page's heading. Not done for Log (My meals) and "Log a serving", whose button stays: moving the focus there would make a second Enter undo instead of logging again; those entries can be deleted on Today. New browser step in listadd.mjs. |
| 17 | My meals: a second tap on Log could land on Undo | The toast goes to the other end of the screen when the control just used sits where it would be; an Undo pressed at the spot of that tap within 0.7 s does nothing (`lib/mm/toastPlace.ts`, 8 unit tests; browser step in extra.mjs). |
| 18 | A recipe's "Logged to Today." Undo sat on the picture's Save pill | It now sits above the recipe's "Add all to my shopping list" bar, or (when "Log a serving" itself is there) at the top below the picture's Back and Save pills. recipes.mjs checks it overlaps none of them. |
| 19 | The same words twice ("Logged to Today." for a second serving) were not read again | Two status lines take turns, so each new toast is a change a screen reader announces; the visible words come in again too. Browser step in extra.mjs. |

**Found on the way and fixed:**
- **Chain page:** the floating "Best for you" shortcut never appeared after a jump straight from below the Best for you card to above it (a section chip, with "Recently
  viewed" pushing the card below the fold). The scroll watcher only noticed the card entering or leaving the screen, so a jump past it was missed. It now counts the screen
  as reaching all the way down (`chain/ChainScreen.tsx` `useScrolledPast`). The same code is on `main`: there it shows only once a person has viewed dishes.
- **Asda: "Archers and Lemonade Ready to Drink 250ml"** (an Archers schnapps premix) was published although alcohol is out (rule of 11 Oct): Asda files it under "Premixed
  Spirits & Mixers", and the aisle rule spares that aisle for its mixers. `is_alcohol` now knows Archers as a spirit brand (with a test case), and Asda's list was rebuilt by
  `build_all_products.py --only asda`: the only change is that one row (10,523 → 10,522). To undo: drop `|archers` from `SPIRIT_BRAND` in `tools/groceries/build_groceries.py`,
  then rerun `python3 tools/groceries/build_all_products.py --only asda`.
- **Browser tests out of date with `main` or with this pass** (test fixes only): numbers.mjs (main's Quick answers pill also says "35 g+ protein"; and a race with the
  numbers file), addfood.mjs (three more toast checks), browse.mjs (the search results, not the Recently viewed rows), recipes.mjs (finding 18's new place, finding 6's sentence).

## 3. Decisions made for the founder (findings 6 and 7)

**Finding 6: a recipe of ours that the person's diet leaves out.** Chosen: it stays hidden (as the pass made it, and as the recipe list already does), with its own sentence:
**"This recipe doesn't fit your diet settings, going by its ingredients."** (worded like the approved grocery sentence "This product doesn't fit your diet settings, going by its
name, type and label."). The old sentence stays only for recipes saved on this device (`?mine=`). Why: on `main` such a recipe was shown as written, beef and all, to a vegan who
opened a link or bookmark (the kind of "diet settings ignored" the founder objected to on 11 Oct), and the pass's version said something false.
- Alternative A, the reviewer's words "This recipe doesn't suit your diet settings.": change the string in `BOOK_RECIPE_LEFT_OUT` (`web/app/app/recipes/view/RecipeScreen.tsx`),
  run `cd web && WRITE_I18N=1 npx vitest run tests/i18n.test.ts`, and change the expected text in `web/e2e/recipes.mjs`.
- Alternative B, `main`'s old behaviour (show the recipe as written whatever the diet): in the same file change `recipeForDiet(base, diet)` to `recipeForDiet(base, diet) ?? base`.

**Finding 7: "Served Mojito 8% ABV" in Sainsbury's list.** Chosen: only that one row was taken out of the published `web/public/groceries/all/sainsburys.json` (every other byte is as
published before; `all-manifest.json` count, priced and sha256 updated: 15,310 → 15,309 products, 12,712 with nutrition, unchanged). Why: a full rebuild of Sainsbury's would also
publish 350 nutrition rows that sit unpublished in `data/groceries/nutrition/sainsburys.csv` (302 products would gain figures and **48 products already shown would get different
figures**), which nobody has reviewed. The no-alcohol rule is the founder's settled decision; the 350 rows are not.
- Alternative: publish them too: `python3 tools/groceries/build_all_products.py --only sainsburys` (it also drops the Mojito by itself). **Whoever next rebuilds Sainsbury's for any
  reason publishes those 350 rows**, so decide before then. A new Python test (`test_no_published_shop_list_holds_an_alcoholic_drink`) fails if any published list holds alcohol.

## 4. New or changed on-screen sentences (rule 8: for the founder's approval; English only)

From the improvement pass (29 Oct), unchanged here: "Shopping list cleared.", "Removed “{name}”.", "Recently added", "Log a serving", "Add to today", "Added to today.",
"Last 7 days", "Average a day: {kcal}", "Average a day: {kcal} · {protein} protein", "From 1 day with food logged.", "From {n} days with food logged.", "Add food" (Today's
empty state; finding 1), "Add a photo", "Change photo", "Remove photo", "Page not found", "This page doesn't exist or has moved.", and the hint under "No restaurant has a dish
that fits all of that", which now names only what was asked for: "Try {a}.", "Try {a} or {b}.", "Try {a}, {b} or {c}.", "Try {a}, {b}, {c} or {d}.", "Try {a}, {b}, {c}, {d} or {e}."
with the pieces "a higher calorie limit", "a lower protein", "a higher carbs limit", "a higher fat limit", "fewer allergies", and "Try another type of restaurant, or change your
diet in Settings." when none was asked for. No longer used: "Try a higher calorie limit, a lower protein or fewer allergies."

Added in this session: **"This recipe doesn't fit your diet settings, going by its ingredients."** (finding 6).

Behaviour without new words: where the Undo pill sits, the focus moving to Undo and then to the page's heading, a quick second press on Undo being ignored.

## 5. Checks run (one heavy command at a time, on production builds)

- **Types and lint:** `npx tsc --noEmit -p .` 0 errors (after `next typegen`); `npx eslint app lib tests` 0 problems.
- **Unit tests:** `npx vitest run` 1,791 passed, 20 skipped, 0 failed (97 files; new: `tests/toastPlace.test.ts`, more in `tests/eatOutChoices.test.ts`).
- **Python:** `python3 -m unittest discover -s tools/tests` 218 passed; `tools/build_menus.py` and `tools/reference_ranking.py --check` pass.
- **`npm run build`** (sample data and Pro on, as the e2e README says) passes; so do the production default build (no sample data, no Pro) and the paid-access build.
- **Browser suites** (Chromium 1243, headless). Test build (`NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1`), final results after the fixes:

| Suite | Result | | Suite | Result |
|---|---|---|---|---|
| smoke | 26/26 | | listphotos | 11/11 |
| extra | 17/17 | | listadd | 11/11 |
| a11y | 0 violations (light and dark) | | water | 13/13 |
| largetext | no overflow at 100/150/200% | | community-friends | 25/26 (pre-existing, below) |
| share | 1080×1350 PNG | | reminders | 26/26 |
| browse | 12/12 | | community | 10/10 |
| calories | 4/4 | | map | 7/7 |
| firstvisit | 8/8 | | mapfs | 18/19 (pre-existing, below) |
| truth | 13/13 | | groceries-photos | 4/4 |
| seo | 9/9 | | groceries | 7/7 |
| protein | 5/5 | | groceries-all | 11/11 |
| onboarding-body | 23/23 | | groceries-compare | 11/11 |
| numbers | 13/13 | | compare | 4/4 |
| done | 13/13 | | diet | 7/7 |
| addfood | 16/16 | | days | 12/12 |
| recipes | 20/20 | | favnote | 4/4 |
| scan | 8/8 | | sharelist | 11/11 |
| tabs | 5/5 | | languages | 3/3 |
| account | 8/8 | | back | 42/42 |
| back-restaurants | 14/14 | | offline | 14/15 (pre-existing, below) |

  Production default: **prodmode 9/9** (no Pro, payment, subscription or AI wording on any screen or legal page). Paid-access build: **pay 15/15**.
  Last, the iPhone app's copy, built with `NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk ./scripts/build_app_web.sh` (it runs `npm run build:app` with the version read from
  the Xcode project, "1.0 (4)"; 159.2 MB packed): **app-build 11/11**. (A plain `npm run build:app` makes 2 of its steps fail only because that skips the script's version;
  the packed copy in `MenuMacros/Resources/WebApp.bundle` is git-ignored.)

**The three failures left, each also failing on a clean `main` (ca8d8a5, built and run the same way in this session unless said):**
1. `mapfs.mjs` "privacy and network: the position never leaves the phone; going full screen and back asks for nothing": on main
   `going full screen and back made 5 request(s): http://localhost:3105/app/chain?id=kfc&_rsc=VjZukLfkpBqoEwA8, http://localhost:3105/app/chain?id=greggs&_rsc=VjZukLfkpBqoEwA8, http://localhost:3105/app/chain?id=kfc&_rsc=5RPJKW1jrYUv0Q5Z`
   (6 on this branch, the same kind). They are Next.js prefetches of restaurant pages listed under the map when the page comes back into view; none carries a position.
   The step's expectation needs a decision (allow same-site page prefetches, or turn prefetch off on those links), not this branch.
2. `community-friends.mjs` "offline shows what was here last time, with a note; …": on main and here
   `locator.waitFor: Timeout 30000ms exceeded. … waiting for locator('main a[href^="/app/community/inbox/view?id="]').first() to be visible` (the offline part). The test's
   shared list is dated 16 October, so today (16 November) it is past the 30-day limit, and the app rightly leaves it out of the offline copy. Date rot in the test.
3. `offline.mjs` "OFFLINE: client navigation Home → Eat out → chain works":
   `TimeoutError: locator.waitFor: Timeout 10000ms exceeded. url: http://localhost:3101/app/chain?id=kfc | h1: ["KFC"] | body: You're offline. Menus you've opened still work. Back KFC …`
   (the KFC page is showing). Not re-run on main in this session; docs/PROGRESS.md's 14 November entry records it failing the same way on a clean `main`.

## 6. What could not be verified here

- `./scripts/test.sh --unit` as a whole, because its Swift part needs Xcode. Its pipeline, data and website parts were run on their own (above). No Swift changed in this pass.
- A real iPhone and WebKit: the toast's placement, the focus moving to Undo, the two status lines with VoiceOver, and how iOS VoiceOver's double tap is told apart from a finger tap
  (an activation with no pointer counts as "not a tap", so Undo would get the focus when the focused control went away). Worth a VoiceOver check on the phone before release.
- Nothing about Supabase, Vercel, Stripe or App Store Connect (out of scope and not touched).

## 7. Before merging (for the desktop session and the founder)

1. Approve or change the copy in section 4, and the two decisions in section 3.
2. Write the `docs/PROGRESS.md` entry from this report (this session did not edit it, as asked).
3. Merge with the founder's go-ahead; then a new build number (5) for the iPhone app, as `HANDOVER.md` says.

PUSHED 5ea7fc1
