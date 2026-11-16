import type { Recipe } from "../recipes";
import { BREAKFAST } from "./breakfast";
import { CHRISTMAS } from "./christmas";
import { CORE } from "./core";
import { DINNER_HOME } from "./dinnerHome";
import { DINNER_WORLD } from "./dinnerWorld";
import { GLUTEN_FREE } from "./glutenFree";
import { LUNCH } from "./lunch";
import { MORE_MAINS } from "./moreMains";
import { SNACKS } from "./snacks";
import { VEGAN_MAINS } from "./veganMains";
import { VEGAN_MORNING } from "./veganMorning";

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
// - a recipe's cuisine and the occasions it suits are not written on the recipe: they are one line each in niches.ts (the Recipes screen's Cuisine and Occasion
//   choices; tests/recipeNiche.test.ts checks every line names a recipe in the book), so a new recipe gets its line there.

// founder 2026-11-16: "we need plenty of recipes because people are restricted with different dietary requirements": four more files of 12, written
// for the diets with the fewest recipes (vegan, gluten-free, vegetarian, fish and halal-friendly).
export const RECIPES: readonly Recipe[] = [...CORE, ...BREAKFAST, ...LUNCH, ...DINNER_WORLD, ...DINNER_HOME, ...SNACKS, ...CHRISTMAS, ...VEGAN_MORNING, ...VEGAN_MAINS, ...GLUTEN_FREE, ...MORE_MAINS];
