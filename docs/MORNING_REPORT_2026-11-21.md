# Morning report, 21 November 2026

## Done

**Build 11 is submitted for App Review (06:06).** It replaced build 10, which I took out of review. In review now: version 1.1 with build 11, the Annual and Monthly plans and the Numbite Premium group ("4 Items Submitted"). Release is set to manual, so nothing goes live until you press Release. Build 11 is also in your TestFlight. In App Store Connect I corrected:
- **What's New:** no 90-day pass, and "one free week per person and iPhone".
- **Description:** "Your first 7 days of Premium are free (one free week per person and iPhone)…", and the Top 5 picks are now "at chains that publish protein", not "every chain".
- **Notes for App Review:** the In-App Purchase paragraph.

**The 30-agent meeting.** The full record is in docs/MEETING_2026-11-21.md.
- **Who:** 30 named reviewers (Ada to Dina), chairs Morgan and Riya, and Noor the tester.
- **Findings:** 217 (1 blocker, 39 high).
- **Fixes:** 188 (124 in the first pass, 64 in the second).

The most important fixes:
- **Accounts:** Cancel on Apple's confirm sheet no longer deletes the account.
- **Recipes tab:** it no longer gets stuck on one recipe.
- **Scanning:** about 1 scan in 10 no longer dead-ends.
- **Allergies:** shop product pages now warn about yours.
- **Halal:** no longer offers pork or alcohol.
- **Recipe matching:** recipes no longer pick feta for dried oregano, cooked chicken, or the wrong tins.
- **Freezes:** Choose a recipe and the shopping list no longer freeze.
- **Meal plan:** "Added to dinner" no longer adds the meal twice.

**Recipes for more shops.** The founder's approved rule now applies: liquids labelled per 100 g count by weight. Also new tonight:
- Aldi's "per 100" labels are read.
- Fresh garlic stands in where a shop sells no purée.
- Aldi's pack sizes were read from its own pages.
- 40 new everyday lunches and dinners that six big shops can all make.

| Shop | Recipes before | Now |
|---|---|---|
| Sainsbury's | 293 | 333 |
| Morrisons | 289 | 329 |
| Iceland | 228 | 285 |
| Waitrose | 240 | 280 |
| Asda | 218 | 262 |
| M&S | 31 | **161** |
| Aldi | 63 | **115** (full meal plans now) |
| Tesco | 4 | 3 |

**Pictures:** all 333 recipes have one. The 40 new pictures used 41 Higgsfield credits (2,835.5 left).

**Barcode from a photo.** It's a new choice in Add food, plus "Choose a photo" on every scan screen. The photo is read on the phone and never sent anywhere.

**Portions after a scan.** Choose a measure:
- **Drinks:** ml, the pack, glass 250 ml, can 330 ml, pint 568 ml, tablespoon or teaspoon.
- **Food:** g, the serving, the pack or oz.

Then tap ½, 1 or 2. It shows what gets logged ("= 500 ml").

**DeviceCheck** is live on numbite.com, so each iPhone gets one free week. The free-week tables exist in Supabase.

**Tests before submitting:** all green.
- **Type check and lint:** clean.
- **Unit tests:** 3,974.
- **Python tests:** 257.
- **Swift unit tests:** pass.
- **Browser tests:** 20 suites, including the new photo/measures test, scan to diary, Add food, Recipes, Meal plan, lists, Groceries and the welcome screens. The failures on the first run were tests that hadn't caught up with recorded changes; no app bug was found.

## Not done, or can't be done yet

- **Tesco:** blocked again at 05:27, so no reader before 11:27. Its list has no cupboard aisle, so it can't have recipes yet.
- **Lidl:** publishes no nutrition online.
- **Co-op:** has no prices in the app.
- **numbite.com is not redeployed.** Tonight's server fixes (sign-in, barcode lookup, the scan route, the privacy page) are on `iap` only, and deploying needs your go-ahead.

## Your decisions (from the meeting, each explained in the record)

1. Home's meal split 25/35/40 versus the meal plan's equal meals.
2. Breakfast dishes in lunch and dinner Best for you picks.
3. Dishes named vegan counting as vegetarian.
4. Following the iPhone's Larger Text setting.
5. Wording for buying during the free week ("a plan bought now starts today") and for "This iPhone has already had a free week".
6. A Premium gift for the App Review account.
7. Whether removing a gift should start a new free week.
8. Whether the free week should need a real iPhone, so throwaway email accounts can't use up the AI budget.
9. The sign-in surviving an app delete.
10. "Saved meals" or "saved orders".
11. A low budget cutting variety without saying so.
12. Deploying numbite.com.
