# Cook from my cupboard: report (16 November 2026)

Branch `cupboard-recipes`, built from `origin/main` (ae0b20d). Nothing is merged and nothing is live. Version 1 is everything on the phone and **no AI**.

## In one paragraph

On the Recipes tab there is a new card, **Cook from my cupboard**. It opens a screen where the person taps the things they have, says roughly how much of each, and sees
the recipes they can make, the best match first. Each result says how many people the cupboard feeds, what they already have, and what is still to buy. One tap puts what is
missing on the shopping list. Opening a recipe starts it at those people and with the swaps already put in. The cupboard stays on the phone: it is never synced, never sent,
and Settings > Clear data removes it.

## What a person sees, screen by screen

1. **Recipes tab.** A new card, "Cook from my cupboard / Say what you have and see what you can cook", just above the "Cook with what's on your list" card. It shows whenever recipes
   are showing and no filter is on. (It sits below the "Picked for you" strip, so on a phone you scroll a little to reach it. Say if you want it higher.)
2. **The cupboard screen**, top to bottom:
   - Back, the title, and Pip: "Tell me what you have and roughly how much. I'll find recipes that use it."
   - **What do you have?** A search box ("Search, e.g. chicken or rice"), then **Common things** as big two-column tiles (chicken, eggs, mince, rice, pasta, wraps, onion, tinned
     tomatoes and so on, 25 of them), then **Store cupboard** tiles (salt, pepper, oil, garlic, cumin, paprika, herbs, curry powder, chilli powder, lemon juice). Tap a tile to put it in,
     tap again to take it out. A tile is dark with a tick when it is in.
   - Searching shows the matching things as the same tiles. If nothing in our list matches, the person can still tap **Add "…" anyway**: those words are matched by name only.
   - **Your cupboard · 4.** One card per thing, with a round × to remove it. Each has **A little / Some / Plenty**, or **Type an amount**, which shows − and + buttons and a number box in
     the thing's own unit (grams, millilitres, or whole eggs, wraps, onions and so on). A store-cupboard thing has no amount. Words the person typed have a rough amount only.
   - **Recipes you can make.** "61 recipes use something in your cupboard". The first card says **Best match**. Each card shows the recipe name, **"You have 2 of 4 ingredients · Serves 2"**, a bar,
     the things they have as green chips, **Still to buy** as outlined chips, any "Instead of X you have Y." line, "Store cupboard: paprika. Check you have them." where that applies,
     **See the recipe**, and **Add the other 3 to my list**. Six at a time, then "Show more recipes".
3. **The recipe page** opens at the people the cupboard feeds, with the swaps already in, and "as the recipe has it" on (so the amounts on the page are the ones the cupboard was measured against).

## How it works, in plain words

- **Amounts.** A number (say 400 g of chicken) is compared with what the recipe needs for 1, 2, 3 ... 12 people, using the recipe page's own scaling. "A little" feeds 1 person, "Some" feeds 2,
  "Plenty" feeds as many as the recipe is written for. That way no per-ingredient guess is needed. Salt, oil and spices have no amount: a jar lasts many meals.
- **People fed.** Set by the main ingredients (protein and carbs) the cupboard holds an amount of: the one with the least decides. Never more than the recipe is written for, never fewer than 1.
- **Ranking.** Half "how much of the recipe the cupboard covers" and half "how much of the cupboard the recipe uses", main ingredients counting most. (The second half stops a two-ingredient
  recipe that uses one thing beating a recipe that uses most of what you have. A first version without it put "Devilled eggs, 1 of 2 ingredients" top for a cupboard of chicken, rice and eggs.)
- **Swaps.** If a recipe allows a substitute and the cupboard has *enough of it for the people shown*, the card says "Instead of Chicken thigh fillets you have Chicken breast fillets." and nothing is
  bought for it. Too little of a substitute counts as still to buy.
- **Diet and allergies.** Exactly as the Recipes page does it (the same function). Things the diet or allergies leave out are not offered in the picker; recipes left out are counted ("3 recipes are left out for your diet.").
- **Shopping list.** Uses the existing "What can I cook with this?" list code. It adds the recipe's own pick at the shop, enough packs for the people shown. Not what the cupboard covers, and not store-cupboard things.
- **No new numbers.** Every calorie, protein and price on the recipe page still comes from the shop's own labels through the existing arithmetic. The cupboard only decides how many people.
- Only Sainsbury's has product labels read, so only Sainsbury's recipes show (as on the Recipes tab today).

## Decisions I took (all the conservative choice; change any you like)

1. **A new device-only store, not the existing `mm.v1.cupboard`.** You asked me to reuse that one, but it is one of the *synced* stores (it is in the sync list, and the server only accepts a fixed list),
   and you also said the cupboard must never sync. Both can't be true, so I left the old one untouched and made `mm.v1.cupboardItems`. The screen **reads** the old store's "I have this" ticks (salt, cumin and so on,
   from recipe pages) as staples the person has. It never writes to it.
2. **Also reset when another person signs in on the same phone**, like water and reminders (a phone shared by two people shouldn't show one person's cupboard to the other).
3. **Amounts are "a little / some / plenty" or a number in grams, millilitres or whole pieces. No "tins".** Our data has no tin sizes, and a tin size would be a number I'd be inventing. Eggs, wraps, onions,
   carrots, peppers, bananas and apples can be counted in pieces because the kinds already say how much one weighs.
4. **Servings never go above what the recipe is written for**, even if the cupboard could feed more (the − and + on the recipe page change it). They only go *down* when the cupboard can't feed that many.
5. **Store-cupboard things (salt, oil, spices) are left out of the "You have 2 of 4" count** and listed in a quiet line, "Check you have them", because counting them would make most recipes look worse than they are.
6. **The recipe page opens "as the recipe has it"** instead of fitted to the person's meal size, because the fitting can raise protein and carb amounts up to double, which would no longer match what is in the cupboard. The person can switch fitting on there.
7. **Typed words** (matching no kind) use the shopping list's existing loose name matching, so "chicken" finds chicken recipes. They get a rough amount only.
8. **A limit of 60 things** in the cupboard, typed words up to 40 characters; anything damaged or hand-edited in storage is dropped when read.
9. **Halal and allergies.** The picker and results follow the diet rules, but we haven't read allergen labels on shop products, so the screen carries the existing "check each pack" kind of sentence.
10. **The offline cache version moved to `mm-v8`** and the new screen was added to the pages the service worker keeps, so installed copies pick it up.
11. **I did not change the "Clear data" confirmation sentence** (it lists what is removed; existing copy). The cupboard is removed anyway. You may want to add "what's in your cupboard" to that list.
12. **Privacy page:** one new paragraph saying the cupboard stays on the device and is not synced or sent. (Found on the way, not changed: that page says in one place that store-cupboard "I have this" ticks *sync* when signed in, and in another that they "stay on your device".)

## Every new on-screen sentence (35) for approval

Words on the Recipes tab and the cupboard screen. English only, no translations (languages are off).

- Cook from my cupboard
- Say what you have and see what you can cook
- Tell me what you have and roughly how much. I'll find recipes that use it.
- What do you have?
- Search, e.g. chicken or rice
- Common things
- Store cupboard
- Salt, oil and spices. No amount needed.
- Add “{words}” anyway
- Matched by its name only.
- Nothing in our list matches.
- {n} found (read aloud to screen readers as the search narrows)
- Your cupboard
- Nothing here yet.
- Tap the things you have above.
- A little is enough for 1 person, some for 2, and plenty for everyone.
- A little / Some / Plenty
- Type an amount
- How much {name}? (screen-reader name of the amount buttons)
- Less {name} / More {name} (screen-reader names of the − and + buttons)
- Amount of {name} in {unit} (screen-reader name of the number box)
- Recipes you can make
- 1 recipe uses something in your cupboard / {n} recipes use something in your cupboard
- Best match
- In your cupboard: (screen readers only, before the list of what they have)
- Instead of {x} you have {y}.
- (you have some) (after a still-to-buy item the cupboard has too little of)
- Your cupboard has everything this recipe uses.
- Store cupboard: {items}. Check you have them.
- See the recipe
- Recipes are chosen for your diet by their ingredients, and the number of people is worked out from what you told me. Check each pack.

Plus one sentence on the website's privacy page (English): "What you tell “Cook from my cupboard” (the things you have and roughly how much) stays on your device too. It is not synced to your account and is never sent to us, and Clear data on this device removes it. The recipes it finds are worked out on your device."

Existing sentences reused unchanged: "Back to recipes", "You have {have} of {total} ingredients", "Serves {n}", "Still to buy", "Add the last one to my list", "Add the other {n} to my list", "Added 1 product to your {shop} list.", "Added {n} products to your {shop} list.", "Show more recipes ({n} more)", "{n} recipes are left out for your diet.", "No recipe uses these yet.", "Try adding a main ingredient, like chicken, rice or eggs.", "See all recipes", "Remove {name}", "Done", "Loading recipes", "No supermarket list yet." and its second line.

## Version 2 plan: the AI writes a new recipe from the cupboard (not built, not switched on)

**Why it is a separate step.** Version 1 only *ranks* the 117 recipes we wrote. Version 2 would write one that isn't in the book, for a cupboard nothing in the book fits well. The AI recipe maker already exists but is off for the free launch
(`AI_RECIPES_ENABLED = false`), and the privacy page, the App Store privacy answers and the iPhone build all say the app uses no AI. Do not switch it on until the steps below are done.

**What it would send** (the existing request, `lib/mm/aiRecipe.ts`, plus the cupboard): the shop; the meal; how many people; the meal size and protein aim; the diet and allergy choices; an optional wish in words;
the list of shop products it may use (kind, product name, label per 100 g); and the **cupboard as kinds and rough amounts** ("chicken breast, 400 g; rice, plenty"), not typed words unless the person agrees to send them.
No name, account, email, location or device ID, as now. The AI only *chooses* kinds (restricted to the kinds the diet allows) and writes amounts and words. The app then finds the products, fits the amounts and works out every number
from the shop's labels, so the AI never supplies a figure, and its text is refused if it makes a health claim or gives a number or price (all existing rules).

**What must change before it ships**
- *Privacy page:* the section "Recipes and Pip's recipe maker" (already written for when it is on) must say the cupboard kinds and amounts are sent, to Anthropic through our server, nothing stored. Update "last updated".
- *docs/STORE.md:* the App Privacy rows that cover content the person types (I haven't re-read the table to name the exact row) must say the cupboard is sent for this feature; the line that says no AI recipe maker (line 3) and the app description must be reworded; the age-rating and App Review notes need a sentence on AI-written recipes (guideline 1.4.1 and the AI-content rules).
- *PrivacyInfo.xcprivacy* and the website text updated first (STORE.md already says: "update this table, the privacy manifest and the website privacy policy first").
- *The screen:* a plain, separate button ("Ask Pip to write one") with a line saying what is sent, shown only after the person taps it. Never automatic, so version 1's "nothing leaves the phone" stays true for everyone who doesn't tap.

**Keeping the cost down**
- Only when the person asks, after the book has been tried first ("None of our recipes fit well. Want Pip to write one?").
- The small, cheap model (Haiku, as the recipe maker already uses), medium effort, structured output.
- Send kinds and amounts, not the whole product list: only the products for the kinds in the cupboard and the few the recipe may add (about 40 lines, not hundreds), which cuts the tokens.
- The existing rate limits (5 per 10 minutes, 25 a day per caller) plus a monthly spend limit set in the Anthropic console.
- Cache the answer on the phone against the cupboard + diet + shop, so asking again for the same cupboard costs nothing.
- Pro-only later if you want it to pay for itself (the code for that gate already exists).

## Tests, with exact counts

- **Unit tests:** 1,746 passed, 20 skipped (none of the skipped ones are in the new file), in 91 files; 1 file is skipped. 25 of the passes are new (`web/tests/cupboard.test.ts`): reading the saved list back (bad, hand-edited and
  duplicate items, amounts that are out of range, the staple rule, the 60 limit), every change to the list, what is offered for each diet and allergy, search, ranking, the people fed from grams, a little, some and plenty,
  minor ingredients that fall short, swaps (enough and not enough), staples, typed words, the diet and allergy checks over every recipe, what to buy, the recipe page address, and that **no cupboard file can send anything** and the
  store is not in the synced list.
- **Typecheck** (`npm run typecheck`): clean. **ESLint** (`npx eslint .`): 0 errors, 4 warnings, all in older browser-test files I didn't touch.
- **Production build:** passes. The new page is a static page.
- **Browser tests** (production build, real Sainsbury's data):
  - `cupboard.mjs`: **16 of 16** (entry card, picking, amounts, ranking, opening a recipe, add to list, diet and allergies, search and typed words, nothing sent, Clear data, damaged storage, 390 px, 360 px and 360 px at 200% text with no sideways scroll, every control 44 px or more, axe 0).
  - `recipes.mjs`: **17 of 17**. `smoke.mjs`: **24 of 24**. `a11y.mjs`: **0 violations** (the new screen added to its list, light and phone-in-dark). `largetext.mjs`: no overflow at 100, 150 and 200% (new screen added).
  - `offline.mjs`: **14 of 15**. The one failure ("client navigation Home → Eat out → chain") **fails the same way on a clean copy of `origin/main`** (ae0b20d), which I built and ran to check. It is not from this work.
  - `app-build.mjs` (the packed iPhone app, run last): **9 of 9**. A one-off check that the cupboard opens, ranks and opens a recipe from the packed app with the live website blocked also worked, with no page errors.
- **Not tried:** a real iPhone (Safari, the number pad, VoiceOver); this computer has Chromium only. An iPhone's number pad has no Return key, so the number box is put away by tapping elsewhere (the − and + buttons need no keyboard).

## Files

New: `web/lib/mm/cupboardItems.ts` (the list and its rules; no recipe code, so the store stays light), `web/lib/mm/cupboard.ts` (the matching), `web/app/app/_lib/cupboardRecipes.ts`,
`web/app/app/recipes/cupboard/{page,CupboardPicker,CupboardResults}.tsx`, `web/tests/cupboard.test.ts`, `web/e2e/cupboard.mjs`, this report.

Small edits to shared files (kept tiny so they merge with `recipes-any-supermarket`): `app/app/recipes/page.tsx` (one block: the entry card), `app/app/recipes/RecipeDetail.tsx` (a `preset` prop for the starting people, swaps and "as written": three `useState` starting values),
`app/app/recipes/view/RecipeScreen.tsx` and `view/page.tsx` (pass the preset through), `lib/mm/stores.ts` (one store), `app/app/settings/page.tsx` (Clear data) and `app/app/_lib/account.ts` (reset for another person), `public/sw.js`, the privacy page, `lib/mm/locales/keys.json`,
and the browser-test README, `a11y.mjs` and `largetext.mjs`.

The iPhone app gets this only after the next `npm run build:app` and a Mac build.

## Ready to paste into docs/PROGRESS.md

- 2026-11-16 — **Cook from my cupboard, version 1** (founder: "the person can put what stuff they have in the cupboard and a rough amount of what they have and it will craft a really good recipe"). Branch `cupboard-recipes`, not merged. Everything on the phone, no AI.
  - **What:** a "Cook from my cupboard" card on Recipes opens `/app/recipes/cupboard`: tap what you have (25 common things, 11 store-cupboard staples, a search, or typed words matched by name), say roughly how much (a little / some / plenty, or a number in grams, millilitres or whole pieces),
    and the 117 recipes are ranked by half "how much of the recipe it covers" and half "how much of the cupboard the recipe uses" (protein and carbs count most), for the number of people the amounts allow (never above what the recipe is written for). Each card says "You have 5 of 7 ingredients · Serves 2", what is still to buy
    (one tap adds it to the shopping list, the existing `addMissing`), swaps where the cupboard has a substitute in enough quantity, and store-cupboard things to check. The recipe page opens at those people with those swaps, as the recipe has it (`preset`, address `n`, `s`, `w`).
  - **Privacy (rule 4):** a new device-only store `mm.v1.cupboardItems` (not in `SYNC_STORES`, not sent, removed by Clear data and by another person signing in; a test fails if any cupboard file can send). The old `mm.v1.cupboard` ("I have this") is **synced**, so it was not reused; it is only read (staples). One new privacy-page paragraph.
  - **Decisions (rule 8, conservative):** no "tins" unit (no tin sizes in our data); staples aren't counted in "You have x of y"; the recipe opens as written, not fitted to the meal size; a substitute counts only when there is enough of it; Clear data's sentence left as it was (add "your cupboard" if wanted); service worker `mm-v8`. 35 new English strings (listed in docs/CUPBOARD_RECIPES_REPORT.md), no translations.
  - **Version 2** (AI writes a recipe from the cupboard) is planned, not built, not on: the plan, the privacy and STORE.md changes it needs, and the cost controls are in the report. `AI_RECIPES_ENABLED` stays false.
  - **Checked:** 1,746 unit tests (25 new), typecheck, eslint (0 errors), production build; e2e cupboard 16, recipes 17, smoke 24, a11y 0 violations, largetext, app-build 9; offline 14 of 15 (the one failure, "client navigation Home → Eat out → chain", fails the same way on a clean `main`). Not tried on a real iPhone. The iPhone app gets it after the next `npm run build:app` and Mac build.
