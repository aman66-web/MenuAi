# Recipes from any supermarket: report, 16 November 2026

1. **RESULT:** built and tested on a branch, **behind a switch that is OFF by default**: with it off the app and website behave exactly as on `main` (every suite passes unchanged). Not merged; nothing applied to Supabase.
2. **Branch and commit:** `recipes-any-supermarket`, cut from `main` at `ae0b20d`. The work was pushed at commit `5aede41` (first push); this report is in the commit after it (second push), and the last line names that commit.
3. **Recipes complete per shop (of 117):** official labels / with community numbers: Sainsbury's 117 / 117 · Asda 0 / 28 · Tesco 0 / 1 · Morrisons 0 / 1 · Aldi 0 / 0 · Lidl 0 / 0 · Waitrose 0 / 0 · Iceland 0 / 0 · M&S 0 / 0. Only Sainsbury's labels have been read, so no other shop can make a recipe without community numbers.
4. **Founder decisions:** turn the feature on or not (`NEXT_PUBLIC_RECIPES_ANY_SHOP`); use community numbers in recipes or not (`NEXT_PUBLIC_RECIPE_COMMUNITY_NUMBERS`); approve the 21 new on-screen sentences (section 7); approve the privacy paragraph and the App Privacy wording (section 6).
5. **Not verified:** a real report reaching Supabase (the migration isn't applied; the route was tested with a fake store, and the table and view on a local PostgreSQL 16); the iPhone app (the Swift is untouched, but the packed copy and a real iPhone weren't tried); real people finding products in real shops.
6. **Founder's steps:** (1) read and approve sections 6 and 7; (2) in Supabase › SQL Editor run `supabase/migrations/20261117120000_not_found_reports.sql` (never `supabase db push`); (3) in Vercel set `NEXT_PUBLIC_RECIPES_ANY_SHOP=1` (and, only if you decide so, `NEXT_PUBLIC_RECIPE_COMMUNITY_NUMBERS=1`) and redeploy; (4) to read the "spreadsheet": Supabase › Table Editor › `not_found_counts` › Export › CSV.

---

## 1. What the founder asked for, and what was built

The idea (16 Nov 2026): recipes for each supermarket a person uses ("one recipe from Sainsbury's, one from Tesco's"), with mixing shops only inside a recipe, by Swap; before swapping, ask whether they could find the ingredient; a "No" goes into a spreadsheet so we learn which products people can't find at which shops; then either another product from the same shop (best first) or one from another supermarket (best first, filterable by supermarket).

Built, all behind `RECIPES_ANY_SHOP_ENABLED` (`web/lib/mm/config.ts`, `NEXT_PUBLIC_RECIPES_ANY_SHOP=1`; default off):

- **Recipes per supermarket.** Recipes offers the person's own supermarkets (the "Your supermarkets" button beside the search, `settings.shops`) as a choice above the search. A recipe is made from ONE shop's products and appears at that shop only when every ingredient resolves there to a product with numbers we can use, by exactly the rules Sainsbury's recipes use today (unit, as sold, the plausible range for the form). A shop with no complete recipe shows the existing "No recipes here yet." with two new lines: that a recipe appears once every ingredient has a usable product there, and the ingredients missing most often at that shop.
- **The new Swap flow** (`web/app/app/recipes/RecipeDetail.tsx`): Swap → "Could you find this at {shop}?" (the product's photo and name above it) → **Yes** (nothing sent) or **No** (a report is queued: section 4), with a line under the buttons saying exactly what No sends and that nothing about the person is sent → two choices:
  - **Choose another product from {shop}**: the same list as before (substitutes, then the shop's products, the recipe's own ranking), with a Back button;
  - **Choose a product from another supermarket**: one chip per supermarket (the person's own first, then the rest), one shop's list loaded at a time, products ranked most suitable first (`otherShopOptions`, section 3), each with its shop, price, price a serving and either its numbers (and "community data" when they are) or "No numbers yet: with this one, the recipe's nutrition won't be shown."
- **A mixed recipe.** The chosen product stands for its ingredient with its own price and its own numbers; every figure is worked out again. Its row says "From {shop}", links to that shop's product page, uses that shop's photo, and "Add all to my shopping list" puts it under its own shop. Prices say "at each shop's own shelf prices", and the footer adds "Prices from {shop} were checked {date}." and "Not affiliated with {shop}." for each other shop. **A product without usable numbers can't change the figures:** the calories and nutrition are then not shown at all ("We don't have numbers we can use for … from the shop you chose, so this recipe's calories and nutrition aren't shown. Its price still is."), fitting to the person's meal is skipped, and the price still is shown. Choosing a product from the recipe's own shop again (or a substitute) brings the figures back.
- **"I have this", Serves and fitting keep working:** a serving's figures and price stay the same for any number of people in a mixed recipe (tested 1 to 12), a product from another shop stays chosen when the recipe is fitted, and the cupboard items keep their rules.
- **The "spreadsheet"** (section 4): an outbox kind, `POST /api/v1/not-found`, a migration (written, not applied) and a read-only view to export as CSV.

## 2. Coverage per shop (measured on the published lists, 16 Nov 2026)

`COVERAGE=1 COVERAGE_OUT=coverage.txt npx vitest run tests/recipeShops.test.ts` (in `web/`) recomputes this table from the real files.

| Shop | Products | Own labels read | + community numbers (by exact barcode) | Recipes complete, official labels | Recipes complete, with community numbers |
|---|---:|---:|---:|---:|---:|
| Sainsbury's | 15,310 | 12,712 | 230 | **117 / 117** | 117 / 117 (none changed: see below) |
| Tesco | 6,079 | 0 | 1,012 | 0 | 1 |
| Asda | 10,527 | 0 | 6,684 | 0 | **28** |
| Aldi | 3,207 | 0 | 1 | 0 | 0 |
| Lidl | 1,037 | 0 | 0 | 0 | 0 |
| Morrisons | 16,373 | 0 | 1,210 | 0 | 1 |
| Waitrose | 9,726 | 0 | 488 | 0 | 0 |
| Iceland | 5,976 | 0 | 1,091 | 0 | 0 |
| M&S | 6,141 | 0 | 0 | 0 | 0 |

**Why the other shops are at 0 with official labels:** only Sainsbury's product pages have been read for their nutrition (Tier 2). The other eight lists have names, prices and photos but no label of their own, so no ingredient can be matched there by the recipe rules, and the app shows what is missing instead of guessing (rule 1).

**What stops a shop even with community numbers** (ingredients missing most often, number of recipes):
- Tesco: ground black pepper (42), salt (29), vegetable or sunflower oil (28), rice (27), lemon juice (26), olive oil (21), tortilla wraps (20), chopped tomatoes (19).
- Asda: ground black pepper (42), salt (29), tinned new potatoes (18), red kidney beans (17), ground cumin (15), vegetable stock cube (13), chickpeas (12), clear honey (11).
- Morrisons: ground black pepper (42), onion (34), salt (29), lemon juice (26), free-range eggs (24), spring onions (22), tortilla wraps (20), tinned new potatoes (18).
- Aldi, Lidl, Waitrose, Iceland, M&S: ground black pepper (42), onion (34), garlic purée (33), salt (29), oil (28), rice (27), lemon juice (26), eggs (24) and most others.

The quickest way to make more shops work is reading their own product pages for these everyday items (the same Tier 2 reading done for Sainsbury's), not community data.

## 3. How "most suitable first" is worked out (no number is ever estimated)

- **Same shop:** exactly the list recipes use today (`candidates` in `web/lib/mm/recipes.ts`): products with a price for the amount used and a read label first, then the kind's preferred words, the fullest label, the cheapest to buy.
- **Another supermarket** (`otherShopOptions` in `web/lib/mm/recipeShops.ts`): first the products whose numbers pass every rule the recipe's own shop uses (their own label before community numbers); then products named for the ingredient (all its words, none of its excluded words, never a meat name for a meat-free recipe) that have no numbers yet. A product whose numbers exist but don't fit (cooked, per 100 ml for a weighed amount, outside the plausible range) is never offered. Within each group: the name with more of the ingredient's own words first ("Tesco British Chicken Breast Fillets" before "… Chicken Breast Sausages"), then a price for the amount used, the kind's preferred words, the cheapest to buy, the name. 25 are shown per shop.
- **A product chosen from another shop counts only when its numbers fit the amount as the recipe weighs it** (`labelFits`): per 100 g or ml in the recipe's unit, as sold (or drained for a drained amount). Otherwise it is listed and priced but the figures aren't shown (`RecipeTotals.noNumbers`).

## 3a. The community-numbers switch (the founder's decision; off)

`RECIPE_COMMUNITY_NUMBERS_ENABLED` (`NEXT_PUBLIC_RECIPE_COMMUNITY_NUMBERS=1`, only meaningful with the feature on). What turning it on would change, exactly:
- **For a product the shop's own page hasn't been read for, and that the shop's own list ties to a barcode:** the numbers of the Open Food Facts record for exactly that barcode (leading zeros ignored; the shop's barcode catalogue, `public/groceries/<shop>.json`) are used for recipes, marked as community data. Nothing else: no name matching, no filling in of a figure the record doesn't have.
- **Recipes that appear:** Asda 28, Tesco 1, Morrisons 1 (table above). Each says "The numbers for … come from Open Food Facts contributors (community data) for the same barcode, not from the shop's own page.", and the Recipes footer adds the existing sentence about community data.
- **Sainsbury's recipes don't change:** a product with community numbers only ever fills an ingredient the shop's own labels can't (it ranks after every product with a read label). Measured: with it on, **0 of the 117** Sainsbury's recipes change their figures or price (a first version would have changed 28 by picking cheaper community-numbered products; fixed and covered by a test).
- **The risk to weigh:** these are community figures, not the shop's label (they can be out of date or wrong; earlier audits found a few records that were). CLAUDE.md rule 1 says never invent or estimate a number; these are copied, not estimated, but they are not the official label. Of the 5,163 Tesco catalogue records, 32 came from Tesco's own pages; every other record in every catalogue is Open Food Facts.

## 4. The "spreadsheet": not-found reports

- **What is sent** when someone taps **No** under "Could you find this at {shop}?": `{ shop, kind, productId, recipeId, appVersion }` (the shop id, the ingredient's pantry kind, the shop's product id, our recipe id: left out for Pip's AI recipes; the app version). **Nothing about the person**: no account id, name, email, location, free text or device id. Yes sends nothing.
- **How:** through the app's existing offline outbox (new kind `notFound`; sent when online, retried like the other reports, listed under Settings › Unsent messages as "Product not found", with "Email instead" if it fails) to `POST /api/v1/not-found` (`web/app/api/v1/not-found/route.ts` → `web/lib/notFoundRoute.ts` → `handleNotFound` in `web/lib/handlers.ts`). The body must have exactly these fields (anything else is refused, 400); one caller may send 60 an hour (hashed-IP rate limit like the other reports; the hash is cleared after 30 days by the daily clean-up, which handles this table on its own so a missing table can't break it). **The route answers 404 while the switch is off**, so nothing can be written before you approve it and apply the migration.
- **Migration (written, NOT applied):** `supabase/migrations/20261117120000_not_found_reports.sql`: table `not_found_reports` (id, created_at, shop, ingredient_kind, product_id, recipe_id, app_version, ip_hash) with checks on every column, RLS on, nothing granted to the app roles; view `not_found_counts`: one row per shop, product and ingredient kind with the number of reports, how many recipes, first and last reported, most reported first. **Tested on a local PostgreSQL 16** (never Supabase): applied after the core migration, good rows inserted, five bad rows refused by the checks, the view counted correctly, and `anon` and `authenticated` could neither read nor write.
- **To read it:** Supabase › Table Editor › `not_found_counts` › Export › CSV. (`docs/BACKEND.md` has the contract.)

## 5. Checks

All on this branch, one heavy command at a time.

- **Typecheck** (`npm run typecheck`): pass. **ESLint** (`app lib tests`): pass.
- **Unit tests: 1,749 passed, 21 skipped**; the two new files add 28 passing tests and 1 skipped: `tests/recipeShops.test.ts` (15 passing and the coverage table, skipped unless `COVERAGE=1`; incl. the engine with a product from another shop, unusable numbers, Serves 1 to 12, fitting, community-numbers rules, ranking, real coverage at Sainsbury's and Tesco, and Sainsbury's 117 recipes unchanged with community numbers), `tests/notFound.test.ts` (13: validation, handler, rate limit, the route with the switch on and off, the clean-up step, the outbox item). The existing recipe tests (330) are unchanged and pass.
- **Browser suites on production builds (Chromium), switch OFF** (`NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1`, as the test build always is): **every suite passes**: recipes-anyshop 2/2 (off mode: the old sheet opens straight on the same-shop list, nothing is asked or sent, and the route answers 404), recipes 17/17, groceries 6/6, groceries-all 8/8, groceries-compare 8/8, groceries-photos 4/4, listadd 7/7, listphotos 11/11, sharelist 11/11, back 42/42, a11y 0 violations.
- **Switch ON** (the same build plus `NEXT_PUBLIC_RECIPES_ANY_SHOP=1`; the server started with placeholder server settings so a bad request can be refused with 400 instead of failing on missing settings): **every suite passes**: recipes-anyshop 5/5 (Tesco's empty state with what's missing; the question, No sending exactly the five facts, Yes sending nothing; a Tesco product with no numbers hiding the figures but not the price, and a Sainsbury's product bringing them back; Back; 360 px and Extra large text; axe on the question, the other-shop list and the empty state; the route refusing a bad body with 400), recipes 17/17, groceries 6/6, groceries-all 8/8, groceries-compare 8/8, groceries-photos 4/4, listadd 7/7, listphotos 11/11, sharelist 11/11, back 42/42, a11y 0 violations.
- **Community numbers ON as well:** recipes-anyshop 5/5 in community mode (Asda shows recipes made from products with community numbers; the list footer and the recipe say where the numbers come from; axe) and recipes 17/17 (Sainsbury's recipes as before).
- `recipes.mjs` now answers the new question (Yes, then the same shop) when the switch is on, so its Swap steps check the same list either way; with the switch off it does exactly what it did.

## 6. Drafts for approval (privacy)

- **Privacy page** (`web/app/(site)/privacy/page.tsx`, under "Things you choose to send us"; rendered **only while the switch is on**, so the live page is unchanged now):
  > **"Couldn't find it" in a recipe:** when you tap No under "Could you find this at" a shop, we receive which product you couldn't find, at which supermarket, for which ingredient of which recipe, and the app version. Nothing about you: no account, name, email or location. We count these to learn which products are hard to find, and keep them while they help us improve the recipes.
  The existing sentence after the list already covers the hashed IP address (kept 30 days).
- **App Privacy (App Store Connect), draft:** no new data type. Change the first row of the table in `docs/STORE.md` from `"Report a number", "Request a restaurant"` to `"Report a number", "Request a restaurant", "Couldn't find it" in a recipe's Swap` (User Content → Other User Content; not linked to the user; App Functionality). `PrivacyInfo.xcprivacy` needs no change (the same type is already declared). `docs/STORE.md` itself was not edited.
- **App Store text:** nothing to change until the feature is on. If it ships, a What's New line could be: "Recipes: choose your supermarkets, and swap an ingredient for one from another shop. If you can't find something, tell us with one tap." (draft).

## 7. Every new sentence (rule 8; English only)

On Recipes:
1. "A recipe appears here once every ingredient has a product at {shop} with numbers we can use."
2. "Most often missing at {shop}: {names}."

In the Swap sheet:
3. "Could you find this at {shop}?"
4. "Yes"
5. "No"
6. "If you tap No, we're sent which product you couldn't find and at which shop, so we can improve the recipes. Nothing about you is sent."
7. "Thanks, we've noted it."
8. "Choose another product from {shop}"
9. "The ones that fit this recipe best come first."
10. "Choose a product from another supermarket"
11. "The best fits from other supermarkets. Choose which supermarket to look at."
12. "Products that fit this recipe, best fit first. It uses {amount}."
13. "Nothing at {shop} fits this ingredient yet."
14. "No numbers yet: with this one, the recipe's nutrition won't be shown."
15. "community data"

On a recipe:
16. "From {shop}"
17. "We don't have numbers we can use for {names} from the shop you chose, so this recipe's calories and nutrition aren't shown. Its price still is."
18. "The numbers for {names} come from Open Food Facts contributors (community data) for the same barcode, not from the shop's own page." (only with community numbers on)
19. "\"A serving\" prices only what one serving uses. \"To buy it all\" is the whole packs below, at each shop's own shelf prices; you'll have some left over."
20. "Prices from {shop} were checked {date}."

In Settings › Unsent messages: "Product not found".

Reused unchanged: "No recipes here yet.", "We haven't read enough of {shop} product pages to fill these recipes yet.", "Not affiliated with {shop}.", "Back", "Loading products", "Couldn't load the products.", "{price} a serving", "for {n}", "{n} g protein per 100 {unit}", "Supermarket", and the existing community-data sentence of the shop lists. No food is called good or bad, nothing promises stock, and nothing says a product is "in" a shop beyond its own list.

## 8. Files

- Engine: `web/lib/mm/recipeShops.ts` (new), `web/lib/mm/recipes.ts` (other-shop picks, `labelFits`, `noNumbers` and `community` in the totals, community-numbered products last), `web/lib/mm/shopProducts.ts` (`nutritionFrom`).
- App: `web/app/app/_lib/recipeShops.ts` (new hooks), `web/app/app/recipes/page.tsx`, `web/app/app/recipes/view/RecipeScreen.tsx`, `web/app/app/recipes/RecipeDetail.tsx`, `web/app/app/settings/page.tsx`.
- Reports: `web/lib/mm/outbox.ts`, `web/lib/validation.ts`, `web/lib/handlers.ts`, `web/lib/store.ts`, `web/lib/notFoundRoute.ts` (new), `web/app/api/v1/not-found/route.ts` (new), `web/app/api/cron/cleanup/route.ts`, `supabase/migrations/20261117120000_not_found_reports.sql` (new, not applied).
- Switches: `web/lib/mm/config.ts` (`RECIPES_ANY_SHOP_ENABLED`, `RECIPE_COMMUNITY_NUMBERS_ENABLED`).
- Docs: `docs/BACKEND.md` (the route), `web/app/(site)/privacy/page.tsx` (the paragraph, switch-on only), this report. `docs/PROGRESS.md` and `docs/STORE.md` were not edited.
- Tests: `web/tests/recipeShops.test.ts`, `web/tests/notFound.test.ts`, `web/e2e/recipes-anyshop.mjs` (new); `web/tests/handlers.test.ts`, `web/e2e/recipes.mjs` (adapted).

## 9. Known limits

- The other-supermarket list loads one shop's whole list (up to about 4 MB) when its chip is chosen; it is kept for the session.
- A product chosen from another shop is not remembered after leaving the recipe (like the existing Swap choices).
- Name-only matches can still include a product of a different form when its name has the ingredient's words (for example a sausage named "chicken breast" ranks below the fillets but is offered); it has no numbers, so it can't change any figure.
- The iPhone app gets this only from a new build packed with `NEXT_PUBLIC_RECIPES_ANY_SHOP=1` set (the packing script passes the shell's variables through) and the switch on in Vercel for the API; not tried in the packed app here.
