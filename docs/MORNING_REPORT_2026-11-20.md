# Morning report, 20 November 2026

Everything below is on branch `iap` on the Mac. **Nothing was uploaded to App Store Connect, nothing was deployed to numbite.com, nothing was pushed.**
Build 7 is still in Apple's review, untouched.

## What happened overnight
- **Done and committed:** the Settings cog and Shopping list on every tab; Home's numbers as swipe pages with dots (now two pages: Today, and Calories and
  protein this week); the 30-person onboarding and Pip meeting, built in three waves; 13 everyday UK breakfasts with photos (kedgeree and the like moved to
  lunch); six more diets behind "More diets"; meal sizes that add up (3,400 kcal = three meals of about 1,130); every recipe priced; Premium as the one name;
  the colour plan; sign-in moved to the end of setup. Details: `docs/PROGRESS_LOG.md` (20 November entries) and `docs/meetings/`.
- **The new onboarding** shows the app working instead of describing it: a look at Eat out (real dishes with the chain's own figures), a look at Recipes (two
  recipes priced at your shop) and a look at Meal plan (a real week from your shop), then the free account last. Home then opens with a one-time "Start here" card.
- **The 30-person whole-app audit was started but not finished.** From about 04:50 every action took about 10 minutes, because the Claude app stopped
  answering its own tool-approval check in time ("PreToolUse hook did not respond before its timeout"). At that pace the audit could not finish, so I stopped it
  after 8 of its 30 areas. Its findings so far are saved and **nothing from it has been fixed yet**. It can carry on from where it stopped.

## What the audit found so far (8 of 30 areas: 2 blockers, 17 high, 40 medium, 58 low)
Blockers:
1. **The published restaurant menus are older than our source data**: 67 chains show older figures and 105 dish photos fail to load, on numbite.com too.
   The fix is to republish the menu data (`./scripts/publish_menus.sh`, checked, then live with your go-ahead).
2. **A recipe that doesn't suit someone's allergies or diet still opens and says it was "chosen for your diet"** (recipe page note).

High (selected):
- Groceries: the barcode scanner says "not in our list" for about 4,200 products we hold; the same product can show two different sets of figures by route;
  "Search every shop" uses the old catalogue (Aldi 1 product, M&S 0); M&S unit prices lack "per", so Compare picks a false "Best for price"; leaderboards
  break their own rules (powders, spices, sweeteners).
- Adding food: a supermarket product can be logged with Open Food Facts numbers instead of the shop's own label; changing a portion re-rounds and saves, so
  totals drift; a saved calories-only restaurant meal disappears after a reload.
- Recipes: Back from a recipe wipes the filters and search; the search box shows only two characters at 375 px and none at 320 px; "{shop} doesn't sell ..."
  wording is untrue and ungrammatical.
- Shopping list: "Add all" from a recipe says "your Sainsbury's list" but puts things on the main list; the meal plan's "Add all" doubles quantities if tapped twice.
- Eat out: McDonald's "Best for you" suggests lattes and milk; someone on "No red meat" is offered beef burgers.
- Home tips on a small iPhone (SE): a tip hides its Done and Stop buttons, and the first tip scrolls the numbers off screen.
- Every finding with evidence and the suggested fix: `docs/audit-findings-2026-11-20-partial.json`.

## Your decisions this morning
1. **Restart the Claude app** (Quit and open it again). It is what slowed everything down overnight, and it also frees about 8 GB.
2. **Republish the restaurant menus** (blocker 1 above): say "yes, republish the menus" and I'll run the pipeline, check it and put it live.
3. **App Store:** keep build 7 in review, or replace it with build 8 (the new onboarding and everything above)? Build 8 still has the audit's open findings,
   so my advice is to **keep build 7 in review** and send build 9 after the audit's fixes. Either way, check in App Store Connect that the What's New and the
   review notes don't mention a "90-day pass": only Annual (£49.99) and Monthly (£4.99) exist. If build 8 or 9 goes in, the review notes need one change:
   the account is now asked for at the end of setup (step 11 of 11).
4. **Your phone's goal is "I'm on a GLP-1 medication"**, which keeps each meal to 450 kcal (that is why the plan showed 450). The plan now says so. Was that
   goal meant? If not, change it in Settings > Targets.
5. **Tesco** is still blocking the label reader; no reader ran overnight (6-hour back-off after the 01:25 block). Waitrose and Morrisons are fully read.
6. Small things on screen: Safari has a dialog open; Chrome has one Tesco error tab open (left on purpose).

## Not checked yet
- The browser test scripts (e2e) for the third wave were updated but not all re-run; the simulator walk (`/verify`) was not run.
- Next: carry on the audit (it resumes where it stopped), fix its findings in teams, run every test, then build 9.

## Build results (filled in by the overnight job)
- Third wave: committed: 0213c18d iPhone shell: the web view's background is the app's page grey; AccentColor is the app's link green
- Release archive: made: build/Numbite-1.1-build8.xcarchive (1.1, build 8; not uploaded)
- iPhone: installed on your iPhone
- Finished at 08:46. Memory: 53% free.
