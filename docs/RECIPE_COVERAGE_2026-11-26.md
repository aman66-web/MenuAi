# Recipe coverage for Meal plan's answers (26 November 2026)

Founder, 26 November: "if my app hasn't good foods suitable for every possible input please make more recipes in my app so that my app caters for multiple
inputs a user would need as they all have different diet plans that may vary a lot", and "also have like protein flapjack etc recipes ones that people may just
want to cook at home also".

## How it was measured

`REPORT=gaps npx vitest run web/tests/recipeGaps.check.test.ts` (a writer's tool, skipped unless asked) writes `web/.recipe-shops/gaps.json` and `gaps.md`.
For every shop offered in Recipes (80 or more recipes: Sainsbury's, Morrisons, Waitrose, Iceland, Asda, M&S, Aldi) it counts, per meal, the recipes the plan could
use for each set of answers: the recipe suits the diet and the foods left out, every ingredient is at the shop with a price, and fitted to the meal it lands within
`MAX_SWAP_DISTANCE` (0.3) of the meal's calories and protein. Aims are three reference people (3 meals and a snack): just eat well / keep steady 2,000 kcal and
100 g protein; lose fat 1,600 kcal and 130 g; build muscle 2,800 kcal and 170 g (the plan's own sizing in `bodyGoal.ts` may differ). Styles are fitted the way
`styleTargets` fits them. **Thin = fewer than 7** (a different recipe each day of the week is impossible). The worst-first list weights each combination by how
likely its answers are (rough UK shares: diet, aim, style, shop, allergen; our judgement, used only to order the list).

## Before (382 recipes): the thin spots, worst first

Counts are Sainsbury's / Morrisons / Waitrose / Iceland / Asda / M&S / Aldi.

1. **Snacks, for everyone.** 19 snack recipes, but only 2 to 5 fit a snack's size and protein at any shop (balanced, just eat well: 4/3/3/4/5/2/2; build muscle:
   2/2/2/3/4/1/0; mild only: 2). Every diet, style and allergen inherits this: no milk, 1; no nuts or peanuts, 2; vegan, 0 to 2; keto, lower fat and paleo, 0.
2. **Vegan, any aim but "just eat well".** Lose fat and build muscle: **0** breakfasts, lunches and dinners at every shop (no vegan recipe reached a meal's protein:
   the everyday kinds have no tofu, soya or other plant protein). Just eat well: breakfasts 4, lunches 8/3/6/4/2/0/0, dinners 13/7/9/10/4/0/0. Vegan sweet
   breakfast 1, quick breakfast 1, 15-minute dinner 0.
3. **15-minute dinners:** 3 at every shop for any diet; vegetarian 1, halal 3, pescatarian 2, vegan 0.
4. **Vegetarian with protein.** High protein lunches and dinners: **0** at every shop (eat well and build muscle), 0 to 2 for lose fat. Vegetarian lose fat lunches
   9/11/7/9/12/7/1, dinners 10/11/9/10/11/8/1.
5. **Cuisines at lunch:** Indian 0 (any diet, vegetarian and halal), Middle Eastern 2, Chinese 5, Mexican 5.
6. **Jain:** **0** lunches and dinners at every shop; breakfasts 5. **No onion or garlic:** dinners 8/8/5/8/5/4/3.
7. **Allergy pairs:** no gluten and no eggs, 0 breakfasts; no milk, 1 snack.
8. **Styles:** Longevity for losing fat 0 to 2 a meal; Keto at eat-well sizes 1 to 2 dinners (the keto recipes exist but carry more protein than an eat-well
   meal); Paleo about 1 a meal; Lower salt 3 to 17 at Morrisons, Iceland and Aldi.
9. **Aldi (128 of 382 recipes) and M&S (207):** thin almost everywhere (any diet: Aldi lunches 14, dinners 20). This is the shops' data, not the recipes: Aldi has no
   read label for rice, pasta, tuna, chickpeas, passata, garlic, black pepper, cucumber or cherry tomatoes; M&S none for apples, bananas, oats, chickpeas, kidney
   beans or cottage cheese. More recipes can't fix it; reading those labels can.

Full ranked list (top 400 of 11,264 thin combinations out of 17,937): `web/.recipe-shops/gaps-before.md` (not committed: regenerate with the command above).

## What was added (60 recipes, 382 -> 442)

- **Pantry:** soya drink and whey protein powder (vanilla, chocolate or plain; no "diet", clear or flavoured ones) are new kinds; tofu's match now finds The Tofoo
  Co. and Cauldron. A new set, `PROTEIN_KINDS` (tofu, Quorn, edamame, protein powder, soya drink), may be used on top of the everyday kinds: most shops sell them,
  not every small shop. Where a shop lacks one the substitute is used (vegan tofu -> chickpeas, edamame -> peas, soya drink -> oat drink); protein powder has no
  substitute, so those recipes are offered only at Sainsbury's, Morrisons and Iceland.
- **Snacks and bakes (16, `homeSnacks.ts`):** peanut butter protein flapjacks, oat and raisin protein balls, protein yogurt bark, berry protein yogurt pots,
  cottage cheese and spinach egg muffins, banana and raisin baked oat cups, whipped cottage cheese dip, cucumber and garlic yogurt dip, tuna and sweetcorn
  cucumber boats, ham and cottage cheese pepper cups, cottage cheese and tomato on toast, peanut butter yogurt dip with apple, warm edamame with soy and lemon,
  crispy soy and paprika tofu bites, edamame and pea smash on toast, mixed berry and soya smoothie.
- **Breakfasts (7, `proteinMornings.ts`):** tofu scramble on toast, tofu breakfast wraps, peanut butter and berry soya porridge, apple and almond soya overnight
  oats (all vegan), protein pancakes, protein overnight oats, banana, berry and almond yogurt bowl (no gluten, no egg).
- **Vegan and vegetarian protein lunches and dinners (14, `proteinMeals.ts`):** crispy tofu and broccoli stir-fry, tofu spinach curry, tofu and kidney bean chilli,
  tofu fried rice, soy tofu and edamame rice bowl, smoky tofu wraps, edamame pea pasta (vegan); Quorn tikka-style curry, Quorn fajitas, Quorn broccoli stir-fry,
  creamy cottage cheese tomato pasta, cottage cheese frittata with salad, cottage cheese chickpea salad, egg chickpea curry with naan (vegetarian).
- **No onion, garlic or root vegetables (10, `onionFreeMeals.ts`; Jain-friendly unless it has chicken):** chickpea spinach curry, tofu and pea curry, kidney bean
  curry, pepper and mozzarella pasta bake, cheese and sweetcorn quesadillas, chickpea rice salad, chickpea tomato soup, broccoli and pea pasta, bean and sweetcorn
  cumin rice, lemon paprika chicken with rice.
- **15-minute dinners, cuisine lunches and paleo (13, `fastMeals.ts`):** paprika chicken wraps, chicken soy noodles, egg and spinach noodles, smoked salmon
  omelette, quick chickpea curry with naan, warm chickpea wraps, tuna quesadillas; curried chicken wraps and curried chickpea wraps (Indian lunches), chicken
  shawarma-style salad (Middle Eastern lunch); paprika chicken traybake, roast salmon with peppers, tuna egg salad (paleo).
- Five drafts were dropped as near-duplicates of existing recipes (three keto dinners, the soy beef noodles, a salmon and rice dinner).

## After

Not measured yet: the Mac ran short of memory and the run moved to the cloud session. Rerun the command above and compare with `gaps-before.md`; expected to
close items 1 to 6 at the five big shops (snacks, vegan and vegetarian protein, 15-minute dinners, Indian lunches, Jain lunches and dinners).

## Still to do

- Rerun the audit and fill what is still thin (likely: vegan snacks at a fat-loss size, Longevity for losing fat, Lower salt at Morrisons and Iceland).
- `tests/eatingStyle.test.ts` "a varied week ... keto 7": the keto week now has eggs 4 days running in one meal (limit 3).
- Regenerate keys and coverage: `WRITE_I18N=1 npx vitest run tests/i18n.test.ts`, `WRITE_COVERAGE=1 npx vitest run tests/recipeCoverage.test.ts`; then `npx tsc --noEmit`.
- Pictures: 60 new recipes have a look and a prompt in `docs/RECIPE_IMAGE_PROMPTS.md`, none has a picture yet (about 60 to 70 Higgsfield credits at 1 credit
  a picture, with a few retries; needs the founder's go-ahead to spend).
- Aldi and M&S: read the missing labels (item 9).
