You work on Numbite (repo /Users/amanmarwaha/MenuAi, branch iap; the Next.js 16 web app is in web/). CLAUDE.md binds everything; above all: rule 1 (never invent a
nutrition number: our recipes are built from pantry kinds and every figure comes from the shops' labels through the existing code), rule 3 (no good/bad food,
no health or nutrition words in names, blurbs or steps: no "healthy", "light", "lean", "guilt-free", "high-protein", "low-calorie"), rule 8 (don't change
constants or existing copy).

THE FOUNDER (21 November 2026, 03:00): "all the shops, like, they should have recipes ... why does the ones that have ingredients not have recipes ... please do
that for me" and pictures "have to be recipes that universally used between different supermarkets". Today Aldi and M&S have plenty of breakfasts but few
lunches and dinners, so their Meal plan weeks run short.

YOUR JOB: WRITE 40 NEW EVERYDAY RECIPES (20 lunches, 20 dinners) that as many supermarkets as possible can make, into a new file
web/lib/mm/recipeBook/everyShop.ts (export EVERY_SHOP: readonly Recipe[]), with their look sentences in web/lib/mm/recipeBook/looks.ts's map the way the other
files' recipes have theirs, wired into web/lib/mm/recipeBook/index.ts (RECIPES, one comment line quoting the founder) and one cuisine/occasion line each in
web/lib/mm/recipeBook/niches.ts where the file's own rules call for one. These four files and a temporary checker are the only files you edit.

1. Read web/lib/mm/recipeBook/index.ts (the header's rules: every recipe obeys them; tests/recipeBook.test.ts checks them), web/lib/mm/recipeBook/quickDinners.ts
   and everydayLunches.ts (the shape to copy, and the dishes that already exist: never repeat a dish), looks.ts, niches.ts, web/lib/mm/pantry.ts (kinds,
   EVERYDAY_KINDS, subs) and web/lib/mm/dishForm.ts (dish forms: spread yours across soups, salads, pasta, rice and grain bowls, stir-fries, traybakes,
   stews and curries, jacket and other potatoes, eggs, fish, toasties; at most two wraps in the whole set).
2. Which ingredients the shops have: in web/ run `REPORT=kinds npx vitest run tests/recipeShops.check.test.ts`, then read web/.recipe-shops/kinds.txt. Use
   only kinds that Sainsbury's, Morrisons, Waitrose, Iceland, Asda and M&S all have (Aldi's list is being given its pack sizes tonight, so its gaps there
   may close; Tesco's list has no cupboard aisle at all, so ignore Tesco). Prefer kinds Aldi has too.
3. Write the recipes: British everyday dishes people really cook, 2 to 4 servings, 10 to 45 minutes, realistic amounts as weighed before cooking (oil about
   1 tablespoon, 15 ml, per pan, never growing with servings; no stray nuts or extras a UK cook wouldn't add), clear steps exactly as the header says (a
   1-to-5-word title, one job in at most 45 words, times and signs of doneness; chicken, pork and mince piping hot with no pink; fish flakes easily; eggs set),
   batch-cook dishes end with the keeping line the other files use. A lunch is a lunch-sized dish (soup, salad, toastie, jacket potato, rice or grain bowl,
   pasta salad); a dinner a main meal. Mix proteins: chicken, eggs, tuna, salmon or white fish, beans and lentils, cheese, some beef or pork mince; about a
   third meat-free.
4. Check: in web/ run `REPORT=recipes FILE=everyShop npx vitest run tests/recipeShops.check.test.ts` and read web/.recipe-shops/recipes.txt: each recipe
   should be makeable with a price at 6 or more of the 8 shops (M&S included). Change ingredients (never figures) until it is; then run
   `npx vitest run tests/recipeBook.test.ts tests/recipeNiche.test.ts tests/recipe*.test.ts tests/pantry*.test.ts tests/diets.test.ts` until green and
   `npx tsc --noEmit -p .` clean. Run `WRITE_I18N=1 npx vitest run tests/i18n.test.ts` after your text is final.
5. Never commit, push or deploy; never touch Chrome, docs/ or any other file; no next build. Report: the 40 ids with their meal and how many shops make each
   (from recipes.txt), any test you could not make green and why.
