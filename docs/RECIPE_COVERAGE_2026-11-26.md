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

## Wave 2: a plan for every kind of person (26 to 27 November, 198 recipes, 442 -> 640)

Founder, 26 November: "it needs to suit literally everyone. Like, someone could be a professional footballer and you want to give them the best diet plan
possible ... someone who does rugby might need more, like, different stuff ... So it's important to have as many recipes as possible that cater to different
things." The people and their days are in `docs/RECIPE_PERSONAS_2026-11-26.md`.

### How it was measured

`REPORT=personas npx vitest run tests/recipePersonas.check.test.ts` (in `web/`; a writer's tool, skipped unless asked; `SHOPS=` for fewer shops, `TAG=` to name
the output) writes `web/.recipe-shops/personas[-TAG].json` and `.md`. For 16 reference people (the personas, plus rugby at 4,500 kcal, a 1,200 kcal day and a
variety-seeker), each with their own day and shape (meals and snacks sized by `slotTargets`, under a 450 kcal meal cap for GLP-1), it counts the recipes Meal
plan could use for each meal, in 41 diets (the 11 diets, the 14 allergens, and vegan or vegetarian with no milk, gluten, eggs, soya or nuts), at Sainsbury's,
Morrisons, Waitrose, Iceland and Asda: suits the diet, every ingredient at the shop with a price, fitted within `MAX_SWAP_DISTANCE` (0.3). Each meal is also
counted at 15, 30 and 45 minutes, and for the personas who need it, carb-heavy (carbs at least half the fitted serving's calories), soft (by the dish's own words)
or cheap (£1.50 a serving or less). It also makes each person's week (`planForBudget`, variety 4) and compares its average day with their calories. Thin =
under 7 (under 14 for the variety-seeker). `REPORT=fit FILE=<recipe file>` shows how one file's recipes size for every persona at every shop, with a
serving's price at each.

### Before and after

"Before" is `iap` at 9fa3ee1c (442 recipes) with the small-shop protein list; "after" is this branch (640 recipes).

Counted: 49,000 combinations (16 personas x 41 diets and allergen sets x their meals x any / 15 / 30 / 45 minutes and their own filters x 5 shops).
Thin (under 7; 14 for the variety persona): **21,888 before, 5,929 after**. None at all: **4,211 before, 607 after**. The weighted gap (missing recipes x how likely the answers are) fell by 92%.

**any** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 7 -> 32 | 33 -> 72 | 99 -> 148 | 5 -> 28 |
| rugby | 2 -> 22 | 18 -> 47 | 76 -> 114 | 6 -> 33 |
| rugby-4500 | 0 -> 18 | 8 -> 32 | 32 -> 53 | 6 -> 34 |
| endurance | 3 -> 26 | 32 -> 66 | 75 -> 122 | 3 -> 21 |
| power | 16 -> 41 | 37 -> 81 | 108 -> 160 | 6 -> 33 |
| combat | 17 -> 45 | 42 -> 89 | 106 -> 158 | 6 -> 33 |
| gym-cut | 38 -> 64 | 70 -> 114 | 123 -> 177 | 9 -> 35 |
| gym-bulk | 12 -> 39 | 33 -> 75 | 102 -> 149 | 6 -> 33 |
| budget-loss | 40 -> 64 | 80 -> 120 | 117 -> 173 | 8 -> 34 |
| student | 26 -> 58 | 59 -> 106 | 117 -> 175 | 6 -> 36 |
| shift-worker | 36 -> 67 | 72 -> 120 | 120 -> 180 | 6 -> 36 |
| parent | 36 -> 67 | 68 -> 116 | 119 -> 178 | 8 -> 35 |
| older-adult | 32 -> 59 | 57 -> 100 | 90 -> 141 | 7 -> 33 |
| glp1 | 40 -> 58 | 77 -> 109 | 100 -> 146 | 7 -> 30 |
| small-day | 37 -> 53 | 70 -> 101 | 100 -> 138 | 9 -> 26 |
| variety | 36 -> 67 | 68 -> 116 | 119 -> 178 | 8 -> 35 |

**vegetarian** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 7 -> 27 | 11 -> 39 | 28 -> 56 | 5 -> 26 |
| rugby | 2 -> 17 | 5 -> 24 | 15 -> 35 | 6 -> 28 |
| rugby-4500 | 0 -> 13 | 0 -> 16 | 3 -> 13 | 6 -> 31 |
| endurance | 3 -> 24 | 13 -> 38 | 29 -> 58 | 3 -> 19 |
| power | 16 -> 35 | 11 -> 42 | 24 -> 52 | 6 -> 28 |
| combat | 16 -> 39 | 13 -> 47 | 25 -> 54 | 6 -> 28 |
| gym-cut | 32 -> 52 | 18 -> 48 | 21 -> 50 | 8 -> 29 |
| gym-bulk | 12 -> 33 | 10 -> 39 | 22 -> 47 | 6 -> 28 |
| budget-loss | 35 -> 54 | 25 -> 56 | 22 -> 55 | 7 -> 28 |
| student | 25 -> 53 | 27 -> 61 | 37 -> 72 | 6 -> 33 |
| shift-worker | 34 -> 61 | 35 -> 71 | 36 -> 73 | 6 -> 33 |
| parent | 34 -> 60 | 31 -> 67 | 37 -> 73 | 8 -> 32 |
| older-adult | 31 -> 56 | 34 -> 69 | 40 -> 74 | 7 -> 31 |
| glp1 | 33 -> 46 | 19 -> 44 | 19 -> 45 | 5 -> 23 |
| small-day | 28 -> 39 | 13 -> 36 | 13 -> 36 | 6 -> 18 |
| variety | 34 -> 60 | 31 -> 67 | 37 -> 73 | 8 -> 32 |

**vegan** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 0 -> 10 | 0 -> 11 | 6 -> 17 | 1 -> 12 |
| rugby | 0 -> 8 | 0 -> 4 | 0 -> 1 | 1 -> 9 |
| rugby-4500 | 0 -> 4 | 0 -> 3 | 0 -> 1 | 0 -> 13 |
| endurance | 0 -> 7 | 2 -> 15 | 9 -> 25 | 1 -> 9 |
| power | 0 -> 6 | 0 -> 4 | 2 -> 4 | 1 -> 8 |
| combat | 0 -> 12 | 0 -> 9 | 3 -> 7 | 1 -> 9 |
| gym-cut | 0 -> 1 | 0 -> 1 | 0 -> 1 | 0 -> 2 |
| gym-bulk | 0 -> 9 | 0 -> 7 | 0 -> 3 | 1 -> 9 |
| budget-loss | 0 -> 2 | 3 -> 9 | 1 -> 3 | 1 -> 6 |
| student | 3 -> 16 | 4 -> 23 | 12 -> 32 | 1 -> 14 |
| shift-worker | 6 -> 20 | 5 -> 25 | 12 -> 32 | 1 -> 13 |
| parent | 6 -> 19 | 5 -> 24 | 12 -> 32 | 2 -> 13 |
| older-adult | 9 -> 20 | 10 -> 30 | 15 -> 34 | 2 -> 13 |
| glp1 | 0 -> 1 | 1 -> 3 | 0 -> 0 | 1 -> 3 |
| small-day | 0 -> 1 | 0 -> 1 | 0 -> 0 | 1 -> 2 |
| variety | 6 -> 19 | 5 -> 24 | 12 -> 32 | 2 -> 13 |

**halal** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 7 -> 29 | 26 -> 66 | 72 -> 114 | 5 -> 28 |
| rugby | 2 -> 19 | 15 -> 44 | 55 -> 86 | 6 -> 33 |
| rugby-4500 | 0 -> 15 | 6 -> 30 | 29 -> 48 | 6 -> 34 |
| endurance | 3 -> 25 | 27 -> 64 | 68 -> 110 | 3 -> 21 |
| power | 16 -> 37 | 33 -> 74 | 74 -> 119 | 6 -> 33 |
| combat | 16 -> 41 | 38 -> 83 | 77 -> 122 | 6 -> 33 |
| gym-cut | 32 -> 55 | 54 -> 97 | 78 -> 125 | 9 -> 36 |
| gym-bulk | 12 -> 35 | 26 -> 65 | 72 -> 114 | 6 -> 33 |
| budget-loss | 36 -> 57 | 60 -> 101 | 78 -> 127 | 8 -> 34 |
| student | 25 -> 55 | 50 -> 97 | 88 -> 138 | 6 -> 36 |
| shift-worker | 34 -> 63 | 59 -> 107 | 88 -> 140 | 6 -> 36 |
| parent | 34 -> 62 | 54 -> 102 | 89 -> 140 | 8 -> 35 |
| older-adult | 31 -> 57 | 52 -> 99 | 85 -> 134 | 7 -> 33 |
| glp1 | 33 -> 49 | 57 -> 91 | 67 -> 105 | 7 -> 30 |
| small-day | 29 -> 42 | 52 -> 81 | 57 -> 88 | 8 -> 24 |
| variety | 34 -> 62 | 54 -> 102 | 89 -> 140 | 8 -> 35 |

**pescatarian** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 7 -> 29 | 20 -> 52 | 44 -> 75 | 5 -> 27 |
| rugby | 2 -> 19 | 11 -> 33 | 29 -> 54 | 6 -> 32 |
| rugby-4500 | 0 -> 15 | 3 -> 21 | 14 -> 26 | 6 -> 33 |
| endurance | 3 -> 25 | 22 -> 50 | 42 -> 73 | 3 -> 20 |
| power | 16 -> 37 | 22 -> 57 | 44 -> 79 | 6 -> 32 |
| combat | 16 -> 41 | 26 -> 64 | 46 -> 79 | 6 -> 32 |
| gym-cut | 32 -> 55 | 38 -> 72 | 44 -> 79 | 9 -> 34 |
| gym-bulk | 12 -> 35 | 19 -> 52 | 44 -> 74 | 6 -> 32 |
| budget-loss | 36 -> 57 | 47 -> 80 | 44 -> 80 | 8 -> 32 |
| student | 25 -> 55 | 42 -> 79 | 56 -> 94 | 6 -> 35 |
| shift-worker | 34 -> 63 | 52 -> 90 | 56 -> 96 | 6 -> 35 |
| parent | 34 -> 62 | 47 -> 85 | 57 -> 96 | 8 -> 34 |
| older-adult | 31 -> 57 | 45 -> 82 | 56 -> 93 | 7 -> 32 |
| glp1 | 33 -> 49 | 42 -> 69 | 37 -> 65 | 7 -> 28 |
| small-day | 29 -> 42 | 34 -> 59 | 34 -> 56 | 8 -> 23 |
| variety | 34 -> 62 | 47 -> 85 | 57 -> 96 | 8 -> 34 |

**Jain** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 3 -> 11 | 0 -> 13 | 1 -> 12 | 2 -> 11 |
| rugby | 1 -> 9 | 0 -> 9 | 1 -> 11 | 3 -> 11 |
| rugby-4500 | 0 -> 6 | 0 -> 6 | 0 -> 5 | 3 -> 13 |
| endurance | 1 -> 9 | 0 -> 11 | 3 -> 15 | 1 -> 7 |
| power | 2 -> 12 | 0 -> 14 | 1 -> 13 | 2 -> 12 |
| combat | 3 -> 13 | 0 -> 14 | 1 -> 13 | 3 -> 11 |
| gym-cut | 4 -> 9 | 1 -> 12 | 1 -> 14 | 3 -> 11 |
| gym-bulk | 2 -> 11 | 0 -> 14 | 1 -> 13 | 3 -> 11 |
| budget-loss | 6 -> 11 | 1 -> 13 | 1 -> 12 | 2 -> 10 |
| student | 5 -> 18 | 0 -> 15 | 4 -> 19 | 3 -> 14 |
| shift-worker | 8 -> 19 | 1 -> 17 | 4 -> 20 | 3 -> 13 |
| parent | 8 -> 19 | 1 -> 17 | 4 -> 19 | 5 -> 14 |
| older-adult | 10 -> 21 | 2 -> 16 | 5 -> 17 | 4 -> 13 |
| glp1 | 4 -> 7 | 1 -> 8 | 0 -> 5 | 2 -> 8 |
| small-day | 2 -> 5 | 1 -> 7 | 0 -> 3 | 3 -> 5 |
| variety | 8 -> 19 | 1 -> 17 | 4 -> 19 | 5 -> 14 |

**no onion or garlic** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 4 -> 13 | 5 -> 25 | 5 -> 27 | 4 -> 19 |
| rugby | 1 -> 10 | 3 -> 17 | 3 -> 21 | 5 -> 22 |
| rugby-4500 | 0 -> 8 | 1 -> 12 | 1 -> 8 | 5 -> 22 |
| endurance | 1 -> 12 | 3 -> 17 | 7 -> 26 | 2 -> 15 |
| power | 11 -> 22 | 5 -> 28 | 7 -> 30 | 5 -> 23 |
| combat | 12 -> 23 | 5 -> 29 | 7 -> 30 | 5 -> 22 |
| gym-cut | 27 -> 38 | 19 -> 39 | 8 -> 34 | 8 -> 23 |
| gym-bulk | 8 -> 19 | 5 -> 27 | 7 -> 29 | 5 -> 22 |
| budget-loss | 27 -> 38 | 22 -> 40 | 7 -> 33 | 7 -> 21 |
| student | 18 -> 36 | 10 -> 32 | 11 -> 36 | 5 -> 24 |
| shift-worker | 26 -> 40 | 15 -> 39 | 11 -> 38 | 5 -> 23 |
| parent | 25 -> 40 | 12 -> 36 | 11 -> 37 | 7 -> 23 |
| older-adult | 25 -> 40 | 9 -> 28 | 10 -> 30 | 7 -> 24 |
| glp1 | 28 -> 36 | 21 -> 36 | 6 -> 26 | 6 -> 18 |
| small-day | 25 -> 33 | 21 -> 31 | 6 -> 25 | 8 -> 14 |
| variety | 25 -> 40 | 12 -> 36 | 11 -> 37 | 7 -> 23 |

**kosher style** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 7 -> 29 | 23 -> 59 | 75 -> 116 | 5 -> 28 |
| rugby | 2 -> 19 | 12 -> 38 | 55 -> 89 | 6 -> 33 |
| rugby-4500 | 0 -> 15 | 3 -> 24 | 24 -> 43 | 6 -> 34 |
| endurance | 3 -> 25 | 24 -> 54 | 69 -> 112 | 3 -> 21 |
| power | 16 -> 37 | 26 -> 66 | 79 -> 126 | 6 -> 33 |
| combat | 16 -> 41 | 31 -> 74 | 81 -> 126 | 6 -> 33 |
| gym-cut | 32 -> 55 | 49 -> 89 | 86 -> 133 | 9 -> 35 |
| gym-bulk | 12 -> 35 | 23 -> 61 | 76 -> 116 | 6 -> 33 |
| budget-loss | 36 -> 57 | 58 -> 95 | 85 -> 134 | 8 -> 34 |
| student | 25 -> 55 | 46 -> 88 | 93 -> 144 | 6 -> 36 |
| shift-worker | 34 -> 63 | 57 -> 100 | 94 -> 147 | 6 -> 36 |
| parent | 34 -> 62 | 52 -> 95 | 95 -> 147 | 8 -> 35 |
| older-adult | 31 -> 57 | 48 -> 89 | 80 -> 129 | 7 -> 33 |
| glp1 | 33 -> 49 | 56 -> 87 | 71 -> 111 | 7 -> 30 |
| small-day | 29 -> 42 | 50 -> 78 | 72 -> 103 | 8 -> 25 |
| variety | 34 -> 62 | 52 -> 95 | 95 -> 147 | 8 -> 35 |

**no gluten** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 0 -> 9 | 8 -> 24 | 27 -> 50 | 1 -> 10 |
| rugby | 0 -> 6 | 3 -> 13 | 24 -> 37 | 2 -> 12 |
| rugby-4500 | 0 -> 5 | 2 -> 8 | 10 -> 16 | 2 -> 13 |
| endurance | 0 -> 7 | 9 -> 24 | 22 -> 46 | 0 -> 8 |
| power | 4 -> 12 | 10 -> 27 | 31 -> 55 | 2 -> 14 |
| combat | 2 -> 12 | 11 -> 29 | 30 -> 54 | 2 -> 12 |
| gym-cut | 16 -> 24 | 22 -> 40 | 45 -> 72 | 5 -> 18 |
| gym-bulk | 2 -> 9 | 9 -> 25 | 28 -> 51 | 2 -> 12 |
| budget-loss | 15 -> 23 | 23 -> 40 | 45 -> 73 | 5 -> 17 |
| student | 4 -> 14 | 12 -> 33 | 37 -> 66 | 3 -> 14 |
| shift-worker | 7 -> 17 | 15 -> 35 | 41 -> 70 | 3 -> 15 |
| parent | 6 -> 17 | 15 -> 35 | 40 -> 69 | 3 -> 15 |
| older-adult | 4 -> 14 | 15 -> 35 | 32 -> 59 | 3 -> 14 |
| glp1 | 15 -> 21 | 25 -> 39 | 37 -> 61 | 4 -> 15 |
| small-day | 15 -> 21 | 25 -> 36 | 39 -> 60 | 6 -> 17 |
| variety | 6 -> 17 | 15 -> 35 | 40 -> 69 | 3 -> 15 |

**no milk** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 1 -> 16 | 15 -> 38 | 55 -> 87 | 1 -> 12 |
| rugby | 0 -> 13 | 6 -> 26 | 44 -> 71 | 1 -> 12 |
| rugby-4500 | 0 -> 9 | 1 -> 14 | 18 -> 34 | 0 -> 15 |
| endurance | 0 -> 11 | 14 -> 35 | 48 -> 81 | 1 -> 10 |
| power | 6 -> 23 | 17 -> 42 | 63 -> 99 | 1 -> 11 |
| combat | 6 -> 25 | 19 -> 48 | 64 -> 100 | 1 -> 12 |
| gym-cut | 16 -> 32 | 31 -> 56 | 71 -> 107 | 1 -> 10 |
| gym-bulk | 5 -> 21 | 15 -> 40 | 59 -> 91 | 1 -> 12 |
| budget-loss | 16 -> 31 | 33 -> 60 | 70 -> 107 | 2 -> 11 |
| student | 9 -> 28 | 24 -> 55 | 72 -> 112 | 1 -> 16 |
| shift-worker | 16 -> 33 | 28 -> 59 | 75 -> 116 | 1 -> 15 |
| parent | 16 -> 34 | 27 -> 58 | 75 -> 115 | 2 -> 15 |
| older-adult | 15 -> 30 | 29 -> 59 | 60 -> 98 | 3 -> 14 |
| glp1 | 16 -> 27 | 36 -> 57 | 61 -> 91 | 2 -> 11 |
| small-day | 17 -> 26 | 34 -> 51 | 61 -> 83 | 3 -> 11 |
| variety | 16 -> 34 | 27 -> 58 | 75 -> 115 | 2 -> 15 |

**no eggs** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 3 -> 17 | 19 -> 48 | 77 -> 116 | 4 -> 24 |
| rugby | 1 -> 14 | 10 -> 33 | 59 -> 90 | 5 -> 29 |
| rugby-4500 | 0 -> 8 | 6 -> 22 | 25 -> 46 | 5 -> 30 |
| endurance | 1 -> 16 | 19 -> 45 | 57 -> 95 | 3 -> 18 |
| power | 3 -> 16 | 20 -> 53 | 80 -> 122 | 4 -> 28 |
| combat | 3 -> 19 | 23 -> 57 | 78 -> 120 | 5 -> 29 |
| gym-cut | 8 -> 16 | 32 -> 60 | 90 -> 132 | 7 -> 29 |
| gym-bulk | 3 -> 18 | 17 -> 48 | 76 -> 118 | 5 -> 29 |
| budget-loss | 12 -> 20 | 41 -> 69 | 85 -> 131 | 6 -> 27 |
| student | 13 -> 32 | 34 -> 67 | 89 -> 137 | 5 -> 32 |
| shift-worker | 18 -> 35 | 42 -> 76 | 91 -> 141 | 5 -> 32 |
| parent | 17 -> 34 | 38 -> 72 | 91 -> 140 | 7 -> 32 |
| older-adult | 21 -> 37 | 34 -> 69 | 71 -> 115 | 6 -> 27 |
| glp1 | 9 -> 14 | 40 -> 61 | 74 -> 112 | 6 -> 24 |
| small-day | 5 -> 10 | 37 -> 54 | 76 -> 108 | 7 -> 17 |
| variety | 17 -> 34 | 38 -> 72 | 91 -> 140 | 7 -> 32 |

**vegan, no soya** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 0 -> 1 | 0 -> 2 | 2 -> 3 | 0 -> 2 |
| rugby | 0 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 2 |
| rugby-4500 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 3 |
| endurance | 0 -> 0 | 0 -> 6 | 4 -> 6 | 0 -> 1 |
| power | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 2 |
| combat | 0 -> 1 | 0 -> 1 | 1 -> 1 | 0 -> 2 |
| gym-cut | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 1 |
| gym-bulk | 0 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 2 |
| budget-loss | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 1 |
| student | 0 -> 1 | 0 -> 6 | 6 -> 9 | 0 -> 3 |
| shift-worker | 0 -> 2 | 0 -> 6 | 6 -> 9 | 0 -> 3 |
| parent | 0 -> 2 | 0 -> 6 | 6 -> 9 | 0 -> 4 |
| older-adult | 2 -> 3 | 4 -> 11 | 8 -> 11 | 1 -> 4 |
| glp1 | 0 -> 0 | 1 -> 1 | 0 -> 0 | 0 -> 0 |
| small-day | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| variety | 0 -> 2 | 0 -> 6 | 6 -> 9 | 0 -> 4 |

**vegan, no gluten** (breakfast / lunch / dinner / snack, the fewest at any of the five shops, before -> after)

| persona | breakfast | lunch | dinner | snack |
|---|---|---|---|---|
| footballer | 0 -> 3 | 0 -> 4 | 1 -> 5 | 0 -> 6 |
| rugby | 0 -> 2 | 0 -> 1 | 0 -> 1 | 0 -> 5 |
| rugby-4500 | 0 -> 1 | 0 -> 1 | 0 -> 1 | 0 -> 7 |
| endurance | 0 -> 3 | 0 -> 6 | 5 -> 13 | 0 -> 4 |
| power | 0 -> 1 | 0 -> 1 | 0 -> 1 | 0 -> 5 |
| combat | 0 -> 4 | 0 -> 3 | 0 -> 2 | 0 -> 5 |
| gym-cut | 0 -> 1 | 0 -> 1 | 0 -> 0 | 0 -> 2 |
| gym-bulk | 0 -> 3 | 0 -> 1 | 0 -> 2 | 0 -> 5 |
| budget-loss | 0 -> 1 | 0 -> 2 | 0 -> 1 | 0 -> 3 |
| student | 0 -> 4 | 0 -> 6 | 6 -> 15 | 0 -> 7 |
| shift-worker | 0 -> 4 | 0 -> 8 | 5 -> 15 | 0 -> 7 |
| parent | 0 -> 4 | 0 -> 7 | 5 -> 16 | 0 -> 7 |
| older-adult | 0 -> 4 | 2 -> 10 | 6 -> 17 | 1 -> 8 |
| glp1 | 0 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 2 |
| small-day | 0 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 1 |
| variety | 0 -> 4 | 0 -> 7 | 5 -> 16 | 0 -> 7 |

**Persona filters** (the fewest at any shop, before -> after, any diet unless named)

| persona | filter | breakfast | lunch | dinner | snack |
|---|---|---|---|---|---|
| footballer | carb-heavy | 2 -> 21 | 22 -> 55 | 84 -> 124 | 2 -> 20 |
| endurance | carb-heavy | 1 -> 17 | 28 -> 61 | 69 -> 115 | 1 -> 17 |
| combat | carb-heavy | 2 -> 11 | 17 -> 41 | 68 -> 96 | 2 -> 19 |
| older-adult | soft | 19 -> 39 | 20 -> 42 | 54 -> 76 | 5 -> 22 |
| older-adult, vegetarian | soft | 19 -> 38 | 9 -> 28 | 26 -> 40 | 5 -> 21 |
| budget-loss | <=£1.50 | 6 -> 13 | 6 -> 11 | 6 -> 14 | 7 -> 33 |
| budget-loss, vegan | <=£1.50 | 0 -> 1 | 0 -> 2 | 0 -> 1 | 1 -> 6 |
| student, no gluten | <=£1.50 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 3 -> 14 |
| parent | <=15 min | 27 -> 37 | 13 -> 23 | 8 -> 21 | 6 -> 24 |
| parent, vegan | <=15 min | 5 -> 10 | 2 -> 6 | 1 -> 4 | 1 -> 8 |
| parent, no gluten | <=15 min | 4 -> 7 | 1 -> 5 | 0 -> 9 | 3 -> 10 |
| parent, vegetarian | <=15 min | 25 -> 33 | 7 -> 14 | 4 -> 11 | 6 -> 23 |
| variety | <=15 min | 27 -> 37 | 13 -> 23 | 8 -> 21 | 6 -> 24 |
| variety | <=30 min | 35 -> 60 | 66 -> 103 | 65 -> 94 | 7 -> 28 |

**The plan's average day against the persona's calories** (planForBudget, no budget, variety 4), before -> after

| persona | day | diet | Sainsbury's | Morrisons | Waitrose | Iceland | Asda |
|---|---|---|---|---|---|---|---|
| footballer | 3,300 kcal | any | 90% -> 98% | 92% -> 98% | 88% -> 96% | 90% -> 98% | 91% -> 98% |
| footballer | 3,300 kcal | vegetarian | 91% -> 98% | 92% -> 96% | 89% -> 96% | 88% -> 97% | 92% -> 98% |
| footballer | 3,300 kcal | vegan | 84% -> 97% | 85% -> 96% | 82% -> 96% | 84% -> 100% | 82% -> 97% |
| footballer | 3,300 kcal | halal | 89% -> 98% | 91% -> 98% | 88% -> 97% | 89% -> 98% | 91% -> 98% |
| rugby | 4,000 kcal | any | 83% -> 97% | 87% -> 97% | 82% -> 98% | 83% -> 97% | 83% -> 98% |
| rugby | 4,000 kcal | vegetarian | 85% -> 97% | 88% -> 97% | 84% -> 97% | 80% -> 96% | 84% -> 98% |
| rugby | 4,000 kcal | vegan | 74% -> 95% | 75% -> 95% | 74% -> 95% | 73% -> 98% | 76% -> 95% |
| rugby | 4,000 kcal | halal | 82% -> 97% | 85% -> 97% | 83% -> 97% | 83% -> 99% | 83% -> 98% |
| rugby-4500 | 4,500 kcal | any | 77% -> 97% | 80% -> 96% | 78% -> 95% | 77% -> 94% | 76% -> 96% |
| rugby-4500 | 4,500 kcal | vegetarian | 79% -> 96% | 79% -> 96% | 77% -> 95% | 74% -> 95% | 73% -> 96% |
| rugby-4500 | 4,500 kcal | vegan | 66% -> 89% | 67% -> 90% | 68% -> 91% | 64% -> 89% | 67% -> 90% |
| rugby-4500 | 4,500 kcal | halal | 79% -> 98% | 80% -> 96% | 77% -> 95% | 80% -> 96% | 78% -> 97% |
| endurance | 3,200 kcal | any | 88% -> 95% | 90% -> 96% | 88% -> 96% | 89% -> 96% | 89% -> 97% |
| endurance | 3,200 kcal | vegetarian | 89% -> 95% | 90% -> 96% | 91% -> 95% | 87% -> 96% | 90% -> 96% |
| endurance | 3,200 kcal | vegan | 84% -> 94% | 84% -> 94% | 82% -> 93% | 85% -> 97% | 81% -> 94% |
| endurance | 3,200 kcal | halal | 89% -> 95% | 89% -> 97% | 91% -> 94% | 89% -> 97% | 87% -> 97% |
| power | 2,900 kcal | any | 98% -> 99% | 98% -> 98% | 95% -> 99% | 95% -> 98% | 94% -> 99% |
| power | 2,900 kcal | vegetarian | 97% -> 99% | 96% -> 98% | 95% -> 98% | 95% -> 99% | 96% -> 100% |
| power | 2,900 kcal | vegan | 88% -> 97% | 91% -> 98% | 90% -> 98% | 85% -> 104% | 89% -> 98% |
| power | 2,900 kcal | halal | 98% -> 98% | 98% -> 99% | 95% -> 97% | 97% -> 99% | 95% -> 99% |
| combat | 2,800 kcal | any | 94% -> 99% | 96% -> 99% | 96% -> 99% | 96% -> 98% | 96% -> 98% |
| combat | 2,800 kcal | vegetarian | 96% -> 99% | 97% -> 99% | 96% -> 100% | 96% -> 99% | 98% -> 99% |
| combat | 2,800 kcal | vegan | 91% -> 97% | 93% -> 97% | 92% -> 98% | 90% -> 102% | 92% -> 100% |
| combat | 2,800 kcal | halal | 96% -> 100% | 96% -> 100% | 95% -> 99% | 96% -> 98% | 97% -> 100% |
| gym-cut | 1,800 kcal | any | 100% -> 100% | 100% -> 100% | 100% -> 100% | 101% -> 99% | 100% -> 100% |
| gym-cut | 1,800 kcal | vegetarian | 101% -> 100% | 102% -> 101% | 100% -> 102% | 102% -> 101% | 104% -> 101% |
| gym-cut | 1,800 kcal | vegan | 103% -> 101% | 103% -> 102% | 103% -> 100% | 110% -> 109% | 103% -> 102% |
| gym-cut | 1,800 kcal | halal | 100% -> 101% | 100% -> 101% | 101% -> 100% | 102% -> 101% | 102% -> 99% |
| gym-bulk | 3,000 kcal | any | 97% -> 99% | 96% -> 99% | 95% -> 100% | 96% -> 99% | 92% -> 100% |
| gym-bulk | 3,000 kcal | vegetarian | 98% -> 100% | 97% -> 99% | 96% -> 99% | 94% -> 98% | 94% -> 99% |
| gym-bulk | 3,000 kcal | vegan | 88% -> 98% | 89% -> 97% | 88% -> 98% | 86% -> 103% | 87% -> 97% |
| gym-bulk | 3,000 kcal | halal | 96% -> 100% | 96% -> 100% | 94% -> 100% | 97% -> 99% | 92% -> 100% |
| budget-loss | 1,500 kcal | any | 100% -> 100% | 101% -> 100% | 98% -> 100% | 100% -> 100% | 103% -> 100% |
| budget-loss | 1,500 kcal | vegetarian | 101% -> 101% | 102% -> 101% | 101% -> 101% | 102% -> 101% | 105% -> 101% |
| budget-loss | 1,500 kcal | vegan | 105% -> 102% | 107% -> 101% | 104% -> 101% | 110% -> 111% | 109% -> 102% |
| budget-loss | 1,500 kcal | halal | 100% -> 100% | 100% -> 100% | 99% -> 100% | 100% -> 101% | 102% -> 100% |
| student | 2,300 kcal | any | 98% -> 99% | 99% -> 99% | 98% -> 100% | 98% -> 99% | 98% -> 100% |
| student | 2,300 kcal | vegetarian | 97% -> 98% | 99% -> 99% | 100% -> 100% | 98% -> 99% | 98% -> 99% |
| student | 2,300 kcal | vegan | 98% -> 100% | 97% -> 100% | 97% -> 99% | 100% -> 102% | 98% -> 100% |
| student | 2,300 kcal | halal | 98% -> 99% | 98% -> 99% | 98% -> 100% | 100% -> 99% | 98% -> 99% |
| shift-worker | 2,200 kcal | any | 97% -> 100% | 100% -> 101% | 98% -> 100% | 98% -> 100% | 100% -> 100% |
| shift-worker | 2,200 kcal | vegetarian | 98% -> 100% | 101% -> 100% | 100% -> 100% | 100% -> 101% | 99% -> 100% |
| shift-worker | 2,200 kcal | vegan | 96% -> 100% | 101% -> 101% | 101% -> 101% | 101% -> 103% | 100% -> 102% |
| shift-worker | 2,200 kcal | halal | 98% -> 100% | 100% -> 100% | 98% -> 100% | 98% -> 100% | 100% -> 100% |
| parent | 2,000 kcal | any | 100% -> 100% | 99% -> 100% | 99% -> 101% | 99% -> 100% | 98% -> 100% |
| parent | 2,000 kcal | vegetarian | 99% -> 100% | 99% -> 99% | 100% -> 100% | 101% -> 101% | 99% -> 100% |
| parent | 2,000 kcal | vegan | 99% -> 100% | 101% -> 100% | 102% -> 101% | 103% -> 102% | 99% -> 100% |
| parent | 2,000 kcal | halal | 99% -> 99% | 100% -> 99% | 100% -> 100% | 100% -> 100% | 100% -> 100% |
| older-adult | 1,800 kcal | any | 98% -> 100% | 99% -> 100% | 98% -> 100% | 99% -> 99% | 99% -> 99% |
| older-adult | 1,800 kcal | vegetarian | 100% -> 100% | 99% -> 99% | 99% -> 99% | 99% -> 100% | 99% -> 100% |
| older-adult | 1,800 kcal | vegan | 101% -> 101% | 100% -> 100% | 99% -> 99% | 102% -> 101% | 102% -> 100% |
| older-adult | 1,800 kcal | halal | 98% -> 99% | 100% -> 99% | 99% -> 100% | 98% -> 99% | 99% -> 99% |
| glp1 | 1,400 kcal | any | 99% -> 100% | 99% -> 100% | 99% -> 99% | 101% -> 100% | 102% -> 101% |
| glp1 | 1,400 kcal | vegetarian | 102% -> 100% | 103% -> 100% | 106% -> 100% | 105% -> 100% | 106% -> 101% |
| glp1 | 1,400 kcal | vegan | 110% -> 103% | 110% -> 106% | 112% -> 107% | 115% -> 113% | 113% -> 107% |
| glp1 | 1,400 kcal | halal | 99% -> 100% | 100% -> 101% | 98% -> 100% | 98% -> 100% | 104% -> 101% |
| small-day | 1,200 kcal | any | 100% -> 100% | 101% -> 101% | 101% -> 101% | 100% -> 101% | 101% -> 101% |
| small-day | 1,200 kcal | vegetarian | 104% -> 101% | 104% -> 102% | 104% -> 102% | 104% -> 102% | 103% -> 103% |
| small-day | 1,200 kcal | vegan | 107% -> 104% | 112% -> 104% | 112% -> 105% | 114% -> 117% | 112% -> 105% |
| small-day | 1,200 kcal | halal | 101% -> 100% | 102% -> 100% | 101% -> 102% | 101% -> 101% | 102% -> 100% |
| variety | 2,000 kcal | any | 100% -> 100% | 99% -> 100% | 99% -> 101% | 99% -> 100% | 98% -> 100% |
| variety | 2,000 kcal | vegetarian | 99% -> 100% | 99% -> 99% | 100% -> 100% | 101% -> 101% | 99% -> 100% |
| variety | 2,000 kcal | vegan | 99% -> 100% | 101% -> 100% | 102% -> 101% | 103% -> 102% | 99% -> 100% |
| variety | 2,000 kcal | halal | 99% -> 99% | 100% -> 99% | 100% -> 100% | 100% -> 100% | 100% -> 100% |

**Still thin, worst first** (the 40 likeliest answers with the fewest recipes; full list in `web/.recipe-shops/personas-final.md`, regenerate with the command above)

| # | persona | diet | shop | meal | filter | recipes |
|---|---|---|---|---|---|---|
| 1 | budget-loss | vegan | Sainsbury's | breakfast | <=£1.50 | 2 |
| 2 | budget-loss | vegan | Asda | lunch | <=£1.50 | 2 |
| 3 | student | any | Waitrose | dinner | <=£1.50 | 6 |
| 4 | budget-loss | vegan | Asda | dinner | <=£1.50 | 3 |
| 5 | budget-loss | vegan | Morrisons | breakfast | <=£1.50 | 2 |
| 6 | budget-loss | vegan | Asda | breakfast | <=£1.50 | 4 |
| 7 | student | no gluten | Sainsbury's | breakfast | <=£1.50 | 2 |
| 8 | student | vegan | Asda | lunch | <=£1.50 | 2 |
| 9 | student | vegan | Asda | dinner | <=£1.50 | 2 |
| 10 | budget-loss | vegan | Waitrose | breakfast | <=£1.50 | 1 |
| 11 | student | no gluten | Sainsbury's | lunch | <=£1.50 | 3 |
| 12 | budget-loss | no gluten | Morrisons | breakfast | <=£1.50 | 3 |
| 13 | budget-loss | vegan | Waitrose | lunch | <=£1.50 | 2 |
| 14 | budget-loss | no gluten | Waitrose | lunch | <=£1.50 | 1 |
| 15 | parent | vegan | Sainsbury's | dinner | <=15 min | 5 |
| 16 | student | no gluten | Morrisons | breakfast | <=£1.50 | 1 |
| 17 | student | no gluten | Asda | breakfast | <=£1.50 | 3 |
| 18 | student | no gluten | Asda | lunch | <=£1.50 | 3 |
| 19 | budget-loss | no gluten | Waitrose | breakfast | <=£1.50 | 2 |
| 20 | budget-loss | no milk | Waitrose | lunch | <=£1.50 | 2 |
| 21 | budget-loss | no milk | Morrisons | breakfast | <=£1.50 | 4 |
| 22 | student | vegan | Asda | breakfast | <=£1.50 | 4 |
| 23 | parent | no gluten | Sainsbury's | lunch | <=15 min | 5 |
| 24 | budget-loss | no gluten | Asda | breakfast | <=£1.50 | 5 |
| 25 | budget-loss | no gluten | Asda | lunch | <=£1.50 | 5 |
| 26 | student | vegan | Sainsbury's | breakfast | <=£1.50 | 5 |
| 27 | budget-loss | no gluten | Waitrose | dinner | <=£1.50 | 3 |
| 28 | budget-loss | no milk | Waitrose | breakfast | <=£1.50 | 3 |
| 29 | budget-loss | vegan | Iceland | breakfast | any | 2 |
| 30 | rugby-4500 | any | Sainsbury's | lunch | <=15 min | 3 |
| 31 | budget-loss | vegan | Iceland | breakfast | <=£1.50 | 1 |
| 32 | budget-loss | vegan | Iceland | dinner | <=£1.50 | 1 |
| 33 | gym-cut | vegan | Iceland | breakfast | any | 1 |
| 34 | gym-cut | vegan | Iceland | lunch | any | 1 |
| 35 | gym-cut | vegan | Iceland | dinner | any | 1 |
| 36 | student | no gluten | Waitrose | lunch | <=£1.50 | 0 |
| 37 | student | no gluten | Waitrose | dinner | <=£1.50 | 0 |
| 38 | student | no gluten | Morrisons | lunch | <=£1.50 | 3 |
| 39 | student | vegan | Waitrose | dinner | <=£1.50 | 2 |
| 40 | student | no gluten | Waitrose | breakfast | <=£1.50 | 1 |

### What is still thin

- **Vegan at Iceland** (0 to 4 lunches and dinners for small days, GLP-1, cutting and rugby): Iceland sells no tofu, and the vegan stand-in is chickpeas, which
  can't carry a protein-first meal. At the four shops that sell tofu, vegan small-day, GLP-1 and cutting meals are now 7 to 23 a meal.
- **Vegan on a tight budget** (£1.50 a serving or less: 1 to 4 a meal at Asda, Waitrose and Morrisons): tofu costs £2.90 a block at a small shop's size, and
  pulse-led dishes don't reach a 30 g protein meal.
- **No gluten on a student's or tight budget** (0 to 5 a meal): rice and potatoes are the only gluten-free carbs, and Waitrose and Asda sell no new potatoes
  with a label.
- **Vegan with no soya** (0 to 8 a meal): only pulses, peanut butter and oat drink are left, and none reaches a high-protein meal.
- **15-minute vegan and gluten-free dinners for parents** (4 to 9) and 15-minute lunches at a rugby player's size (0 to 2).

### The planner on big and small days

Measured at Sainsbury's (3 meals, and snacks as each person has them; no budget; variety 4): the plan's average day as a share of the person's calories.

| day | before (442) | after (640) |
|---|---|---|
| 1,200 kcal, 90 g, 1 snack | 100% | 100% |
| 1,400 kcal, 100 g, GLP-1 450 kcal meal cap, 2 snacks | 99% | 100% |
| 1,500 kcal, 110 g, no snacks | 100% | 100% |
| 3,300 kcal, 150 g (footballer), 2 snacks | 90% | 98% |
| 3,500 kcal, 180 g, 2 snacks | 89% | 98% |
| 4,000 kcal, 200 g (rugby), 3 snacks | 83% | 97% |
| 4,000 kcal, 200 g, no snacks (1,330 kcal meals) | 75% | 98% |
| 4,500 kcal, 220 g (rugby, match week), 3 snacks | 77% | 97% |

Small days were never the problem. Big days fell short because a recipe's protein and carb ingredients move at most to double (`fitRecipe`), so the biggest
breakfasts reached about 950 kcal and the biggest dinners about 1,140; protein was met and calories weren't. The new big breakfasts, lunches and dinners are
written at 650 to 900 kcal with nearly all their calories in the parts that move, so they reach 1,250 to 1,400 kcal. Vegans are still lowest on big days
(95 to 98% at 4,000 kcal and 89 to 91% at 4,500 at the five shops, against 73 to 76% and 64 to 68% before).

**The snack cap (250 kcal) is not what holds big days back now.** Simulated with the cap at 400 kcal for days of 3,000 kcal or more, or at 12.5% of the day up to
450, on the new book (3,300 to 4,500 kcal, 2 or 3 snacks, Sainsbury's and Asda): from 2 points better to 5 points worse, worst on the biggest days, because
the snacks can't grow that far either and the meals shrink to make room. **Proposal: change nothing.** If the founder wants the last 3% on a 4,500 kcal day, the smallest
change is to let carb ingredients go to 2.5 times their written amount only for meals over 1,000 kcal (`SCALES` in `lib/mm/recipes.ts`): not built, not
measured, and it would change the amounts on those recipe pages (rule 8: needs the founder's go-ahead).
