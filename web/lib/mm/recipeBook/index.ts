import type { Recipe } from "../recipes";
import { BREAKFAST } from "./breakfast";
import { CHRISTMAS } from "./christmas";
import { CORE } from "./core";
import { DINNER_HOME } from "./dinnerHome";
import { DINNER_WORLD } from "./dinnerWorld";
import { EVERYDAY_BREAKFAST } from "./everydayBreakfast";
import { EVERYDAY_LUNCHES } from "./everydayLunches";
import { EVERY_SHOP } from "./everyShop";
import { FAST_MEALS } from "./fastMeals";
import { GLUTEN_FREE } from "./glutenFree";
import { HOME_SNACKS } from "./homeSnacks";
import { KETO_MEALS } from "./ketoMeals";
import { LONGEVITY_DINNERS } from "./longevityDinners";
import { LONGEVITY_MORNING } from "./longevityMorning";
import { LUNCH } from "./lunch";
import { MEDITERRANEAN } from "./mediterranean";
import { MORE_MAINS } from "./moreMains";
import { ONION_FREE_MEALS } from "./onionFreeMeals";
import { PALEO_MEALS } from "./paleoMeals";
import { PROTEIN_MEALS } from "./proteinMeals";
import { PROTEIN_MORNINGS } from "./proteinMornings";
import { QUICK_DINNERS } from "./quickDinners";
import { SNACKS } from "./snacks";
import { VEGAN_MAINS } from "./veganMains";
import { VEGAN_MORNING } from "./veganMorning";
import { WAVE2 } from "./wave2";
import { WORLD_MEALS } from "./worldMeals";

// The recipe book: our own recipes, built from the pantry (lib/mm/pantry.ts). Each ingredient is a kind of food, not a product: the app
// finds the products at the person's shop (or a substitute when the shop doesn't sell it) and works out every number from their labels.
// Rules for every recipe (tests/recipeBook.test.ts checks them):
// - plain British English anyone can follow, including older people, students and beginners; each step is "Short title: instruction." (founder
//   2026-11-16: "clear steps for the person to do"): a 1-to-5-word title, then one job in at most 45 words, with a time and a sign where it cooks;
// - the name and blurb describe the dish and never make a health or nutrition claim (no "healthy", "light", "lean", "guilt-free",
//   "high-protein", "low-calorie"...), and no step gives a nutrition figure or a price;
// - say how to tell food is cooked: chicken, pork and mince until piping hot with no pink left, fish until it flakes easily, eggs until set;
// - amounts are for the whole recipe, as weighed before cooking (dry pasta and rice, drained tins); servings 1 to 6;
// - every ingredient is a pantry kind, down to the pinch of salt (listed, priced and counted), and an everyday one (EVERYDAY_KINDS in
//   lib/mm/pantry.ts): something nearly every small convenience shop sells, so a Tesco Express or a Sainsbury's Local has it too. The one exception is the
//   Christmas recipes (christmas.ts), which may also use FESTIVE_KINDS; niches.ts files them under the Christmas occasion, offered only 1 November to 6 January;
//   and, since 2026-11-26, any recipe may use the few PROTEIN_KINDS (tofu, Quorn, edamame, protein powder, soya drink), which most of the shops sell;
//   recipes written from the second wave on (wave2.ts) only the ones a Sainsbury's Local stocks (tofu, Quorn, soya drink: lib/mm/localRangeProtein.ts,
//   founder 2026-11-26: "If it's something that would only be available at a massive Sainsbury's and not Sainsbury's local, you'll have to leave it out");
// - a recipe's cuisine and the occasions it suits are not written on the recipe: they are one line each in niches.ts (the Recipes screen's Cuisine and Occasion
//   choices; tests/recipeNiche.test.ts checks every line names a recipe in the book), so a new recipe gets its line there.

// founder 2026-11-16: "we need plenty of recipes because people are restricted with different dietary requirements": four more files of 12, written
// for the diets with the fewest recipes (vegan, gluten-free, vegetarian, fish and halal-friendly).
export const RECIPES: readonly Recipe[] = [...CORE, ...BREAKFAST, ...LUNCH, ...DINNER_WORLD, ...DINNER_HOME, ...SNACKS, ...CHRISTMAS, ...VEGAN_MORNING, ...VEGAN_MAINS, ...GLUTEN_FREE, ...MORE_MAINS,
  // founder 2026-11-20 ("maybe add some more breakfast items"): everyday British breakfasts, most of them on toast
  ...EVERYDAY_BREAKFAST,
  // founder 2026-11-20, 22:25 ("make the most longevity-backed diet ... that's the one that I want to see"): the Longevity style's breakfasts and lunches
  ...LONGEVITY_MORNING,
  // founder 2026-11-20, 22:25 (the same "most longevity-backed diet"): its dinners and snacks
  ...LONGEVITY_DINNERS,
  // founder 2026-11-20, 22:00 ("Give more options like keto or whatever ... make new recipes"): keto lunches and dinners, which the book had none of
  ...KETO_MEALS,
  // founder 2026-11-20, 22:00 ("as many options as you can think about people would choose"): paleo meals (no grains, beans or dairy)
  ...PALEO_MEALS,
  // founder 2026-11-20, 22:00 ("as many options as you can think about people would choose"): Mediterranean-style chicken, fish and bean dishes
  ...MEDITERRANEAN,
  // founder 2026-11-20 ("a lot of them are to do with [wraps] ... You can't just do [wraps] every single day"): lunches that aren't wraps
  ...EVERYDAY_LUNCHES,
  // founder 2026-11-20 ("You want kind of like a varied diet"): weeknight dinners in 20 minutes or less, so the Quick style has one for every night
  ...QUICK_DINNERS,
  // founder 2026-11-21 ("all the shops, like, they should have recipes ... why does the ones that have ingredients not have recipes"): lunches and dinners
  // made only from what nearly every supermarket in the app sells
  ...EVERY_SHOP,
  // founder 2026-11-21 ("You should have different recipes from around the planet, like ones people actually want to see ... look at what [the meal prep
  // companies are] serving"): world plates and bowls, no wraps, sandwiches or toast
  ...WORLD_MEALS,
  // founder 2026-11-26 ("also have like protein flapjack etc recipes ones that people may just want to cook at home"): snacks and bakes, many of them with
  // yogurt, cottage cheese, eggs, tofu or edamame, so Meal plan's snack slots have enough that fit (docs/RECIPE_COVERAGE_2026-11-26.md)
  ...HOME_SNACKS,
  // founder 2026-11-26 ("make more recipes so that my app caters for multiple inputs a user would need"): breakfasts, lunches and dinners with more protein
  // for vegan and vegetarian plans, which had none that reached a fat-loss or muscle meal's protein
  ...PROTEIN_MORNINGS, ...PROTEIN_MEALS,
  // founder 2026-11-26 (the same): lunches and dinners with no onion, garlic or root vegetables (the Jain diet had none), then 15-minute dinners, lunches for
  // the cuisines with the fewest, and keto and paleo dinners
  ...ONION_FREE_MEALS, ...FAST_MEALS,
  // founder 2026-11-26 ("it needs to suit literally everyone ... a professional footballer ... someone who does rugby"): the second wave, for the personas in
  // docs/RECIPE_PERSONAS_2026-11-26.md (wave2.ts)
  ...WAVE2];
