# Who Meal plan has to feed: personas for the recipe book (26 November 2026)

Founder, 26 November: "it needs to suit literally everyone. Like, someone could be a professional footballer and you want to give them the best diet plan
possible ... someone who does rugby might need more, like, different stuff ... you need to make the best diet plan for like each individual. So it's important
to have as many recipes as possible that cater to different things."

This is the brief for the second wave of recipes (`web/lib/mm/recipeBook/wave2*.ts`) and for the persona audit (`web/tests/recipePersonas.check.test.ts`,
results in `docs/RECIPE_COVERAGE_2026-11-26.md`). For each kind of person it says what their days add up to, when they eat, and which recipes the book needs
so Meal plan can fill every meal of their week, in every diet the app has.

The figures are starting points from recognised guidance (sources at the end), worked out for one reference person each. They are for writing recipes and
testing the planner. **They are not shown in the app, and nothing here is advice to a person:** each person's own numbers come from their answers in
Meal plan (`lib/mm/bodyGoal.ts`, approved by the founder 26 November), and every meal's figures come from the shops' labels (CLAUDE.md rule 1). Food is never
called healthy, good or bad (rule 3), and there is no weight-cutting advice for anyone (combat sports included).

## How the planner sizes a day (what the recipes have to reach)

`slotTargets` (`web/lib/mm/mealPlan.ts`) splits the day: each snack is a tenth of the day, **held between 100 and 250 kcal**; the meals share the rest
equally (or one is 1.3 times the others when the person picked a biggest meal); protein follows each slot's share of the calories. `fitRecipe`
(`web/lib/mm/recipes.ts`) then moves only a recipe's protein and carb ingredients, each between **half and double** the written amount (tinned pulses at most
1.5 times); sauces, vegetables and fats stay as written. A recipe is usable for a slot when the fitted serving is within `MAX_SWAP_DISTANCE` (0.3, the
calorie gap plus the protein gap as shares) of the slot.

So, for a recipe to reach a slot:

| Day | Shape | Each meal | Each snack |
|---|---|---|---|
| 4,500 kcal, 220 g protein (rugby forward, match week) | 3 meals, 3 snacks | 1,250 kcal, 61 g | 250 kcal, 12 g |
| 4,000 kcal, 200 g (rugby) | 3 meals, 3 snacks | 1,080 kcal, 54 g | 250 kcal, 12 g |
| 3,500 kcal, 160 g (footballer, heavy week; endurance) | 3 meals, 2 snacks | 1,000 kcal, 46 g | 250 kcal, 11 g |
| 2,800 kcal, 170 g (gym bulk) | 3 meals, 1 snack | 850 kcal, 52 g | 250 kcal, 15 g |
| 2,000 kcal, 100 g (eat well, parents, students) | 3 meals, 1 snack | 580 kcal, 29 g | 200 kcal, 10 g |
| 1,500 kcal, 110 g (losing weight) | 3 meals, 1 snack | 450 kcal, 33 g | 150 kcal, 11 g |
| 1,400 kcal, 100 g, 450 kcal meal cap (GLP-1) | 3 meals, 2 snacks | 380 kcal, 27 g | 140 kcal, 10 g |
| 1,200 kcal, 90 g (smallest day the app suggests) | 3 meals, 1 snack | 360 kcal, 27 g | 120 kcal, 9 g |

What that means for the book:

- **Big days need big, scalable recipes**: written at 650 to 900 kcal a serving with most of the calories in the protein and carb ingredients (rice,
  pasta, potatoes, oats, bread, chicken, mince, eggs, tofu), so doubling them reaches 1,100 to 1,400 kcal. A dish whose calories sit in cheese, oil or
  sauce can't grow.
- **Small days need protein-first recipes that halve cleanly**: written at 450 to 600 kcal with 30 g or more of protein and a carb side that can shrink,
  so a 360 kcal serving still has 27 g of protein.
- **Snacks have to work at both ends**: 100 to 150 kcal with 8 to 12 g of protein (yogurt pots, cottage cheese, eggs) and 250 kcal with carbs before or
  after training (bagel-style toast, rice pudding, overnight oats, banana smoothies).

## The personas

Each persona gives the day (reference person), the macros, when they eat, and the food types Meal plan must offer. "g/kg" is per kg of body weight a day.

### 1. Professional footballer

- **Reference:** man, 75 kg, trains most days, one or two matches a week. About 2,600 kcal on light days and 3,200 to 3,600 kcal on heavy training and
  match days.
- **Carbs:** periodised: 3 to 6 g/kg on light or recovery days (225 to 450 g), 6 to 8 g/kg the day before a match and on match day (450 to 600 g)
  (UEFA expert group statement 2021); after a match, about 1 to 1.2 g/kg an hour for the first hours when the next session is close (ACSM/AND/DC 2016).
- **Protein:** 1.6 to 2.2 g/kg (120 to 165 g), in 4 or 5 servings of about 0.3 to 0.4 g/kg (25 to 30 g) every 3 to 5 hours, one of them soon after
  training.
- **Timing:** a pre-match meal 3 to 4 hours before (1 to 3 g/kg carbs, not too much fat or fibre: rice, pasta, potatoes, bread, chicken, eggs); a carb
  snack 1 hour before (banana, toast with honey); a recovery meal within an hour after (carbs and 25 to 40 g protein).
- **Meal plan must offer:** carb-heavy main meals (pasta, rice, noodles, potatoes) that scale to 1,000 kcal; plain pre-match dinners (chicken and
  rice, pasta with a tomato sauce, jacket-style potatoes); recovery meals and drinks (chocolate milk-style shakes, rice pudding, yogurt and granola, egg
  and toast); pre-training snacks; breakfasts of 700 to 900 kcal (porridge, eggs and toast, pancakes).

### 2. Rugby player

- **Reference:** forward, man, 105 kg. Measured energy use of professional rugby players is commonly 3,500 to 5,000 kcal a day; this book has to fill
  **3,500 to 4,500 kcal** days. Backs are lighter and need more carbs around matches, like a footballer.
- **Protein:** 1.6 to 2.2 g/kg (170 to 230 g): 5 or 6 servings of 30 to 50 g.
- **Carbs:** 3 to 5 g/kg on most days (315 to 525 g), more on match day and the day before.
- **Timing:** three big meals and two or three snacks; a recovery meal or shake after training; a protein snack before bed (yogurt, cottage cheese, milk).
- **Meal plan must offer:** **big-portion dinners and lunches** that reach 1,100 to 1,400 kcal with 55 to 70 g protein (mince and rice, chicken and
  pasta bakes, chilli with rice and beans, curry with rice and naan, burrito bowls, cottage pie); big breakfasts (eggs, beans, toast; porridge made with
  milk; breakfast burritos); and snacks with protein **and** carbs (toast with eggs, yogurt with granola, peanut butter on toast, milk-based smoothies).

### 3. Endurance: runners, cyclists, swimmers

- **Reference:** woman or man, 65 kg, 1 to 2 hours of training most days (cyclists up to 4 to 5 hours on long days). About 2,600 to 3,500 kcal.
- **Carbs:** the highest of any persona: 6 to 10 g/kg on 1 to 3 hours a day (390 to 650 g), 8 to 12 g/kg on very long days (ACSM/AND/DC 2016).
  Carbs are 55 to 65% of the calories on training days.
- **Protein:** 1.2 to 2.0 g/kg (80 to 130 g), 20 to 30 g a meal.
- **Timing:** 1 to 4 g/kg carbs 1 to 4 hours before a key session; 30 to 60 g carbs as a small snack 30 to 60 minutes before an early session (swimmers
  often train at 6 am: banana, toast, a small bowl of cereal); after, carbs and 20 to 30 g protein, then a full meal.
- **Meal plan must offer:** carb-heavy mains (pasta, rice, noodles, potatoes) with little fat in them; big
  breakfasts (porridge, overnight oats, pancakes, toast with honey or banana); pre-session snacks (banana toast, rice pudding, honey on toast, cereal
  with milk); recovery snacks and smoothies (banana and oat milkshakes, yogurt with granola, chocolate-flavoured milk with oats).

### 4. Sprinters and power athletes (sprints, jumps, throws, weightlifting)

- **Reference:** 80 kg. About 2,600 to 3,200 kcal.
- **Carbs:** moderate, 3 to 5 g/kg (240 to 400 g), more on heavy training days (IAAF/World Athletics consensus 2019).
- **Protein:** 1.6 to 2.2 g/kg (130 to 175 g), 0.3 to 0.4 g/kg (25 to 35 g) every 3 to 4 hours, one serving soon after training.
- **Meal plan must offer:** high-protein mains with a moderate carb side (chicken, beef mince, salmon, eggs, tofu with rice or potatoes); protein
  breakfasts (eggs, cottage cheese, yogurt bowls); protein snacks with some carbs.

### 5. Combat sports (boxing, MMA, judo, jiu-jitsu)

- **Reference:** 75 kg, two sessions some days. About 2,400 to 3,200 kcal.
- **Carbs:** 3 to 6 g/kg, more on hard days. **Protein:** 1.6 to 2.2 g/kg (120 to 165 g).
- **No weight-cutting:** the plan never suggests dehydration, crash diets or "making weight"; it uses the person's own numbers (CLAUDE.md rule 3). A
  person who wants to lose fat chooses "Lose fat", which never goes below 1,200 kcal or 1 kg a week.
- **Meal plan must offer:** the same as a footballer, at smaller sizes: carb-and-protein mains, recovery snacks, quick meals between two sessions.

### 6. Gym-goers: cutting and bulking

- **Cutting:** man, 80 kg at 20% body fat (64 kg lean): about 2,000 to 2,200 kcal and 130 g protein (2 g per kg of lean mass: the app's own figure;
  the ISSN's range is 1.4 to 2.0 g/kg of body weight, higher when eating less). Woman, 65 kg at 28%: about 1,500 to 1,700 kcal and 95 g protein.
  **Meal plan must offer:** protein-first meals of 400 to 550 kcal with 35 to 45 g protein, plenty of vegetables for a full plate, and snacks of 100 to
  200 kcal with 10 to 20 g protein.
- **Bulking:** man, 80 kg: about 2,900 to 3,300 kcal (250 to 500 kcal over), 130 to 175 g protein (1.6 to 2.2 g/kg), carbs 4 to 7 g/kg.
  **Meal plan must offer:** the rugby player's big meals at a smaller size: 850 to 1,000 kcal meals with 45 to 55 g protein, big breakfasts, and
  250 kcal snacks with protein.

### 7. Losing weight on a tight budget

- **Reference:** woman, 1,400 kcal; man, 1,900 kcal (the NHS 12-week plan's starting figures: about 600 kcal a day less than they burn, 0.5 to 1 kg a
  week). Protein 90 to 120 g. A budget of about £25 to £35 a week for one.
- **Meal plan must offer:** **cheap batch-cooks** (4 to 6 servings) that halve to 350 to 450 kcal with 25 to 35 g protein: bean chillis, chicken and vegetable stews, egg fried rice, tuna pasta bakes, mince and bean dishes; cheap breakfasts (porridge, eggs on toast,
  wheat biscuits); cheap snacks (yogurt, eggs, apples with peanut butter). Repeating meals is fine (variety 2 or 4).

### 8. Students

- **Reference:** 18 to 24, 2,000 to 2,600 kcal, 90 to 130 g protein, a budget, one hob and a microwave, little time.
- **Meal plan must offer:** one-pan and one-pot meals in 30 minutes or less, batch-cooks that keep for 3 days in a fridge, lunches to carry (pasta
  salads, wraps, rice boxes), cheap breakfasts, and big cheap dinners for active students.

### 9. Shift workers (nurses, care staff, warehouse, drivers)

- **Reference:** 2,000 to 2,500 kcal, 90 to 130 g protein. Common UK workplace guidance (for example NHS Employers' advice for night-shift staff): eat a
  proper meal before the shift, then lighter meals and snacks through the night, and something light before sleeping in the day.
- **Meal plan must offer:** meals that are eaten cold or reheated and carried (boxes, salads, frittatas, rice dishes, pasta salads); light lunches of
  350 to 500 kcal; snacks that keep in a bag; quick breakfasts after a night shift.

### 10. Busy parents (15-minute meals)

- **Reference:** 2,000 kcal, 100 g protein, cooking for 3 or 4, children in the house.
- **Meal plan must offer:** **dinners in 15 minutes** (and 20), mild, cooked in one pan, that serve 4: noodles, pasta with a quick sauce, wraps,
  quesadillas, egg dishes, stir-fries; quick breakfasts (10 minutes) and lunches.

### 11. Older adults

- **Reference:** 70 kg, 65 and over, 1,600 to 2,200 kcal; smaller appetites. Protein 1.0 to 1.2 g/kg (70 to 85 g) (PROT-AGE 2013; ESPEN expert group
  2014), with **25 to 30 g at each meal**.
- **Meal plan must offer:** **soft textures** (soups with protein, stews, fish pie, shepherd's-pie-style mash, scrambled and poached eggs, porridge,
  rice pudding, risotto-style rice, flaked salmon, mince); smaller meals with protein; snacks that add protein (yogurt, cottage cheese, milk drinks).
  Nothing hard or very chewy, nothing that needs fiddly skills.

### 12. GLP-1 users (smaller, protein-first meals)

- **Reference:** 1,200 to 1,600 kcal, 90 to 110 g protein, the app's meal cap (450 kcal unless the person sets their own). The app's words are
  "smaller, protein-first" (CLAUDE.md rule 3): no medication guidance, nothing about doses or side effects.
- **Meal plan must offer:** meals of 300 to 450 kcal that keep 25 to 35 g of protein when they are made smaller; plain, simple dishes (eggs, fish,
  chicken, yogurt, soups); small snacks of 100 to 150 kcal with 8 to 15 g protein.

### 13. People who want lots of variety

- **Reference:** 2,000 kcal, any diet, Meal plan's variety set to 7 (a different recipe every day).
- **Meal plan must offer:** **at least 7 recipes for each meal, in their diet, at their shop** (14 or more so a second week differs), from several
  cuisines.

## Diets: who can realistically be fed

Every persona above is planned in every diet below where realistic. "Hard" means the book has to go out of its way for it.

| Diet | Protein foods the book can use (small-shop rule: tofu and soya drink pass; Quorn, edamame and protein powder don't, `web/lib/mm/localRangeProtein.ts`) | Hard for |
|---|---|---|
| Any | everything | - |
| Vegetarian | eggs, milk, yogurt, cottage cheese, cheese, beans, chickpeas, tofu | rugby and bulking (needs eggs, dairy or tofu every meal) |
| Vegan | tofu, chickpeas, kidney beans, baked beans, peanut butter, soya drink, houmous | rugby, power, cutting (protein per kcal is low in pulses: tofu carries it) |
| Pescatarian | salmon, smoked salmon, tuna, eggs, dairy, pulses, tofu | - |
| Halal | halal chicken and beef mince (where the shop names it), fish, eggs, dairy, pulses | shops with no halal-named meat: fish, eggs and pulses carry it |
| Jain | milk, yogurt, cottage cheese, vegetarian cheeses, chickpeas, kidney beans, tofu, peanuts, almonds (no eggs, roots, onion, garlic, mushrooms, honey) | every high-protein persona: needs tofu, dairy and pulses in every meal |
| Kosher style | no pork or shellfish, never meat with dairy in one dish | meat dishes must have no cheese, yogurt or milk |
| No onion or garlic | everything but onion, garlic and the sauces, stocks and pastes that print them | quick dinners (most jars have onion or garlic) |
| No pork, no beef | the rest | - |
| No alcohol | everything but the few products that print alcohol | - |
| The 14 allergens | gluten, milk and eggs are the hard ones: rice, potatoes, oats-free breakfasts (eggs, yogurt), tofu, meat, fish | no gluten + no eggs breakfasts; no milk snacks; vegan + no soya (no tofu, no soya drink) |

Realistic but out of reach with the everyday and small-shop kinds: a vegan rugby forward at 220 g of protein (tofu, pulses and peanut butter alone can't
reach it at 4,000 kcal without protein powder, which a small shop doesn't sell: `web/lib/mm/localRangeProtein.ts`), and a Jain power athlete at 175 g.
The plan still fills their days with the most protein the book can give; the coverage report says where it falls short.

## What the audit checks

`web/tests/recipePersonas.check.test.ts` (a writer's tool, skipped unless `REPORT=personas`) counts, for every persona above, every diet that suits it, every
meal, the cooking times 15, 30 and 45 minutes, and each of the five big shops (Sainsbury's, Morrisons, Waitrose, Iceland, Asda), the recipes Meal plan could
use, exactly as the planner fits them (`planCandidates`, `MAX_SWAP_DISTANCE`). For the athletes it also counts the carb-heavy meals (carbs at least 50% of the
fitted serving's calories) a training day needs; for older adults the soft ones (by the recipe's own words: soup, stew, pie, mash, scrambled, porridge,
rice pudding, risotto, curry, chilli, flaked); for parents the 15-minute ones. A meal with fewer than 7 is thin. Results: `docs/RECIPE_COVERAGE_2026-11-26.md`.

## Sources

- Thomas DT, Erdman KA, Burke LM. American College of Sports Medicine, Academy of Nutrition and Dietetics and Dietitians of Canada joint position statement:
  Nutrition and athletic performance. *Med Sci Sports Exerc* 2016;48(3):543-568. (Carbs 3-5, 5-7, 6-10 and 8-12 g/kg by training load; protein 1.2-2.0 g/kg,
  0.3 g/kg a meal; 1-4 g/kg before; 1.0-1.2 g/kg an hour after when recovery is short.)
- Jäger R et al. International Society of Sports Nutrition position stand: protein and exercise. *J Int Soc Sports Nutr* 2017;14:20. (1.4-2.0 g/kg;
  20-40 g a meal every 3-4 hours.)
- Kerksick CM et al. International Society of Sports Nutrition position stand: nutrient timing. *J Int Soc Sports Nutr* 2017;14:33.
- Collins J et al. UEFA expert group statement on nutrition in elite football. *Br J Sports Med* 2021;55:416. (Periodised carbs; 6-8 g/kg around matches.)
- Burke LM et al. International Association of Athletics Federations consensus statement 2019: nutrition for athletics. *Int J Sport Nutr Exerc Metab*
  2019;29(2):73-84; and Slater GJ et al., sprints, jumps and throws, same issue, 85-94.
- Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation. *J Int Soc Sports Nutr* 2014;11:20.
- Bauer J et al. Evidence-based recommendations for optimal dietary protein intake in older people (PROT-AGE Study Group). *J Am Med Dir Assoc*
  2013;14(8):542-559; Deutz NEP et al. Protein intake and exercise for optimal muscle function with aging (ESPEN Expert Group). *Clin Nutr*
  2014;33(6):929-936. (1.0-1.2 g/kg; 25-30 g a meal.)
- NHS: "Lose weight" and the NHS Weight Loss Plan (about 600 kcal a day less than you burn; 0.5 to 1 kg a week); the Eatwell Guide (2,000 and 2,500 kcal
  reference days).
- The app's own rules: CLAUDE.md rule 3 (GLP-1 copy, no medical claims), `lib/mm/bodyGoal.ts` (protein 2 g/kg lean mass, 1.6 g/kg for sport; no less than
  1,200 kcal), `lib/mm/budget.ts` (`DEFAULT_GLP1_MEAL_CAP` 450 kcal).
